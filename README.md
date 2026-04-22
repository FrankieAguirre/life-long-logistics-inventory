# Life-Long Logistics — Hospital Inventory

React (Vite) frontend plus a **Node HTTP API** in `backend/server.js`. Use **in-memory** storage for instant setup, or **MySQL** with the normalized schema in **`Updated-Final-DB/`** (included in this repo).

## Quick start (teammates)

You only need **Node.js (LTS)** and **npm**. No database install required.

```bash
git clone https://github.com/FrankieAguirre/life-long-logistics-inventory.git
cd life-long-logistics-inventory
npm install
npm start
```

The first `npm start` creates a `.env` from `.env.example` if you do not already have one. Then it runs the UI and API together.

- **App:** http://localhost:5173/  
- **Demo login:** `frankie` / `demo1234`  

That is one clone and **two commands** after that (`npm install`, `npm start`).

## Optional: full MySQL dataset

1. Install MySQL 8.x and start it (or `npm run mysql:start` if you use the bundled helper scripts).
2. In `.env`, set `USE_MYSQL=true` and adjust `DB_*` if needed.
3. Run once: `npm run db:seed` (applies **`Updated-Final-DB/`** schema + seeds + demo user).
4. `npm start` (or `npm run dev:full`).

## Environment reference

| Variable | Purpose |
|----------|---------|
| `VITE_USE_LIVE_API` | `true` (default): browser calls `/api` through the Vite proxy. `false`: mock auth + `src/data/medicines.js`. |
| `USE_MYSQL` | `true`: real DB via `mysql2`. `false`: in-memory API storage (default in `.env.example`). |
| `PORT` | API port (default **4000**). |
| `DB_*` | MySQL connection when `USE_MYSQL=true`. |

### Manual `.env`

If you prefer not to use `npm start`, copy env and run dev:

```bash
cp .env.example .env
npm install
npm run dev:full
```

- **UI:** http://localhost:5173/ — Vite proxies `/api` → `http://127.0.0.1:4000`  
- **API:** http://127.0.0.1:4000/

```bash
curl http://127.0.0.1:4000/api/health
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Ensures `.env` exists, then Vite + API (recommended). |
| `npm run dev` | Vite only. |
| `npm run dev:api` | API only (`node backend/server.js`). |
| `npm run dev:full` | Vite + API (expects `.env` already). |
| `npm run db:seed` | Apply normalized schema + seed (MySQL). |
| `npm run mysql:start` / `mysql:stop` | Local MySQL helper scripts (if configured). |
| `npm run build` | Production build of the React app. |

## API overview

- `GET /api/health` — service status (and DB ping in MySQL mode)  
- `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`  
- `GET /api/inventory` — query: `search`, `category`, `status`, `page`, `pageSize`  
- `GET /api/inventory/summary` — dashboard metrics + `categories` list  
- `POST /api/inventory`, `PUT /api/inventory/:id`, `DELETE /api/inventory/:id` — **backend** and **dba** roles only  

Details: `docs/team_integration_contract.md`. Collaboration: `CONTRIBUTING.md`.

## Frontend API client

`src/services/apiClient.js` — shared `authApi` / `inventoryApi` and `setAuthToken` for Bearer auth.

## Legacy SQL note

`docs/sql/schema.sql` described the earlier flat `medications` table. The integrated app uses **`Updated-Final-DB/schema`** when `USE_MYSQL=true`.
