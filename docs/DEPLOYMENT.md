# Deploying Pitwall IQ (website)

Pitwall IQ is a **website**: a Next.js frontend and a FastAPI backend. Deploy them
as two services. There is no desktop or mobile app in scope.

## Overview

```
[ Browser ] → [ Frontend (Next.js) ]  → NEXT_PUBLIC_API_BASE_URL → [ Backend (FastAPI) ] → OpenF1 / FastF1 / Jolpica
```

The only wiring between them is one environment variable on the frontend:
`NEXT_PUBLIC_API_BASE_URL` = the public URL of your deployed backend.

---

## Run locally

**Backend** (Python 3.10+):
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
python3 -m pip install -r requirements.txt
uvicorn app.main:app --port 8000          # real data by default
```

**Frontend** (Node 18+):
```bash
cd frontend
npm install
npm run dev                                # http://localhost:3000
```

Health check: `curl http://localhost:8000/api/health` → `{"ok":true,...}`.

---

## Deploy the backend (FastAPI)

Any Python host works (Fly.io, Render, Railway, a VM, a container platform).

- **Start command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Python:** 3.10+ (`pip install -r backend/requirements.txt`)
- **Health check path:** `/api/health` (or `/health`)
- **Environment:** see `.env.example`. Nothing is required for open data. Set
  `PITWALL_IQ_CORS` to your frontend's URL so the browser can call the API.
- **Optional:** `ANTHROPIC_API_KEY` (polishes Ask wording only) — server-side, never
  exposed to the browser.

Example Dockerfile start:
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

> **Cache:** real sessions are cached under `PITWALL_IQ_CACHE_DIR`. On ephemeral
> hosts this is fine (it just re-fetches). For a persistent cache, mount a volume.

---

## Deploy the frontend (Next.js)

Any Node host (Vercel, Netlify, a container, a static-ish Node server).

- **Build:** `npm run build`  **Start:** `npm run start`
- **Required env:** `NEXT_PUBLIC_API_BASE_URL=https://your-backend.example.com`
  (inlined at build time — rebuild if you change it).

On Vercel: set the project root to `frontend/`, add `NEXT_PUBLIC_API_BASE_URL`, deploy.

---

## Demo vs real data

- **Real data (default):** just run the backend normally. It uses OpenF1 → FastF1 →
  Jolpica by era, caches results, and shows an **honest error with retry** if every
  source fails. It never silently shows demo data.
- **Explicit demo mode (offline/dev):** `PITWALL_IQ_MOCK_MODE=true` (or `make demo`).
  The UI clearly labels it "Demo data". Do not enable this in production.

## Clearing the cache

- UI: **Data** tab → **Clear cache**.
- API: `GET /api/session/cache/clear` (optionally `?year=&gp=&session=`).

## Troubleshooting data sources

- Open the **Data** tab → **Check now** to probe OpenF1 / FastF1 / Jolpica / cache.
- If a session fails to load, the app shows which sources were attempted and whether
  the failure is retryable. Common causes: outbound network/egress blocks, an
  upstream outage, or a session that doesn't exist for that year.
- `GET /api/health/data-sources` returns the same reachability report as JSON.
