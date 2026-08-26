# SETUP.md — AgriConnect (SIH26033)

Team setup guide. Follow these steps in order.

## Requirements

- **Node.js** ≥ 18 (Node 20+ recommended)
- **npm** (bundled with Node)
- **PostgreSQL** ≥ 14, running locally
- **Git**

## Database — important

AgriConnect uses **its own PostgreSQL database: `sih26033`**.

> ⚠️ Do **NOT** point `DATABASE_URL` at any other project's database
> (e.g., VidyGuideAI). Each project must keep its database fully separate.
> All schema objects live inside `sih26033` only.

## 1. Clone

```bash
git clone https://github.com/<org-or-user>/SIH26033.git
cd SIH26033
```

## 2. Install dependencies

```bash
cd backend  && npm install
cd frontend && npm install
```

## 3. Create the PostgreSQL database

```bash
createdb sih26033
psql -d sih26033 -f backend/setup-db.sql                        # tables + enums + indexes
psql -d sih26033 -f backend/migrations/002_data_provenance.sql  # provenance columns + view
```

Verify:

```bash
psql -d sih26033 -c "\dt"   # should list users, produce_listings, market_prices,
                            # historical_market_prices, forecasts, etc.
```

## 4–5. Configure environment

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` and fill in **your local values**:

| Variable | What to put |
|---|---|
| `DATABASE_URL` | e.g. `postgresql://postgres:PASSWORD@localhost:5432/sih26033` |
| `JWT_SECRET` | any long random string (≥ 16 chars) |
| `MANDI_API_KEY` / `VARIETY_API_KEY` | free key from <https://data.gov.in/> (register → My Account → API Key) |
| `MANDI_RESOURCE_ID` / `VARIETY_RESOURCE_ID` | resource IDs from the dataset pages on data.gov.in |
| `ROUTING_*` | optional — logistics route cost estimation |

Without data.gov.in keys the app still runs; market-price endpoints degrade gracefully to cached/DEMO data.

**`.env` must NEVER be committed. It is git-ignored — keep it that way.**

## 6. Start backend

```bash
cd backend
npm run dev        # node --watch server.js → http://localhost:5001
```

## 7. Start frontend

```bash
cd frontend
npm run dev        # vite → http://localhost:5173
```

(Alternative: `./start.sh` at repo root starts both at once.)

## 8. Verify health

```bash
curl http://localhost:5001/health
# {"status":"ok","database":"connected", ...}

curl http://localhost:5001/api/config/status
# prints which integrations are CONFIGURED / MISSING
```

Then open <http://localhost:5173>.

## 9. Tests

There is no automated test suite yet. For now verify manually:

```bash
curl http://localhost:5001/health
cd frontend && npm run build     # production build succeeds
```

Seed demo accounts (created by `backend/seed.js`, DEMO data only):

- Farmer: `ramesh@farmer.com` / `password123`
- Buyer: `bigbasket@buyer.com` / `password123`
- Admin: `admin@sih26033.com` / `password123`

## Optional: historical AGMARKNET data

The historical importer pulls real records from the public AGMARKNET 2.0 API into
`historical_market_prices`. It is throttled, resumable and idempotent:

```bash
cd backend
nohup node import-bg.js > import-bg.log 2>&1 &
tail -f import-bg.log
```

Check progress (read-only):

```sql
SELECT COUNT(*), MIN(arrival_date)::date, MAX(arrival_date)::date
FROM historical_market_prices;
```

Details and caveats: [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ECONNREFUSED` on :5432 | PostgreSQL not running (`brew services start postgresql` / `sudo service postgresql start`) |
| Backend boots then exits | Check `DATABASE_URL` in `backend/.env`; run config report via `/api/config/status` after boot |
| Market prices empty | data.gov.in keys missing → app falls back to DEMO; add keys for LIVE data |
| CORS errors in browser | Ensure `CORS_ORIGIN=http://localhost:5173` matches your Vite port |
