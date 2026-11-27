# Ticketing admin console

Administrators manage performances, seat inventory, price tiers, orders, refunds and staff access. Gate staff can check tickets for their assigned performances.

Start the [ticketing API](../server/README.md), then run these commands from the repository root:

```sh
npm ci --prefix web-admin
npm run serve --prefix web-admin
```

Open the [admin sign-in](http://127.0.0.1:8081/login). Use the seeded `admin` account for all screens or `checker01` for check-in. Both demo accounts use `Demo@1234`.

Open **Performances**, then **Seats** for a performance to inspect its inventory or block and restore seats. **Orders** supports search by order number or buyer. **Finance** shows payment exceptions, reconciliations and refund progress.

The app uses Vue 3 and Vite. Set `VITE_API_BASE` before starting or building to change the API origin. Run `npm run build --prefix web-admin` for a production build. See the [setup guide](../docs/local-run-guide.md) for the full stack.
