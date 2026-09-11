/**
 * MandiSyncService — orchestrates the daily market-price sync.
 *
 * Strategy:
 *   1. data.gov.in Mandi API = PRIMARY current-price source
 *   2. AGMARKNET = FALLBACK current-price source
 *   3. ALL valid Mandi observations are stored in
 *      app_daily_market_history
 *   4. market_prices continues to receive only commodities
 *      supported by the existing PostgreSQL enum.
 *
 * IMPORTANT:
 * app_daily_market_history uses VARCHAR for commodity,
 * so it can store the full Mandi commodity catalogue.
 *
 * CEDA is NEVER used as a current-price source.
 */

const { query } = require('../db');
const mandiProvider = require('../providers/mandi');
const agmarknetProvider = require('../providers/agmarknet');

const CURRENT_SOURCES = [
  'mandi_api',
  'agmarknet_current',
  'government_api'
];

/**
 * These are the commodities supported by the existing
 * PostgreSQL commodity enum.
 *
 * IMPORTANT:
 * This list is NOT used to limit the Mandi catalogue.
 *
 * It is only used when writing to market_prices.
 */
const COMMODITY_ENUM = [
  'TOMATO',
  'ONION',
  'POTATO',
  'WHEAT',
  'RICE',
  'CORN',
  'BRINJAL',
  'LETTUCE',
  'MANGO',
  'APPLE',
  'BANANA',
  'OTHER',
  'BITTER GOURD',
  'BENGAL GRAM(GRAM)(WHOLE)',
  'SOYABEAN',
  'POMEGRANATE'
];

/**
 * CEDA source strings — must never appear as current-price source.
 */
const CEDA_SOURCES = [
  'ceda',
  'ceda_api',
  'ceda_historical',
  'ceda_historical_market_data'
];

/**
 * Hard guard: reject any attempt to write CEDA data as current price.
 */
function assertNotCeda(source, context = '') {
  if (!source) return;

  const s = String(source).toLowerCase();

  if (CEDA_SOURCES.some((c) => s.includes(c))) {
    const msg =
      `[CEDA_HARD_GUARD] Rejected attempt to write CEDA data as current price. ` +
      `source="${source}" context="${context}"`;

    console.error(msg);
    throw new Error(msg);
  }
}

/**
 * Normalize external Mandi grades to AgriConnect's internal grade enum.
 *
 * PostgreSQL accepts:
 *   GRADE_A
 *   GRADE_B
 *   GRADE_C
 *   PREMIUM
 *
 * Unknown external grades become NULL.
 */
function normalizeGrade(grade) {
  if (grade == null || String(grade).trim() === '') {
    return null;
  }

  const normalized = String(grade)
    .trim()
    .toUpperCase();

  const gradeMap = {
    'GRADE A': 'GRADE_A',
    'GRADE B': 'GRADE_B',
    'GRADE C': 'GRADE_C',
    'GRADE_A': 'GRADE_A',
    'GRADE_B': 'GRADE_B',
    'GRADE_C': 'GRADE_C',
    'PREMIUM': 'PREMIUM'
  };

  return gradeMap[normalized] || null;
}

/**
 * Classify coverage state for a commodity based on its latest row.
 */
function classifyCoverage(arrivalDate, fetchedAt) {
  if (!arrivalDate) return 'NOT_FETCHED';

  const now = Date.now();
  const age = now - new Date(arrivalDate).getTime();
  const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;

  if (age <= TWO_DAYS) return 'AVAILABLE';

  return 'UNAVAILABLE';
}

/**
 * Compute freshness label from arrival date.
 */
function freshnessLabel(arrivalDate) {
  if (!arrivalDate) return 'UNKNOWN';

  const now = new Date();
  const arrival = new Date(arrivalDate);
  const diffMs = now - arrival;
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return 'TODAY';
  if (diffDays === 1) return 'YESTERDAY';
  if (diffDays <= 3) return 'RECENT';
  if (diffDays <= 7) return 'STALE';

  return 'OLD';
}

/**
 * Convert Rs./Quintal to Rs./kg.
 */
function pricePerKg(quintalPrice) {
  const raw = parseFloat(quintalPrice);

  if (isNaN(raw) || raw <= 0) return 0;

  return Math.round((raw / 100) * 10) / 10;
}

/**
 * Data-quality validation.
 */
function validateRecord(record, context = '') {
  const type = (t) =>
    typeof t === 'number'
      ? t
      : t == null || String(t).trim() === ''
        ? NaN
        : parseFloat(t);

  const min = type(record.minPrice ?? record.min_price);
  const max = type(record.maxPrice ?? record.max_price);
  const modal = type(record.modalPrice ?? record.modal_price);

  if (!Number.isFinite(min) || min <= 0) {
    return {
      valid: false,
      reason: `non-positive min price (${min}) ${context}`
    };
  }

  if (!Number.isFinite(max) || max <= 0) {
    return {
      valid: false,
      reason: `non-positive max price (${max}) ${context}`
    };
  }

  if (!Number.isFinite(modal) || modal <= 0) {
    return {
      valid: false,
      reason: `non-positive modal price (${modal}) ${context}`
    };
  }

  if (!(min < modal && modal <= max)) {
    return {
      valid: false,
      reason:
        `price ordering violation min=${min} modal=${modal} max=${max} ${context}`
    };
  }

  if (record.arrivalDate || record.arrival_date) {
    const d = new Date(
      record.arrivalDate || record.arrival_date
    );

    if (!Number.isNaN(d.getTime())) {
      const maxFuture =
        Date.now() + 24 * 60 * 60 * 1000;

      if (d.getTime() > maxFuture) {
        return {
          valid: false,
          reason:
            `future arrival date ${d.toISOString()} ${context}`
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Sync AGMARKNET reference data.
 */
async function syncAgmarknetReference(
  provider = agmarknetProvider
) {
  const counts = {};

  const upsertReference = async (
    rows,
    refType,
    sourceIdKey,
    sourceNameKeys
  ) => {
    for (const r of rows || []) {
      const id = String(
        r[sourceIdKey] ?? r.id ?? ''
      );

      const name = String(
        sourceNameKeys
          .map((k) => r[k])
          .find(
            (v) =>
              v != null &&
              String(v).trim() !== ''
          ) ??
          r.id ??
          ''
      ).trim();

      if (!name) continue;

      const details = Object.assign({}, r);
      const agrId = `${refType}:${id}`;

      await query(
        `INSERT INTO agmarknet_reference
         (
           id,
           ref_type,
           agmarknet_id,
           name,
           parent_type,
           parent_id,
           details
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           agmarknet_id = EXCLUDED.agmarknet_id,
           details = EXCLUDED.details,
           synced_at = NOW()`,
        [
          agrId,
          refType,
          id,
          name,
          null,
          null,
          JSON.stringify(details)
        ]
      ).catch(() => {});

      counts[refType] =
        (counts[refType] || 0) + 1;
    }
  };

  const states = await provider.getStates(1, 100);

  if (states.success) {
    const rows = (states.states || []).map(
      (s) => ({
        ...s,
        id: s.id
      })
    );

    await upsertReference(
      rows,
      'state',
      'id',
      ['state_name', 'name']
    );
  }

  const commodities =
    await provider.getCommodities(1000);

  if (commodities.success) {
    const rows = (
      commodities.commodities || []
    ).map((c) => ({
      ...c,
      id: c.id
    }));

    await upsertReference(
      rows,
      'commodity',
      'id',
      [
        'cmdt_name',
        'commodityName',
        'commodity_name',
        'name'
      ]
    );
  }

  return {
    counts,
    statesCount:
      (states.states || []).length,
    commoditiesCount:
      (commodities.commodities || []).length
  };
}

/**
 * ---------------------------------------------------------
 * NEW:
 * Sync ALL current Mandi commodities in one request.
 *
 * This is the important function for the Marketplace.
 *
 * It does NOT depend on COMMODITY_ENUM.
 * Therefore CABBAGE, GRAPES, CARROT, MAIZE, etc.
 * can all enter app_daily_market_history.
 * ---------------------------------------------------------
 */
async function syncAllMandiPrices() {
  const syncId =
    require('crypto').randomUUID();

  console.log(
    '[MandiSync] Starting ALL-COMMODITY Mandi sync...'
  );

  try {
    /**
     * IMPORTANT:
     * Do NOT pass commodity here.
     *
     * This asks the provider for the complete
     * current Mandi dataset.
     */
    const result =
      await mandiProvider.fetchPrices({
        limit: 5000
      });

    if (
      !result ||
      !result.success ||
      !Array.isArray(result.records)
    ) {
      throw new Error(
        'Mandi API returned no usable records'
      );
    }

    console.log(
      `[MandiSync] Mandi API returned ${result.records.length} records`
    );

    /**
     * Validate every record.
     */
    const clean =
      result.records.filter((r) => {
        const validation =
          validateRecord(
            r,
            `data.gov.in/all`
          );

        if (!validation.valid) {
          return false;
        }

        return true;
      });

    console.log(
      `[MandiSync] ${clean.length} records passed validation`
    );

    /**
     * -----------------------------------------------------
     * Store ALL valid records in daily history.
     *
     * This table uses VARCHAR for commodity.
     * Therefore it can store the complete Mandi catalogue.
     * -----------------------------------------------------
     */
    const historyResult =
      await appendToDailyHistory(
        clean,
        'mandi_api',
        syncId
      );

    /**
     * -----------------------------------------------------
     * Also store enum-supported commodities in the existing
     * market_prices table.
     *
     * This keeps all existing AgriConnect functionality
     * working without modifying the PostgreSQL enum.
     * -----------------------------------------------------
     */
    const supportedRecords =
      clean.filter((r) =>
        COMMODITY_ENUM.includes(
          String(r.commodity || '')
            .toUpperCase()
            .trim()
        )
      );

    let marketResult = {
      stored: 0,
      skipped: 0,
      total: supportedRecords.length
    };

    if (supportedRecords.length > 0) {
      marketResult =
        await storeMandiRecords(
          supportedRecords,
          syncId,
          'mandi_api'
        );
    }

    /**
     * Get unique commodity count.
     */
    const uniqueCommodities =
      new Set(
        clean
          .map((r) =>
            String(
              r.commodity || ''
            )
              .trim()
              .toUpperCase()
          )
          .filter(Boolean)
      );

    console.log(
      `[MandiSync] ALL-COMMODITY sync completed. ` +
      `commodities=${uniqueCommodities.size}, ` +
      `history=${historyResult.appended}, ` +
      `market_prices=${marketResult.stored}`
    );

    return {
      syncId,
      source: 'mandi_api',
      totalRecords:
        result.records.length,
      validRecords:
        clean.length,
      uniqueCommodities:
        uniqueCommodities.size,
      historyStored:
        historyResult.appended,
      marketPricesStored:
        marketResult.stored,
      marketPricesSkipped:
        marketResult.skipped,
      completedAt:
        new Date().toISOString()
    };
  } catch (err) {
    console.error(
      '[MandiSync] ALL-COMMODITY sync failed:',
      err.message
    );

    throw err;
  }
}

/**
 * ---------------------------------------------------------
 * Run the daily sync.
 *
 * IMPORTANT:
 * Previously this looped over COMMODITY_ENUM.
 *
 * Now it fetches the complete Mandi dataset once.
 * ---------------------------------------------------------
 */
async function runSyncSweep() {
  const startedAt = new Date();

  try {
    const result =
      await syncAllMandiPrices();

    /**
     * Log successful daily sync.
     */
    try {
      await query(
        `INSERT INTO market_data_sync
         (
           source,
           endpoint,
           parameters,
           record_count,
           sync_status,
           started_at,
           completed_at
         )
         VALUES
         (
           'daily_sync',
           'all-commodities',
           $1,
           $2,
           $3,
           $4,
           NOW()
         )`,
        [
          JSON.stringify({
            syncId: result.syncId,
            allCommodities: true,
            uniqueCommodities:
              result.uniqueCommodities
          }),
          result.historyStored,
          'SUCCESS',
          startedAt
        ]
      );
    } catch (err) {
      console.error(
        '[MandiSync] Failed to log sync run:',
        err.message
      );
    }

    return {
      syncId: result.syncId,
      total:
        result.uniqueCommodities,
      success: 1,
      fallback: 0,
      failed: 0,
      errors: [],
      records:
        result.historyStored,
      startedAt:
        startedAt.toISOString(),
      completedAt:
        new Date().toISOString()
    };
  } catch (err) {
    /**
     * Try AGMARKNET fallback only if the complete
     * Mandi request fails.
     *
     * We preserve the old commodity-by-commodity
     * fallback behavior here.
     */
    console.error(
      '[MandiSync] Primary all-commodity sync failed. ' +
      'Running legacy commodity fallback...'
    );

    let successCount = 0;
    let fallbackCount = 0;
    let failedCount = 0;

    const errors = [];

    const syncId =
      require('crypto').randomUUID();

    for (const commodity of COMMODITY_ENUM) {
      try {
        const result =
          await syncCommodity(
            commodity,
            syncId
          );

        if (
          result.source === 'mandi_api'
        ) {
          successCount++;
        } else if (
          result.source ===
          'agmarknet_current'
        ) {
          fallbackCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        failedCount++;

        errors.push({
          commodity,
          error: error.message
        });

        console.error(
          `[MandiSync] Failed to sync ${commodity}:`,
          error.message
        );
      }
    }

    try {
      await query(
        `INSERT INTO market_data_sync
         (
           source,
           endpoint,
           parameters,
           record_count,
           sync_status,
           started_at,
           completed_at
         )
         VALUES
         (
           'daily_sync',
           'fallback-sweep',
           $1,
           $2,
           $3,
           $4,
           NOW()
         )`,
        [
          JSON.stringify({
            commodities:
              COMMODITY_ENUM.length,
            syncId,
            reason:
              'all-commodity-primary-failed'
          }),
          successCount +
            fallbackCount,
          failedCount > 0
            ? 'PARTIAL'
            : 'SUCCESS',
          startedAt
        ]
      );
    } catch (logError) {
      console.error(
        '[MandiSync] Failed to log fallback sync:',
        logError.message
      );
    }

    return {
      syncId,
      total:
        COMMODITY_ENUM.length,
      success:
        successCount,
      fallback:
        fallbackCount,
      failed:
        failedCount,
      errors,
      startedAt:
        startedAt.toISOString(),
      completedAt:
        new Date().toISOString()
    };
  }
}

/**
 * Fetch current AGMARKNET prices for one commodity.
 *
 * Fallback data only.
 */
async function fetchAgmarknetCurrent(
  commodity,
  { stateName } = {}
) {
  const comm = String(
    commodity || ''
  )
    .toUpperCase()
    .trim();

  if (!comm) return null;

  try {
    const refComm = await query(
      `SELECT agmarknet_id
       FROM agmarknet_reference
       WHERE ref_type = 'commodity'
         AND UPPER(name) = $1
       LIMIT 1`,
      [comm]
    );

    const commodityId =
      refComm.rows[0]?.agmarknet_id;

    if (!commodityId) {
      console.warn(
        `[MandiSync] No AGMARKNET commodity id for ${comm} — skipping fallback`
      );

      return null;
    }

    let stateId = null;
    let stName = stateName;

    if (stName) {
      const refSt = await query(
        `SELECT agmarknet_id
         FROM agmarknet_reference
         WHERE ref_type = 'state'
           AND UPPER(name) = UPPER($1)
         LIMIT 1`,
        [stName]
      );

      stateId =
        refSt.rows[0]?.agmarknet_id ||
        null;
    }

    if (!stateId) {
      const mh = await query(
        `SELECT agmarknet_id
         FROM agmarknet_reference
         WHERE ref_type = 'state'
           AND UPPER(name) = 'MAHARASHTRA'
         LIMIT 1`
      );

      stateId =
        mh.rows[0]?.agmarknet_id ||
        null;

      if (!stateId) return null;

      stName = 'Maharashtra';
    }

    const now = new Date();
    const year = now.getFullYear();

    const month = String(
      now.getMonth() + 1
    ).padStart(2, '0');

    const agResult =
      await agmarknetProvider.getPricesByDate(
        year,
        month,
        stateId,
        commodityId
      );

    if (
      !agResult.success ||
      !agResult.records ||
      agResult.records.length === 0
    ) {
      return null;
    }

    const normalized =
      agResult.records.map((r) => ({
        state: stName,
        district:
          r.district || '',
        market:
          r.market || '',
        commodity: comm,
        variety:
          r.variety || null,
        grade: null,
        arrivalDate:
          normalizeArrivalDate(
            r.arrival_date
          ),
        minPrice:
          pricePerKg(r.min_price),
        maxPrice:
          pricePerKg(r.max_price),
        modalPrice:
          pricePerKg(r.modal_price)
      }));

    const clean =
      normalized.filter(
        (r) =>
          validateRecord(
            r,
            `agmarknet/${comm}`
          ).valid
      );

    return clean.length > 0
      ? {
          records: clean,
          state: stName,
          commodityId
        }
      : null;
  } catch (err) {
    console.error(
      `[MandiSync] AGMARKNET fallback error for ${comm}:`,
      err.message
    );

    return null;
  }
}

/**
 * Sync one commodity.
 *
 * Kept for existing functionality and fallback.
 */
async function syncCommodity(
  commodity,
  syncId
) {
  let primaryResult = null;

  try {
    primaryResult =
      await mandiProvider.fetchPrices({
        commodity,
        limit: 5000
      });

    if (
      primaryResult.success &&
      primaryResult.records.length > 0
    ) {
      const clean =
        primaryResult.records.filter(
          (r) =>
            validateRecord(
              r,
              `data.gov.in/${commodity}`
            ).valid
        );

      if (clean.length > 0) {
        const storeResult =
          await storeMandiRecords(
            clean,
            syncId
          );

        await appendToDailyHistory(
          clean,
          'mandi_api',
          syncId
        );

        return {
          source: 'mandi_api',
          count: storeResult.stored,
          commodity
        };
      }
    }
  } catch (err) {
    console.error(
      `[MandiSync] data.gov.in failed for ${commodity}:`,
      err.message
    );
  }

  try {
    const ag =
      await fetchAgmarknetCurrent(
        commodity
      );

    if (
      ag &&
      ag.records.length > 0
    ) {
      const mapped =
        ag.records.map((r) => ({
          state: r.state,
          district: r.district,
          market: r.market,
          commodity: r.commodity,
          variety: r.variety,
          grade: r.grade,
          arrivalDate:
            r.arrivalDate,
          minPrice:
            r.minPrice,
          maxPrice:
            r.maxPrice,
          modalPrice:
            r.modalPrice
        }));

      const storeResult =
        await storeMandiRecords(
          mapped,
          syncId,
          'agmarknet_current'
        );

      await appendToDailyHistory(
        mapped.map((r) => ({
          state: r.state,
          district: r.district,
          market: r.market,
          commodity: r.commodity,
          variety: r.variety,
          grade: r.grade,
          arrival_date:
            r.arrivalDate,
          min_price:
            r.minPrice,
          max_price:
            r.maxPrice,
          modal_price:
            r.modalPrice
        })),
        'agmarknet_current',
        syncId
      );

      return {
        source:
          'agmarknet_current',
        count:
          storeResult.stored,
        commodity,
        state:
          ag.state
      };
    }
  } catch (err) {
    console.error(
      `[MandiSync] AGMARKNET fallback failed for ${commodity}:`,
      err.message
    );
  }

  return {
    source: 'none',
    count: 0,
    commodity
  };
}

/**
 * Compute price_per_kg from modal_price.
 *
 * These sources provide Rs./quintal:
 *   mandi_api
 *   historical_dataset
 *   agmarknet_historical
 *   government_api
 *   seed_demo
 *
 * agmarknet_current is already Rs./kg.
 */
function computePricePerKg(
  modalPrice,
  source
) {
  const raw =
    parseFloat(modalPrice);

  if (
    isNaN(raw) ||
    raw <= 0
  ) {
    return null;
  }

  const quintalSources = [
    'mandi_api',
    'historical_dataset',
    'agmarknet_historical',
    'government_api',
    'seed_demo'
  ];

  if (
    quintalSources.includes(source)
  ) {
    return (
      Math.round(
        (raw / 100) * 100
      ) / 100
    );
  }

  return (
    Math.round(raw * 100) / 100
  );
}

/**
 * Store records into market_prices.
 *
 * IMPORTANT:
 * market_prices uses the existing PostgreSQL
 * commodity enum.
 *
 * Therefore only enum-supported records should
 * be passed here.
 */
async function storeMandiRecords(
  records,
  syncId,
  sourceOverride = 'mandi_api'
) {
  let stored = 0;
  let skipped = 0;

  for (const r of records) {
    const source =
      sourceOverride ||
      'mandi_api';

    assertNotCeda(
      source,
      `storeMandiRecords:${r.commodity}`
    );

    const pricePerKg =
      computePricePerKg(
        r.modalPrice ??
          r.modal_price,
        source
      );

    const normalizedGrade =
      normalizeGrade(r.grade);

    try {
      await query(
        `INSERT INTO market_prices
         (
           state,
           district,
           market,
           commodity,
           variety,
           grade,
           arrival_date,
           min_price,
           max_price,
           modal_price,
           price_per_kg,
           source,
           fetched_at,
           data_freshness,
           sync_id
         )
         VALUES
         (
           $1,
           $2,
           $3,
           $4,
           $5,
           $6,
           $7,
           $8,
           $9,
           $10,
           $11,
           $12,
           NOW(),
           $13,
           $14
         )
         ON CONFLICT
         (
           state,
           district,
           market,
           commodity,
           arrival_date
         )
         DO UPDATE SET
           min_price =
             EXCLUDED.min_price,
           max_price =
             EXCLUDED.max_price,
           modal_price =
             EXCLUDED.modal_price,
           price_per_kg =
             EXCLUDED.price_per_kg,
           variety =
             COALESCE(
               EXCLUDED.variety,
               market_prices.variety
             ),
           grade =
             COALESCE(
               EXCLUDED.grade,
               market_prices.grade
             ),
           source =
             EXCLUDED.source,
           fetched_at =
             NOW(),
           data_freshness =
             'fresh',
           sync_id =
             EXCLUDED.sync_id`,
        [
          r.state,
          r.district,
          r.market,
          r.commodity,
          r.variety || '',
          normalizedGrade,
          r.arrivalDate,
          r.minPrice,
          r.maxPrice,
          r.modalPrice,
          pricePerKg,
          source,
          'fresh',
          syncId
        ]
      );

      stored++;
    } catch (err) {
      skipped++;

      if (skipped <= 5) {
        console.warn(
          `[MandiSync] Store error (${r.commodity}):`,
          err.message
        );
      }
    }
  }

  return {
    stored,
    skipped,
    total:
      records.length
  };
}

/**
 * Append successful observations to
 * app_daily_market_history.
 *
 * This table intentionally accepts arbitrary
 * commodity names because its commodity column
 * is VARCHAR.
 */
async function appendToDailyHistory(
  records,
  source,
  syncId
) {
  let appended = 0;

  assertNotCeda(
    source,
    'appendToDailyHistory'
  );

  const priceDate =
    new Date()
      .toISOString()
      .slice(0, 10);

  const pick = (
    r,
    ...keys
  ) => {
    for (const k of keys) {
      if (
        r[k] != null &&
        r[k] !== ''
      ) {
        return r[k];
      }
    }

    return null;
  };

  for (const r of records) {
    const state =
      pick(r, 'state') || '';

    const district =
      pick(r, 'district') ||
      null;

    const market =
      pick(r, 'market') || '';

    const commodity =
      String(
        pick(
          r,
          'commodity'
        ) || ''
      )
        .toUpperCase()
        .trim();

    const variety =
      pick(r, 'variety') || '';

    const grade =
      normalizeGrade(
        pick(r, 'grade')
      );

    const arrival =
      pick(
        r,
        'arrival_date',
        'arrivalDate'
      ) || priceDate;

    const minPrice =
      pick(
        r,
        'min_price',
        'minPrice'
      );

    const maxPrice =
      pick(
        r,
        'max_price',
        'maxPrice'
      );

    const modalPrice =
      pick(
        r,
        'modal_price',
        'modalPrice'
      );

    if (
      !market ||
      !commodity
    ) {
      continue;
    }

    if (
      minPrice == null ||
      maxPrice == null ||
      modalPrice == null
    ) {
      continue;
    }

    const pricePerKg =
      computePricePerKg(
        modalPrice,
        source
      );

    try {
      await query(
        `INSERT INTO app_daily_market_history
         (
           state,
           district,
           market,
           commodity,
           variety,
           grade,
           price_date,
           min_price,
           max_price,
           modal_price,
           price_per_kg,
           arrivals,
           source,
           source_record_id,
           sync_id
         )
         VALUES
         (
           $1,
           $2,
           $3,
           $4,
           $5,
           $6,
           $7,
           $8,
           $9,
           $10,
           $11,
           $12,
           $13,
           $14,
           $15
         )
         ON CONFLICT ON CONSTRAINT
           uq_admh_identity
         DO UPDATE SET
           min_price =
             EXCLUDED.min_price,
           max_price =
             EXCLUDED.max_price,
           modal_price =
             EXCLUDED.modal_price,
           price_per_kg =
             EXCLUDED.price_per_kg,
           arrivals =
             EXCLUDED.arrivals,
           fetched_at =
             NOW()`,
        [
          state,
          district,
          market,
          commodity,
          variety,
          grade,
          arrival,
          minPrice,
          maxPrice,
          modalPrice,
          pricePerKg,
          pick(r, 'arrivals') ||
            null,
          source,
          pick(
            r,
            'source_record_id',
            'sourceRecordId'
          ) || null,
          syncId
        ]
      );

      appended++;
    } catch (err) {
      console.warn(
        `[MandiSync] History error (${commodity}):`,
        err.message
      );
    }
  }

  return {
    appended
  };
}

/**
 * Normalize various date formats to YYYY-MM-DD.
 */
function normalizeArrivalDate(
  dateStr
) {
  if (!dateStr) {
    return new Date()
      .toISOString()
      .slice(0, 10);
  }

  /**
   * DD/MM/YYYY
   */
  if (
    String(dateStr).includes('/')
  ) {
    const parts =
      String(dateStr).split('/');

    if (
      parts.length === 3
    ) {
      return `${parts[2]}-${parts[1].padStart(
        2,
        '0'
      )}-${parts[0].padStart(
        2,
        '0'
      )}`;
    }
  }

  /**
   * YYYY-MM-DD
   */
  if (
    String(dateStr).includes('-') &&
    String(dateStr).split('-')[0]
      .length === 4
  ) {
    return String(
      dateStr
    ).slice(0, 10);
  }

  const parsed =
    new Date(dateStr);

  if (
    !Number.isNaN(
      parsed.getTime()
    )
  ) {
    return parsed
      .toISOString()
      .slice(0, 10);
  }

  return new Date()
    .toISOString()
    .slice(0, 10);
}

/**
 * Exports
 */
module.exports = {
  runSyncSweep,
  syncAllMandiPrices,
  syncCommodity,
  syncAgmarknetReference,
  fetchAgmarknetCurrent,
  storeMandiRecords,
  appendToDailyHistory,
  assertNotCeda,
  classifyCoverage,
  freshnessLabel,
  pricePerKg,
  computePricePerKg,
  normalizeArrivalDate,
  normalizeGrade,
  validateRecord,
  COMMODITY_ENUM,
  CEDA_SOURCES,
  CURRENT_SOURCES
};