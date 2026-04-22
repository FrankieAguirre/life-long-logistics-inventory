Life-Long Logistics Inventory
Team Integration Contract

Purpose
This document prevents overlap between Asher (backend), Frankie (frontend), and Briana (database/QA) and defines plug-and-play integration rules.

Role Ownership (Source of Truth)
- Asher (Project Manager / Backend)
  - API design and implementation
  - Authentication and authorization logic
  - Business rules for inventory CRUD and alerts
  - API documentation and integration support
- Frankie (Frontend / UI)
  - React screens, forms, dashboard, filters, and UX
  - API consumption from backend endpoints
  - UI validation and usability/accessibility refinements
- Briana (Database Administrator / QA)
  - Database schema, constraints, backups, and sample data
  - Query/index validation and data integrity checks
  - QA test cases for data correctness and reliability

No-Overlap Boundaries
- Frontend must not define database schema or SQL migration logic.
- Backend must not own UI layout/styling decisions.
- Database work must not hardcode frontend behavior.
- Shared changes must occur through agreed interfaces below.

Shared Interface Contracts

1) API Base
- Base URL: /api
- Data format: JSON
- Date format: ISO 8601 (UTC)
- Auth header for protected routes: Authorization: Bearer <token>
- Error format:
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Human-readable message",
      "details": []
    }
  }

2) Authentication Contract (Asher owns, Frankie consumes)
- POST /api/auth/login
  request: { "username": "string", "password": "string" }
  response: {
    "user": { "id": "1", "username": "frankie", "displayName": "Frankie", "role": "frontend" },
    "token": "demo-token-frankie"
  }

- POST /api/auth/register
  request: {
    "username": "string",
    "displayName": "string",
    "password": "string",
    "role": "dba|backend|frontend|pharmacy"
  }
  response: { "id": "1", "username": "string", "displayName": "string", "role": "string" }

- GET /api/auth/me
  response: { "id": "1", "username": "string", "displayName": "string", "role": "string" }

3) Inventory Contract (Asher owns API, Briana validates DB mapping, Frankie consumes)
- GET /api/inventory
  auth required: yes (roles: backend|dba|frontend|pharmacy)
  query params (optional):
  - search
  - category
  - status in [all, ok, low, expiring]
  - page (default 1)
  - pageSize (default 10, max 100)
  response: {
    "items": [
      {
        "id": "MED-0001",
        "name": "string",
        "genericName": "string",
        "category": "string",
        "form": "string",
        "strength": "string",
        "location": "string",
        "stock": 0,
        "reorderLevel": 0,
        "expiryDate": "YYYY-MM-DD",
        "updatedAt": "2026-04-20T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 100,
      "totalPages": 10
    }
  }

- POST /api/inventory
  auth required: yes (role: backend|dba only)
  request: same shape as item without updatedAt
  response: created item

- PUT /api/inventory/:id
  auth required: yes (role: backend|dba only)
  request: partial item
  response: updated item

- DELETE /api/inventory/:id
  auth required: yes (role: backend|dba only)
  response: { "deleted": true, "id": "MED-001" }

4) Metrics Contract
- GET /api/inventory/summary
  auth required: yes
  response: {
    "totalStock": 0,
    "lowStock": 0,
    "expiringSoon": 0,
    "categoriesCount": 0,
    "okCount": 0,
    "lowCount": 0,
    "criticalCount": 0,
    "expiryCount": 0,
    "categories": ["Antibiotic", "Cardiovascular"]
  }

Database Integration Boundaries (Briana + Asher)
- Briana owns `Updated-Final-DB/schema` and `Updated-Final-DB/seed` as the canonical normalized model.
- Asher maps DB rows to the inventory item shape via `backend/mysqlAdapter.js` (or in-memory adapter for demos).
- Any schema changes require migration notes and API impact review.

Definition of Done by Owner
- Asher
  - Auth + inventory endpoints implemented
  - Role checks enforced server-side
  - API docs updated after endpoint changes
- Frankie
  - UI reads from API in live mode (`VITE_USE_LIVE_API=true`)
  - Error and loading states implemented
  - Mobile and desktop views tested
- Briana
  - Constraints prevent invalid stock/expiry data
  - Backup/restore process documented
  - QA checklist completed with evidence

Merge and Handoff Rules
- Rule 1: Contract first. Change this file before changing API shape.
- Rule 2: One owner per concern. Reviewer from another role required.
- Rule 3: No direct cross-layer assumptions. Use documented contracts only.
- Rule 4: All integration bugs must include reproduction steps and owner tag.
