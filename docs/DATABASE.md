# Database Architecture — AgriConnect (SIH26033)

PostgreSQL database: **`sih26033`** — used exclusively by AgriConnect.
Never point another project at it, and never point AgriConnect at another project's database.

Schema sources of truth:

- `backend/setup-db.sql` — full initial DDL (enums + tables + indexes)
- `backend/migrations/002_data_provenance.sql` — additive provenance columns
- Live DB is authoritative if docs drift; verify with `\d <table>`

## Entity overview

```
users ──1:1── farmer_profiles ──1:N── produce_listings ──┐
  │                                                      ├── orders
  ├─────1:1── buyer_profiles ────1:N── buyer_demands ────┘      │
  │                                                             └─ order_items
  └─────1:1── consumer_profiles

market_prices            (LIVE mandi/variety data)
historical_market_prices (HISTORICAL AGMARKNET imports)
market_data_sync         (sync audit log)
forecasts                (price/demand forecasts)
routes                   (logistics estimates)
impact_metrics           (platform impact numbers)
```

## Core marketplace tables

| Table | Purpose | Key relationships |
|---|---|---|
| `users` | Auth identity (email+password hash, role enum FARMER/FPO/BUYER/CONSUMER/ADMIN) | 1:1 into each profile table |
| `farmer_profiles` | Seller side: name, FPO, land area, crops[], location | `user_id` → users; owns listings |
| `fpo_profiles` | Farmer Producer Org profile (currently unused by UI, 0 rows) | `user_id` → users |
| `buyer_profiles` | Buyer org info, capacity | owns demands & orders |
| `consumer_profiles` | End-consumer preferences (JSONB) | — |
| `produce_listings` | Produce offered: commodity (enum), variety, grade, qty, price, location, status enum ACTIVE/INACTIVE/SOLD | `farmer_id` → farmer_profiles |
| `buyer_demands` | Produce wanted: qty, target price, delivery date/place, status enum ACTIVE/MATCHED/COMPLETED/CANCELLED | `buyer_id` → buyer_profiles |
| `orders` | Transaction: quantity, final price, transport cost, net realization, status enum PENDING→…→COMPLETED/CANCELLED | `listing_id`, `demand_id`, `buyer_id` |
| `order_items` | Line items for an order (schema exists; not yet populated by app flows) | `order_id` → orders |

## Market data tables

### `market_prices` — current/LIVE observations

Columns include: state, district, market, commodity (enum), variety, grade,
arrival_date, min/max/modal price, plus provenance:

- `source` (`government_api`, `mandi_api`, …), `data_freshness`,
  `source_record_id`, `sync_id`
- `validation_status` (VALID/INVALID/SUSPICIOUS) + `validation_error`
- UNIQUE `(state, district, market, commodity, arrival_date)`

Populated by `POST /api/market-data/sync` using the Mandi/Variety providers.

### `historical_market_prices` — HISTORICAL AGMARKNET imports

Full column list (verified live):

```
id, state, district, market, commodity, variety, grade, arrival_date,
min_price, max_price, modal_price,
source, fetched_at, data_period, data_source, source_record_id, location
```

- UNIQUE constraint `(state, district, market, commodity, arrival_date)`
  → the importer uses `ON CONFLICT DO NOTHING`, making re-runs safe/idempotent.
- Unlike `market_prices`, `commodity`/`grade` here are free-text VARCHARs
  (real-world values like `PADDY(COMMON)` don't fit the app-side enum).
- Provenance convention: `source='agmarknet_historical'`,
  `data_period='agmarknet_2008_2022'`.
- **Only real AGMARKNET API records may be inserted here. Never fabricate rows.**

### Supporting tables

- `market_data_sync` — audit trail per sync run (endpoint, params, counts, status).
- `forecasts` — per commodity/location/horizon; `model_version` enum
  `DEMO | SYNTHETIC | REAL`. Current rows are all `DEMO`. (Note: the
  `data_source` column from migration 002 is not present on this table yet.)
- `routes` — logistics route estimates (origin, destination, km, time, cost, vehicle).
- `impact_metrics` — metric_type/value/unit over a period window.

## Views

None currently exist (the `v_supply_demand_summary` view defined in migration 002
has not been applied to this database yet). Supply/demand summaries are computed
by `backend/services/supplyDemand.js` at request time.

## Row counts snapshot (2026-08-26)

| Table | Rows |
|---|---|
| users | 13 |
| farmer_profiles | 5 |
| buyer_profiles | 4 |
| consumer_profiles | 1 |
| produce_listings | 14 |
| buyer_demands | 10 |
| orders | 5 |
| order_items | 0 |
| market_prices | 200 |
| historical_market_prices | see docs/DATA_SOURCES.md (grows during imports) |
| forecasts | 8 (all DEMO) |
| routes / impact_metrics / market_data_sync | 8 / 8 / 7 |

Marketplace rows above are **DEMO seeds** (`backend/seed.js`) for development.
