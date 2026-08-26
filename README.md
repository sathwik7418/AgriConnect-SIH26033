# AgriConnect — SIH26033

> **Problem statement (SIH26033):** Multiple intermediaries reduce farmers' earnings and increase consumer prices.

AgriConnect is a farmer-to-buyer marketplace that shortens the agricultural supply chain: farmers and FPOs list produce directly, buyers post demands, orders are matched with transparent logistics costs, and both sides see real government mandi price data plus price forecasting.

---

## Current Status (honest summary)

| Area | Status | Notes |
|---|---|---|
| Auth (register/login, JWT) | Working | bcryptjs + JWT; roles FARMER/FPO/BUYER/CONSUMER/ADMIN |
| Marketplace listings & demands | Working | CRUD via REST API |
| Orders | Basic | Create + status updates; order_items table exists but unused by UI |
| Market prices (LIVE) | Working | data.gov.in Mandi API + Variety API, provenance-tagged |
| Historical AGMARKNET import | **In progress** | Real records from 2008-01-01 onward; importer is resumable — see `docs/DATA_SOURCES.md` for current DB coverage. Do not assume full 2008–2022 coverage without verifying in PostgreSQL |
| Forecasting | DEMO | `forecasts.model_version = DEMO`; falls back to historical averages only when rows exist |
| Logistics routes | Basic | Route cost estimation via configurable provider (OpenRouteService supported) |
| Impact metrics | Basic | Stored/served; derived from demo-scale data |
| Tests | **Not yet present** | No automated test suite in repo yet |

Terminology used across the app and docs:

- **LIVE** — fetched from a government API at request/sync time.
- **HISTORICAL** — real AGMARKNET records imported into PostgreSQL (`source = agmarknet_historical`).
- **DEMO** — seeded/illustrative data. Demo data must never be presented as government data.

---

## Architecture

```
┌──────────────┐   HTTP/JSON   ┌─────────────────┐   SQL   ┌──────────────────┐
│   Frontend   │ ────────────► │     Backend      │ ──────► │   PostgreSQL     │
│ React + Vite │               │ Node.js Express  │         │    sih26033      │
│  port 5173   │ ◄──────────── │    port 5001     │ ◄────── │                  │
└──────────────┘               └───────┬──────────┘         └──────────────────┘
                                       │ providers/
                                       ├─ mandi.js      → data.gov.in Mandi API (LIVE)
                                       ├─ variety.js    → data.gov.in Variety API (LIVE)
                                       ├─ agmarknet.js  → api.agmarknet.gov.in (HISTORICAL)
                                       ├─ historical.js → CSV/JSON/API bulk import
                                       └─ routing.js    → OpenRouteService (logistics)
```

## Technology Stack

- **Frontend:** React 18, Vite 6, React Router 6, Tailwind CSS 3, Recharts, Axios, lucide-react
- **Backend:** Node.js (CommonJS), Express 5, pg (node-postgres), JWT auth, helmet, cors, morgan
- **Database:** PostgreSQL (database `sih26033`) — schema in `backend/setup-db.sql`, provenance migration in `backend/migrations/002_data_provenance.sql`
- **Data sources:** data.gov.in APIs (mandi + variety), AGMARKNET 2.0 API (historical), optional routing provider
- **ORM note:** `backend/prisma/schema.prisma` exists but the running backend uses raw SQL via `pg`. Prisma client output goes to `backend/generated/` (gitignored).

## Repositories / Layout

```
frontend/          React SPA (pages: Dashboard, FarmerDashboard, BuyerDashboard,
                   Marketplace, MarketPrices, Logistics, Impact, Login, Register)
backend/
  server.js        Express app + all REST endpoints
  db.js            pg Pool (reads DATABASE_URL)
  config.js        Startup config validation report
  seed.js          Demo seed data (DEMO — not real market data)
  setup-db.sql     Full DDL (tables/enums/indexes)
  migrations/      Additive migrations (provenance columns, views)
  providers/       External data source clients (see above)
  services/        Business logic (supply-demand matching)
  import-bg.js     Resumable historical AGMARKNET importer
docs/              Database & data-source documentation
```

## Key API Endpoints (port 5001)

- `GET  /health` — liveness + DB check
- `POST /api/auth/register` · `POST /api/auth/login`
- `GET/POST /api/listings` (+ commodity/farmer filters, auth'd updates)
- `GET/POST /api/demands`
- `POST /api/orders` · `PUT /api/orders/:id/status` · `GET /api/orders/buyer/:id`
- `GET  /api/market-prices` · `GET /api/market-prices/latest`
- `POST /api/market-data/sync` — pull latest LIVE mandi data into PostgreSQL
- `GET  /api/forecasts` — DEMO model; uses HISTORICAL rows when available
- `GET  /api/supply-demand/summary` · `GET /api/supply-demand/match/:commodity`
- `GET/POST /api/routes` · `GET /api/impact` · `GET /api/dashboard/stats`

## Government Data Sources

See [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) for the full picture:

1. **Mandi API** (data.gov.in) → `market_prices` (LIVE)
2. **Variety-wise API** (data.gov.in) → `market_prices` (LIVE)
3. **AGMARKNET 2.0 API** (api.agmarknet.gov.in) → `historical_market_prices` (HISTORICAL)

Historical imports are performed by `backend/import-bg.js` (resumable, idempotent, throttled). The dataset lives in PostgreSQL — **never commit data dumps to Git**.

## Development Setup

See [`SETUP.md`](SETUP.md) for the step-by-step guide.

Quick start:

```bash
# 1) database (once)
createdb sih26033
psql -d sih26033 -f backend/setup-db.sql
psql -d sih26033 -f backend/migrations/002_data_provenance.sql

# 2) env
cp backend/.env.example backend/.env   # then fill values locally

# 3) run
cd backend  && npm install && npm run dev     # :5001
cd frontend && npm install && npm run dev     # :5173

# health check
curl http://localhost:5001/health
```

## Testing

No automated test suite exists yet (tracked in backend `package.json`: `npm test` exits with "no test specified"). Manual verification today:

```bash
curl http://localhost:5001/health                       # backend up + DB reachable
curl http://localhost:5001/api/config/status            # integration report
cd frontend && npm run build                            # frontend builds cleanly
```

Adding a test suite is a welcome first contribution — see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Short version: branch from `main` (`feature/<name>` or `bugfix/<name>`), open a Pull Request.

**Hard rules:**
- NEVER commit `.env`, API keys, or secrets (`.env.example` placeholders only).
- NEVER run destructive DB commands against shared databases (`npm run db:reset` drops the local dev database — use with care).
- NEVER force-push `main`.
