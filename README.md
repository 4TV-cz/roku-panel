# Roku dev panel

Electron desktop app for controlling a Roku device during development. Wraps the ECP (External Control Protocol) and sideload server endpoints in a single UI.

## Features

- **Device information** — SSDP discovery on the LAN, ping, live model + software version (`<software>.<build>`), open the device's dev web UI in an embedded browser (auto-authenticates), reboot via the model-specific key sequence, check for software update via the model-specific key sequence.
- **Screenshots** — Capture via the sideload server (HTTP Digest auth), saved to `screenshots/`. Newest-first horizontal thumbnail strip; click to open in the OS image viewer, hover to delete.
- **Capture** — Acquire a USB capture card / webcam stream into the card body; on-demand screenshot and video recording (WebM/MP4) saved alongside screenshots. Devices are only opened while the card is expanded.
- **Deploy app** — Sideload a ZIP or a folder (zipped in-process — no `archiver` dependency, deflate-compressed, manifest at ZIP root). Last 10 ZIPs and folders are remembered in `config.json` and shown in a single "recents" dropdown for one-click redeploy. **Delete installed app** unblocks the "Identical to package previously installed" case that Roku silently rejects.
- **Telnet** — Stream the Roku debug console (port 8085) into the panel with:
  - **VS Code Dark+ colorization** ported from the IBM Output Colorizer TextMate grammar — strings, numbers, dates, namespaces (`beacon.signal`, `com.foo.bar`), GUIDs, URLs, `[INFO]/[DEBUG]/[WARN]/[ERROR]` log tags.
  - **Foldable `Backtrace:` blocks** — collapse to `▸ Backtrace: N frames (click to expand)`, auto-expand on filter match.
  - **Inline JSON folding** — long `{…}` / `[…]` payloads collapse to `▸ {…} N keys`, expand to pretty-printed JSON below.
  - **Substring filter** with auto-expand of matching folds.
  - **Reliable Copy** via the main-process clipboard (copies the current selection if any, otherwise all visible lines).
  - **Check** button — probes port 8085 and reports `free` / `in use by another client` / `in use by this app` / `unreachable`.
  - **Robust Open** — 3 s connect timeout, force-cleans stale sockets so a failed connect no longer requires restarting the app.
- **Send keys** — Saved-user dropdown (stored in `config.json`). Send username, send password, or run the full sign-in sequence (`text + Enter + Down × N`).
- **Deeplink** — Four `(name, value)` rows; **Send Launch** (`POST /launch/dev?<params>`) and **Send Input** (`POST /input?<params>`). Values are persisted to `config.deeplinkParams`.
- **Registry inspector** — Read, edit, add, and delete the dev channel's `roRegistry` over the **RALE TrackerTask** socket protocol — no device keying required (unlike ECP `query/registry`, which returns "Device not keyed" until the device is packaged). Each section is collapsible with a key count, a selectable name plus **Copy** / **Copy JSON** buttons, inline key/value editing, per-key and per-section delete, **Clear all**, and **Add JSON** to bulk-import a `{ "section": { "key": "value" } }` object. Auto-reads when the panel is expanded; destructive actions use a themed in-app confirm dialog (`components/confirm.js`).
- **RALE — Layout (read-only)** — A lightweight, read-only Roku Advanced Layout Editor over the same **RALE TrackerTask** socket. Two columns: the running channel's full SceneGraph layer tree on the left (collapsible nodes with subtype, `#id`, and child count) and the selected node's details on the right (subtype/`#id`, parent-chain breadcrumb, bounding rect, and fields with their SceneGraph types). Node-, array-, and assocarray-valued fields expand inline to drill into their contents (e.g. a RowList's `content` ContentNode and its items), fetched lazily on expand. Click any node to select it and update the details panel; the device-focused node is marked ◉ and is the initial selection. The tree auto-expands and highlights the path from the root layer down to the selected node. A **Show on device** checkbox (default off) draws RALE's selector overlay around the selected node on the TV. A draggable splitter resizes the details panel (default 50%), and details text is selectable for copying. State persists to `config.raleShowOverlay` / `config.raleDetailsWidth`.
- **Remote** — On-screen remote controller image with clickable overlay buttons (Power, Back, Home, D-pad/OK, Replay, Voice, Options, Rev, Play, Fwd). Each click sends an ECP keypress.
- **Status bar** — Green/red dot with the device IP, refreshed every 5 s.
- **Layout** — Drag cards by their header to reorder; collapsed/expanded state and order are persisted to `config.json`.

## Setup

```bash
npm install
npm run dev      # electronmon — hot-reloads on file changes
# or
npm start        # plain electron
```

First launch reads `config.json`. If `deviceHost` is empty, click **Get Roku IP** to discover and write it.

## Configuration

All settings live in `config.json` at the project root:

```json
{
  "version": 1,
  "deviceHost": "192.168.1.100",
  "deviceCredentials": {
    "username": "rokudev",
    "password": "<dev mode password>"
  },
  "users": [
    { "username": "you@example.com", "password": "..." }
  ],
  "selectedUser": "you@example.com"
}
```

`deviceCredentials.password` must be set for Screenshot, Open in browser, and Deploy (all use HTTP Digest auth on port 80).

`trackerPort` (optional, default `54321`) is the TCP port the Registry inspector and RALE Layout panel tell the in-channel RALE TrackerTask to listen on. Use the same port your RALE setup uses.

The panel also writes auto-managed fields back to `config.json` — `recentZips`, `recentFolders`, `lastDeployDir`, `lastDeployFolderDir`, `deeplinkParams`, `cardOrder`, `cardCollapsed`, `windowBounds`, `raleShowOverlay`, `raleDetailsWidth`. You can edit them by hand but normally don't have to.

## Adding a feature

1. Add a primitive in `src/main/roku/` if it's a new protocol call.
2. Add an IPC module under `src/main/ipc/` exporting `register(ipcMain[, app])`.
3. Register it in `src/main/main.js`.
4. Expose it in `src/preload/preload.js`.
5. Add a view module under `src/renderer/views/` (use `createCard` from `components/card.js`).
6. Mount the view in `src/renderer/app.js`.

Views talk across boundaries via the tiny event bus in `api.js` (`emit('device:status', ...)` / `on('device:status', cb)`).

If the feature opens or writes a file dialog, follow the pattern in `ipc/deploy.js`: remember the last-used directory in `config.json` (`lastDeployDir`, etc.) and pass it as `defaultPath` so the dialog opens where the user expects.

## Notes

- Roku's debug console (port 8085) allows only one client at a time. The Telnet panel reports `rejected (console already in use)` when another machine is attached; use **Check** to confirm whether the port is held by another client or just unreachable.
- A Roku sideload of an *identical* package is silently rejected (`Identical to package previously installed`). Use **Delete installed app** in the Deploy card, then redeploy.
- `src/main/roku/zip-folder.js` is a deflate-compressed ZIP writer built on `zlib.deflateRawSync` plus a 30-line CRC32 — no external dependency. It's also the helper the future watch-and-auto-deploy feature will use.
- The Telnet colorizer is a JavaScript port of `ibm.output-colorizer`'s `log.tmLanguage` (TextMate grammar), mapped to VS Code Dark+ scope colors. Order is preserved so the same scope wins per position as in VS Code.
- The `screenshot://` custom protocol serves files out of `screenshots/` so renderer thumbnails work under a strict CSP without `webSecurity: false`.
- HTTP requests to the sideload server (port 80) use `agent: false` because Roku closes connections in a way that confuses Node's default keep-alive agent.
- Reboot key sequences are model-specific (`model-number` first four digits ≥ 4000 vs ≥ 3800); the device is queried live each click rather than relying on a manually-set model number.
- Cards are draggable via their headers. Text selection inside the Telnet console works because the card's `draggable` attribute is toggled off while a mousedown is active in the console (Chromium decides drag-vs-select at mousedown time). The Registry inspector's section names, the RALE Layout details panel, and its resize splitter are likewise excluded from `dragstart` so they stay selectable / draggable on their own.
- The RALE Layout viewer reads the SceneGraph tree (`getNodeTree`) and the focused node (`selectFocusedNode`) over the TrackerTask, and selects nodes with `selectNode`. In read-only mode it never sends `init`, so RALE's red selector overlay is never drawn; enabling **Show on device** sends `init` + `showSelectorView` so selecting a node draws the box around it. Commands implemented as a BrightScript `Sub` return an empty payload (e.g. `hideSelectorView`/`showSelectorView`); the socket client treats an empty response as a successful value-less reply. `init` is always sent with `logVerbosity: -1` because RALE does `if args.logVerbosity >= 0`, which crashes the channel on `invalid`.
- The Registry inspector does **not** use ECP `query/registry` (that needs a packaged/keyed device and is read-only). It talks to the in-channel **RALE TrackerTask** — which must be embedded and running in the channel — by waking it with an ECP `POST /input?rale=1&port=<P>`, then exchanging framed JSON (`[start]{…}[end]` ⇄ `[start][uuid:N]<uuid>{…}[end]`) over TCP on that port. Registry reads/writes run inside the channel via `roRegistrySection`, so no keying is needed and all values are strings. The `init` command is intentionally skipped so RALE's on-screen selector overlay never appears. See `src/main/roku/tracker.js`; reference protocol: `TrackerTask.xml`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Launch with electronmon hot-reload |
| `npm start` | Launch with `electron .` |
| `npm run build` | Package an unpacked Windows build via electron-builder (output in `dist/`) |
| `npm run release` | Build the current OS's artifacts and publish them to a GitHub Release (needs `GH_TOKEN`) |

## Releasing

Releases are built by the `Release` GitHub Action (`.github/workflows/release.yml`) as a matrix across `windows-latest` and `macos-latest`:

1. Bump `version` in `package.json` and commit.
2. Tag and push: `git tag v0.2.0 && git push origin v0.2.0` (the tag must be `v<version>`; the workflow syncs `package.json` to the tag).
3. Each OS runs `electron-builder <platform> --publish always`, uploading to a **draft** GitHub Release for that tag:
   - **Windows** — NSIS installer (`.exe`) + portable zip + `latest.yml`.
   - **macOS** — `.dmg` + zip for both `x64` and `arm64` + `latest-mac.yml`.

   Review the draft and click **Publish**.

The workflow can also be run manually from the **Actions** tab (`workflow_dispatch`), in which case it releases the current `package.json` version. It uses the built-in `GITHUB_TOKEN` (no extra secret required).

Builds are **unsigned** — Windows SmartScreen warns on first run, and macOS Gatekeeper requires right-click → **Open** (or `xattr -dr com.apple.quarantine <App>`). Code signing/notarization needs platform certificates. The macOS build also uses the default Electron icon until a **512×512** `assets/icon.png` (or `assets/icon.icns`) is provided — the current 256×256 icon is below macOS's minimum.
