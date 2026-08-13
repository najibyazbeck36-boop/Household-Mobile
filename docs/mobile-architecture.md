# Mobile architecture

The installed PWA talks only to the public Apps Script `/exec` endpoint. Apps Script authenticates the device and reads/writes the private Household Cloud Spreadsheet. Desktop synchronization remains independent.

## IndexedDB

Database `household-mobile`, version 1:

- `metadata`: device UUID/name/token, default member, household ID, global cursor, last success/error and status.
- `members`, `accounts`, `categories`, `financial_entries`: current cloud-compatible entity snapshots including tombstones and `server_revision`.
- `outbox`: durable local operations keyed by stable `changeId`.
- `conflicts`: unresolved and resolved optimistic-concurrency conflicts.

Bootstrap clears and replaces the four entity stores and advances the cursor in one IndexedDB transaction. If that transaction fails, initialization is not completed.

## Synchronization and offline operation

A local mutation writes its entity and outbox operation in one transaction. Sync sends at most ten operations, retains each `changeId` across retries, and transactionally applies remote changes, acknowledgments, conflicts, and the global cursor. Remote application writes entity stores directly and never invokes the local mutation path.

The application shell is cached by the service worker. IndexedDB supplies dashboards and ledgers offline. New offline entries remain in the outbox until startup, an online event, foreground polling, or **Sync Now** succeeds.

Transfers are one `financial_entry`; balances subtract from `from_account_id` and add to `to_account_id`. Household wealth ignores transfers. Expected income and planned expenses use the existing `entry_type` values.

Conflicts are never silently resolved. **Keep Cloud** applies the server payload. **Keep Local** creates a new change ID based on the latest cloud revision.
