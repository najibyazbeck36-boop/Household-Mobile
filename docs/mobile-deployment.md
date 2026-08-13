# Mobile deployment

GitHub Pages publishes the root of `main`. All application links are relative, so the app works beneath `/Household-Mobile/` rather than assuming `/`.

The service worker uses a versioned application-shell cache, removes older versions during activation, prefers the network for same-origin assets, and falls back to cache offline. It does not cache Apps Script API responses; IndexedDB is the authoritative mobile cache.

## Release checklist

1. Run `npm test` and syntax checks.
2. Search tracked files for device tokens, pairing codes, Spreadsheet IDs, OAuth material, database files, and private household exports.
3. Commit and push `main` without rewriting history.
4. Wait for the Pages deployment and verify the public URL, manifest, service worker, and `/Household-Mobile/` asset paths.
5. Test bootstrap, refresh persistence, offline shell/data, an offline outbox mutation, both synchronization directions, cleanup tombstones, and final balance parity.

Troubleshooting: use **Sync Now** after connectivity returns; re-pair after authorization failure; do not clear site data while unsynchronized operations remain. A deployment update may require closing and reopening the installed PWA after the new service worker activates.
