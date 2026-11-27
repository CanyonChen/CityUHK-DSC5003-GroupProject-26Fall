# CityUHK Events Hub Admin (8081)

Back-office front end for the DSC5003 ticketing project. Vue 3 + Vite, separate from `web-user` (8080); both talk to the shared API on port 3000.

## Pages

| Route | Page | Who |
|---|---|---|
| `/login` | Admin / checker sign-in | all |
| `/` | Dashboard: gross, net, tickets, sell-through + per-performance ledger | ADMIN |
| `/events` | Event list, create and edit (cover from `public/media`) | ADMIN |
| `/performances` | Performance list, create draft, publish, pause/resume, edit windows, edit price tiers, open the seat map and block/restore single seats | ADMIN |
| `/checkin` | Assigned gates, paste QR payload, success/failure result, latest check-ins | ADMIN / CHECKER |
| `/orders` | Order search by order no or buyer, status/performance/date filters | ADMIN |
| `/finance` | Sales ledger, gateway exceptions, refund progress, auto-reconciliation status, audit log | ADMIN |
| `/users` | User search, role filter, grant ADMIN/CHECKER by performance, revoke assignment | ADMIN |

## Run

```powershell
npm install
npm run serve     # http://127.0.0.1:8081
```

`vite.config.js` binds `127.0.0.1:8081`. API base defaults to `http://127.0.0.1:3000`; override with `VITE_API_BASE`.

## Accounts

`admin` / `Demo@1234` sees every page. `checker01` / `Demo@1234` only sees `/checkin`, and only the performances assigned to that checker.

## Notes

- Token is stored under `cityuhk-events-hub.admin.token`, separate from the user app's `cityuhk-events-hub.token`, so logging into one front end does not affect the other.
- Check-in accepts ticket text: the JWT payload shown in the user app's ticket QR or a 64-character ticket hash. No camera or hardware scanner is required. Every successful check-in is written to `checkins` and `audit_logs`.
- Performances open a seat inventory dialog: single seat, multi-select, and whole-region block/restore. Only `AVAILABLE` and `BLOCKED` seats can change; `HELD` and `SOLD` are skipped.
- Refunds are requested in the user app. Finance shows progress; an admin can mark a `PENDING` refund `SUCCEEDED` (order `REFUNDED`, tickets `VOID`, seats released) or `FAILED` (order `PAID`, tickets `VALID`). Late-payment refunds keep the expired order in `EXPIRED`. This back office never force-clears a payment exception (FR-12).
- Users page grants `ADMIN` (no performance) or `CHECKER` (one performance per assignment). Revocation takes effect on the next API request without re-login, because the server re-reads roles and checks `token_version` on every request. The last active administrator cannot be revoked.
- Finance shows the auto-reconciliation card: interval, last run, pending, processed/failed in 24h, and a **Run now** button. The worker replays `PENDING` notifications older than 120 seconds with the stored `payload_json`; `RECONCILE_ENABLED=0` disables it.
- Sign out calls `POST /auth/logout` first: the server bumps `users.token_version`, so every token issued to that account becomes invalid immediately, then the local token is cleared and the page returns to `/login`.
