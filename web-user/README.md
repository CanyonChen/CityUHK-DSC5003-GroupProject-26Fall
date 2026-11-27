# Visitor ticketing app

The visitor app lets guests browse local demo performances and inspect the seat map. Signed-in users can reserve seats, simulate a payment, view tickets and request refunds.

Start the [ticketing API](../server/README.md), then run these commands from the repository root:

```sh
npm ci --prefix web-user
npm run serve --prefix web-user
```

Open the [visitor app](http://127.0.0.1:8080/). The seeded account `buyer01` uses the password `Demo@1234`. Seat selections can be resumed after sign-in. Paying a demo order creates a ticket with a rotating check-in QR code.

The app uses Vue 3 and Vite. Set `VITE_API_BASE` before starting or building to use a different API origin. Run `npm run build --prefix web-user` for a production build. See the [setup guide](../docs/local-run-guide.md) for the database and full stack.
