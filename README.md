# Life-Long Logistics — Hospital Inventory

React (Vite) frontend plus a **Node HTTP API** in `backend/server.js`. Inventory can be backed by **MySQL** using the normalized schema and seeds in **`Updated-Final-DB/`** (included in this repo), or run **in-memory** for quick demos without a database.

## Prerequisites

- Node.js (LTS) and npm  
- MySQL 8.x (only if `USE_MYSQL=true` in `.env`)

## Setup

### 1) Environment

```bash
cp .env.example .env
```

Important variables:

| Variable | Purpose |
|----------|---------|
| `VITE_USE_LIVE_API` | `true` (default): browser calls `/api` through the Vite proxy. `false`: mock auth + `src/data/medicines.js`. |
| `USE_MYSQL` | `true`: real DB via `mysql2`. `false`: in-memory API storage. |
| `PORT` | API port (default **4000**). |
| `DB_*` | MySQL connection when `USE_MYSQL=true`. |

### 2) Install

```bash
npm install
```

### 3) Database (MySQL mode only)

With `USE_MYSQL=true`, create schema and load **Updated-Final-DB** seeds (locations, medications, lots, balances) plus demo user **`frankie` / `demo1234`**:

```bash
npm run db:seed
```

Schema and seed SQL live in **`Updated-Final-DB/`** at the repository root (no extra checkout).

### 4) Run UI + API

```bash
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
| `npm run dev` | Vite only. |
| `npm run dev:api` | API only (`node backend/server.js`). |
| `npm run dev:full` | Vite + API. |
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
