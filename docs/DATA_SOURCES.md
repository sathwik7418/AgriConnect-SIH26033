# Data Sources — AgriConnect (SIH26033)

Where every market number comes from, which table it lands in, and how to
interpret the badges **LIVE / HISTORICAL / DEMO**.

| Badge | Meaning | Trust level |
|---|---|---|
| **LIVE** | Fetched from an official Government of India API at sync time | Real, current |
| **HISTORICAL** | Real records imported from AGMARKNET into PostgreSQL | Real, dated |
| **DEMO** | Seed/synthetic data for development | **Never** present as government data |

> Rule: DEMO/seed data must never be displayed or reported as real government data.
> Provenance columns (`source`, `data_period`) exist to enforce this.

---

## 1. Mandi API (data.gov.in) → `market_prices` — LIVE

- Provider: `backend/providers/mandi.js`
- Endpoint: `https://api.data.gov.in` + resource `9ef84268-d588-465a-a308-a864a43d0070`
  ("Current Daily Price of Various Commodities from Various Markets (Mandi)",
  Ministry of Agriculture & Farmers Welfare / Directorate of Marketing & Inspection)
- Trigger: `POST /api/market-data/sync`, or on-demand via market-price endpoints
- Writes to: `market_prices` with provenance (`source`, `data_freshness`,
  `source_record_id`, `sync_id`)
- Config: `MANDI_API_KEY`, `MANDI_RESOURCE_ID` in `backend/.env`
- Current DB state: ~200 rows (mix of `government_api` and `mandi_api` sources)

## 2. Variety-wise API (data.gov.in) → `market_prices` — LIVE

- Provider: `backend/providers/variety.js`
- Resource: variety-level pricing dataset on data.gov.in
  (`VARIETY_RESOURCE_ID`; historically `35985678-0d79-46b4-9ed6-6f13308a1d24`)
- Writes to: same `market_prices` table, provenance-tagged
- Config: `VARIETY_API_KEY`, `VARIETY_RESOURCE_ID`

Both data.gov.in APIs are rate-limited and occasionally return empty pages;
the backend degrades gracefully to cached/DEMO data when keys are missing.

## 3. Historical AGMARKNET 2.0 API → `historical_market_prices` — HISTORICAL

- Provider/client: `backend/providers/agmarknet.js`
- Public API base: `https://api.agmarknet.gov.in/v1` (no key required)
  - `GET /location/state` — states + districts
  - `GET /commodities?page_size=500` — commodity catalog (~605 items)
  - `GET /prices-and-arrivals/date-wise/specific-commodity?year=&month=&stateId=&commodityId=`
    → nested shape `markets[] → dates[] → data[]` (prices live in `data[]`,
    one entry per variety)
- Importer: `backend/import-bg.js` — resumable, idempotent
  (`ON CONFLICT DO NOTHING`), throttled (~1 req/s) with exponential backoff
  because the API returns HTTP 429 under bursts.
- Run it:

  ```bash
  cd backend
  nohup node import-bg.js > import-bg.log 2>&1 &
  tail -f import-bg.log     # progress lines every 50 tasks
  ```

### Verified database status (2026-08-26)

```sql
SELECT COUNT(*) total, MIN(arrival_date)::date first_date,
       MAX(arrival_date)::date last_date
FROM historical_market_prices;
```

| Metric | Value |
|---|---|
| Total real records | **426,933** |
| Earliest date | **2008-01-01** |
| Latest date | **2021-06-30** |
| Provenance | `agmarknet_historical` / `agmarknet_2008_2022` |

Year distribution at snapshot time:

```
2008: 18,618   2012: 24,773   2016: 22,833   2020: 50,460
2009: 16,710   2013: 25,831   2017: 34,976   2021: 25,170
2010: 28,564   2014: 25,969   2018: 46,942   2022: (not yet reached)
2011: 32,319   2015: 26,567   2019: 47,201
```

⚠️ **Coverage is NOT complete.** The last importer run stopped around task
150/32,400 while importing ONION × Uttar Pradesh (its final logged month was
mid-2021). Re-run `import-bg.js` to continue; completed months are skipped via
the unique constraint. Do not claim full 2008–2022 coverage until PostgreSQL
confirms it.

Import priority order (by design): ONION, POTATO, TOMATO, WHEAT, PADDY across
UP, Maharashtra, MP, Karnataka, Gujarat, Andhra Pradesh first; remaining
commodities/states follow automatically.

## What NOT to do

- ❌ Insert hand-written or synthetic rows into `historical_market_prices`
- ❌ Copy LIVE rows backwards in time to "fill" history
- ❌ Commit CSV/JSON dumps of these datasets to Git (data lives in PostgreSQL)
- ❌ Present DEMO seed numbers as mandi/AGMARKNET data in UI or reports
