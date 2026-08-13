# Mobile pairing

1. In Apps Script, run `generateHouseholdPairingCode`.
2. Open Household Mobile and enter a friendly device name and the one-time code.
3. The app creates a stable UUID, calls `pairDevice`, stores the returned token only in IndexedDB, then calls `bootstrap`.
4. After the bootstrap transaction commits, the dashboard opens at the returned global revision.

Invalid, expired, and previously used codes share a safe user-facing message. Network and server failures preserve the setup screen. Clearing browser site storage removes the token and requires pairing again.

If a token is revoked, cached entities and pending outbox records remain. Sync stops with **Authorization required** so the device can be re-paired without silently erasing data. A household-ID mismatch is a critical stop; datasets are never merged.

Administrators revoke a device with the editor-only `revokeHouseholdDevice(deviceId)` function. Pairing codes and device tokens must never be placed in GitHub, URLs, screenshots, or support logs.
