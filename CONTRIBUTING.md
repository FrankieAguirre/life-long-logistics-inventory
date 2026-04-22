Life-Long Logistics Inventory
Contributing Guide

Purpose
This guide defines how Asher, Frankie, and Briana collaborate safely in this repository.

Roles
- Asher: backend API, auth, authorization, integration ownership
- Frankie: frontend UI/UX and API consumption
- Briana: database schema, integrity, QA validation

Branch Strategy
- main: stable integration branch, always deployable/demo-ready
- feature/backend-*: backend features and API changes
- feature/frontend-*: frontend features and UI changes
- feature/database-*: schema and data-layer changes
- hotfix/*: urgent fixes to stabilize demo or grade-critical defects

Branch Naming Examples
- feature/backend-auth-refresh
- feature/frontend-inventory-table
- feature/database-index-tuning
- hotfix/login-role-check

Daily Workflow
1. Pull latest main.
2. Create a feature branch.
3. Make focused changes in your ownership area.
4. Run checks before pushing.
5. Open a pull request into main.
6. Request at least one reviewer from a different role.

Pull Request Rules
- Keep PRs small and single-purpose.
- Include summary, testing steps, and screenshots for UI changes.
- For API shape changes, update docs/team_integration_contract.md in the same PR.
- For schema changes, include migration notes and rollback note.
- Do not merge if build is broken.

Merge Rules
- Preferred: Squash and merge for feature branches.
- Use merge commit only when preserving branch history is important.
- Never force-push to main.

Conflict Avoidance Rules
- Frontend does not change SQL/schema files.
- Backend does not change major UI layout/styling decisions.
- Database changes must preserve API response contract unless contract is updated first.

Testing Checklist Before Merge
- Backend: node --check backend/server.js
- Frontend: npm run build
- Manual smoke:
  - login works
  - inventory list loads
  - role restrictions enforced

Commit Message Style
- feat: add inventory pagination metadata
- fix: enforce backend role for inventory writes
- docs: update team integration contract for pageSize
- chore: align dev scripts and README notes

Need Help?
- API and team boundary source of truth: docs/team_integration_contract.md
- Backend operation notes: backend/README.md
