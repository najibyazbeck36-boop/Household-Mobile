# Household Mobile

Household Mobile is the independent, installable, offline-first companion to Household Desktop. It runs on GitHub Pages and communicates only with the existing Google Apps Script `/exec` API. It never connects to the desktop server or directly to Google Drive.

## Development

Serve this directory over HTTP (ES modules and service workers do not run correctly from `file:` URLs):

```sh
python -m http.server 4173
```

Then open `http://localhost:4173/`. Run checks with `npm test`.

## Production

GitHub Pages deploys `main` at `https://najibyazbeck36-boop.github.io/Household-Mobile/`. Relative asset URLs, manifest scope, and service-worker registration support the `/Household-Mobile/` project path.

On first use, generate a one-time pairing code administratively in Apps Script. Enter the code and a friendly phone name. The token returned by the API is stored only in that browser's IndexedDB.

See [mobile architecture](docs/mobile-architecture.md), [pairing](docs/mobile-pairing.md), and [deployment](docs/mobile-deployment.md).
