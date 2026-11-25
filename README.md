# CoilStack-KR

Browser-based coil inventory and warehouse field tools. Serve this directory over HTTP; opening `index.html` directly as a file cannot load the view fragments. Live camera scanning requires HTTPS (or localhost) and camera permission.

## Field workflows

Open **Cek / Cari Lapangan**.

- **Find:** scan a QR/photo, paste a supplier label, or enter **No. Coil + Heat Number**. Matching is exact after trimming and case normalization; leading zeros are retained. A coil number without heat only lists candidates. **Tunjukkan Slot** opens a read-only diagram at the correct depth layer. Master Steel URL labels require opening the supplier page and pasting its text.
- **Check:** choose a bay, inspector, and shift, then start a session. Scan each coil and explicitly select its observed physical slot/address. Confirm that the label and physical location have been checked. Observations can match, report a wrong location/slot, report specification differences, or identify an unregistered active coil. Blank optional specifications are not verified. Kilograms and metric tons are compared in kilograms. Inventory data is never overwritten by an observation.
- **Progress:** each session snapshots its initial inventory. Repeated scans do not inflate progress. Subsequent stock/location changes require rechecking and do not rewrite the initial list. Unchecked coils are not marked missing. Finish the session to freeze its report; copy it or download its CSV, including every observation for audit.
- **Move:** find a unique active coil, select **Pindahkan Coil**, choose its destination and enter PIC, shift, and reason. Confirm both the source and physical destination, then approve the review dialog. Occupied or invalid slots and duplicate identities block the action. Specifications are retained, the source is freed, and a separate movement history is saved. Previous location verification no longer applies after movement. This records a move; it does not authorize crane/lifting operations.
- **Non-pyramid:** new movement destinations require a marked floor address, such as `ZONA-A / 03`. Existing unaddressed non-pyramid records can be checked at bay level using their recorded number, but this does not establish an exact floor position. Record a move to a marked address to improve location precision.
- **Clean up tests/demo history:** choose a session in **Sesi / riwayat**, then use **Hapus Sesi Terpilih**, or use **Hapus Semua Sesi** to clear the session list. Active sessions can also be deleted, discarding their checks. Verification metadata belonging to deleted sessions is removed; verification from other sessions is retained. Under **Riwayat Perpindahan**, delete an individual record with **Hapus Riwayat Ini** or clear the list with **Hapus Semua Riwayat**. Every deletion requires confirmation and is permanent, so export needed reports/CSVs first. Cleanup does not delete coil inventory, undo moves, change current addresses, or clear the separate inventory-exit history. Deleting sessions does not delete movement history, and vice versa.

Layer numbering is **front to back**, not vertical stack height. Left/right must be interpreted from the same front-facing bay orientation used in the diagram.

## Storage and limitations

Inventory, check sessions, field-verification metadata, and movement history are stored in the existing browser `localStorage` record. Sessions resume after reload on the same browser/device. New field actions roll back if local persistence fails. Existing data loads without needing a reset.

This release does **not** add shared live synchronization, an offline-installable app, bay QR printing, or a warehouse floor map. Existing inventory CSV/WhatsApp imports are not backups of field sessions or movement history; export the separate field reports and movement CSV as well. Clearing browser data removes local records. Use one active editing tab per device; concurrent-tab/shared-device conflict handling is not implemented.

## Tests

With Node.js installed, run from the repository root:

```sh
node --test tests/field-core.test.cjs
```

No package installation is needed. Tests cover compound identity, label parsing, unit normalization, confirmation requirements, session snapshots, duplicate protection, occupied destinations, stale-source rejection, movement audit, verification invalidation, safe session/history deletion, JSON persistence, and rollback when storage fails.
