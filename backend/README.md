# Inventory API (`backend/server.js`)

Plain Node HTTP server on **PORT** (default **4000**). Implements `/api/auth/*`, `/api/inventory`, pagination, RBAC, and JSON errors per `docs/team_integration_contract.md`.

## Storage modes

| `USE_MYSQL` | Behavior |
|-------------|----------|
| `true` | `mysql2` pool + `createMysqlAdapter` — normalized tables from `Updated-Final-DB/schema`, seeded via `npm run db:seed`. |
| `false` | In-memory users (e.g. `frankie` / `demo1234`) and two sample inventory rows. |

## Run

From repo root (`hospital-inventory/`):

```bash
node backend/server.js
```

With MySQL, ensure `.env` has `DB_*` and run `npm run db:seed` once after schema changes.

## Auth token

Login returns `token: "demo-token-<username>"`. Send `Authorization: Bearer <token>` on protected routes.

## RBAC

- Read inventory and summary: `backend`, `dba`, `frontend`, `pharmacy`
- Create / update / delete inventory: `backend`, `dba` only
