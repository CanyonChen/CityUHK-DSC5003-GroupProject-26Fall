# Development scripts

Run these commands from the repository root. The [local setup guide](../docs/local-run-guide.md) covers the database, API, visitor app and admin console.

## Start and verify

| Command | Purpose |
| --- | --- |
| `./scripts/dev.ps1` | Start or reuse MariaDB, the API on 3000 and the two local apps on 8080 and 8081. Add `-Visible` to open their consoles. |
| `./scripts/reset_demo.ps1 -DryRun` | Preview a seed reset. Running without `-DryRun` drops and rebuilds `ticketing_system`. |
| `python database/check_schema.py` | Check the checked-in SQL schema without connecting to a database. |
| `python -m unittest discover -s scripts -p test_sync_cap.py` | Test the campus announcement parser using fixtures. |
| `node --test scripts/test_event_formats.mjs` | Test activity format filters and multi-session events. |

The PowerShell API checks use PowerShell 7. Start the API first. `./scripts/smoke.ps1` checks health and authentication. `./scripts/catalog_check.ps1` reads activities, performances and seats. `./scripts/perf_smoke.ps1` times five read endpoints.

`python database/check_fields.py` reads the local database to check column counts. For constraint testing, `python database/validate_db.py --database YOUR_DISPOSABLE_DB` **clears the selected database’s tables** before inserting test fixtures. It expects the ticketing schema to exist. Omitting the option targets `ticketing_system`. The Python database utilities accept `MYSQL_BIN` as the path to a MariaDB or MySQL client.

## Ticketing integration tests

Run integration tests with a disposable seeded database and API. They create or change accounts, orders, inventory and payment records.

| Command | Coverage |
| --- | --- |
| `./scripts/orders_check.ps1` | Reservations, idempotency, payment, ticket issuance and cancellation |
| `./scripts/admin_check.ps1` | Event and inventory management, check-in, refunds and reporting |
| `./scripts/accounts_check.ps1` | Registration, sign-out, role assignments and reconciliation |
| `./scripts/recon_auto_check.ps1` | Periodic replay of a pending payment notification using a temporary API on port 3002 |
| `node scripts/realtime_check.js` | WebSocket subscriptions, seat changes and reconnection |
| `node scripts/ac_coverage_check.js --all` | Ticketing acceptance cases covering concurrent buyers, payment, refunds and adjacent seats |

The acceptance runner expects a separately seeded `ticketing_ac` database and an API serving that database at `http://127.0.0.1:3300`. When preparing the schema and seed for this run, change the database identifier in copies of both SQL files. Set the API and runner to the same `DB_NAME` and `PAYMENT_NOTIFY_SECRET`. Override the runner’s API URL with `BASE`. Select individual cases with `--cases=AC-02,AC-04`. Acceptance and WebSocket results go under `.cache/checks/`.

## Benchmarks

1. Run `node scripts/benchmark_setup.js` to rebuild the dedicated `ticketing_bench` database. This replaces previous benchmark data.
2. Start a separate API with `DB_NAME=ticketing_bench`, `PORT=3100`, `DB_POOL=10`, `REFUND_CUTOFF_HOURS=0`, `RECONCILE_INTERVAL_SECONDS=2` and `RECONCILE_MIN_AGE_SECONDS=1`.
3. Run `node scripts/benchmark.js baseline`, then repeat with `indexes`, `tuned` and `drop` to compare query timings and plans with and without the candidate indexes. Use `reservation` for a concurrent seat reservation run.
4. Run `node scripts/transaction_races.js` for concurrent check-in and refund, seat release and payment replay. This script also starts an API on port 3110.

The benchmark tools share dataset summaries, timings and query plans in `.cache/benchmarks/`.

## Public event data

`python scripts/sync_cap.py --help` lists the options for refreshing the public CAP feed. `node scripts/export_pages_snapshot.js` reads the local ticketing database and writes a fresh Pages demo snapshot. `python scripts/generate_covers.py` regenerates the local ticketing apps’ SVG programme covers.
