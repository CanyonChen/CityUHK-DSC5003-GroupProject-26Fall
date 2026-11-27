# Ticketing API

The local visitor app and admin console share this Express API and a MariaDB database. It manages session seats, reservations, simulated payments, refunds and gate check-in. WebSocket clients subscribe at `/ws` for changes.

## Run

Prepare the database and `.env` using the [local setup guide](../docs/local-run-guide.md). From the repository root, with Node.js 20 or later:

```sh
npm ci --prefix server
npm start --prefix server
```

Open [the health endpoint](http://127.0.0.1:3000/health). A healthy response reports `data.db` as `ok`. To restart automatically when source files change, use `npm run dev --prefix server`. Configuration defaults are in [.env.example](.env.example).

## Working with the API

The [API reference](../docs/api-contract.md) lists routes, authentication, pagination, error codes and idempotency requirements. The [database guide](../docs/database-design.md) explains seat inventory and payment state transitions. Request handlers are in [src/routes](src/routes), business logic in [src/services](src/services) and the database pool in [src/db.js](src/db.js).
