# Changelog

## Unreleased

### Added

- **Deeplink — multiple sets** — The Deeplink panel now supports any number of
  parameter **sets** instead of a fixed two. Each set is independently
  collapsible and has its own **+ Add parameter** rows and **Send Launch** /
  **Send Input** buttons. Add or remove sets with **+ Add set** / **Remove**;
  sets auto-renumber. The last-clicked send button in each set is highlighted
  purple and remembered. All set state (params, collapsed, last-used button) is
  persisted to `config.deeplinkSets`, migrated automatically from the legacy
  `deeplinkParams` / `deeplinkParams2` / `deeplinkParams3` keys on first load.

- **RALE — Layout (read-only)** — A lightweight, read-only Roku Advanced Layout
  Editor panel over the same RALE TrackerTask socket as the Registry inspector.
  Two columns split by a draggable splitter (default 50%, persisted to
  `config.raleDetailsWidth`):
  - **Left:** the running channel's full SceneGraph layer tree (collapsible nodes
    with subtype, `#id`, and child count). Click a node to select it; the tree
    auto-expands and highlights the path from the root layer down to the selected
    node. The device-focused node is marked with a ◉ and is the initial selection.
  - **Right:** the selected node's details — subtype/`#id`, a parent-chain
    breadcrumb, fields with their SceneGraph types, and a collapsible **Layout**
    section with a bounding-box mini-map drawn to the design resolution plus
    X/Y/Width/Height. Node-, array-, and assocarray-valued fields expand inline to
    drill into their contents (e.g. a RowList's `content` ContentNode and its
    items), fetched lazily. Text is selectable for copying.
  - **Refresh** re-reads (also auto-reads when expanded); **Select Focused**
    re-queries the focused node after you move focus with the remote; a **Show on
    device** checkbox (default off, persisted to `config.raleShowOverlay`) draws
    RALE's selector overlay around the selected node on the TV (`init` is only
    sent in this mode, so otherwise nothing is drawn).

## 2026-06-03

First packaged release of the Roku dev panel — an Electron desktop app that
wraps the Roku ECP (External Control Protocol) and sideload-server endpoints in
a single UI.

### Added

- **Registry inspector** — Read, edit, add, and delete the dev channel's
  `roRegistry` over the RALE TrackerTask socket protocol (no device keying
  required, unlike ECP `query/registry`). Collapsible sections with a key count,
  selectable section name plus **Copy** / **Copy JSON**, inline key/value
  editing, per-key and per-section delete, **Clear all**, and **Add JSON** to
  bulk-import a `{ "section": { "key": "value" } }` object. Auto-reads when the
  panel is expanded. Configurable port via `config.trackerPort` (default 54321).
- **Deeplink** — Four `(name, value)` rows with **Send Launch**
  (`POST /launch/dev?<params>`) and **Send Input** (`POST /input?<params>`);
  params persisted to `config.deeplinkParams`.
- **Device information** — SSDP discovery, ping, live model + software version,
  open the device's dev web UI in an embedded auto-authenticating browser,
  reboot, and check for software update via model-specific key sequences.
- **Screenshots** — Capture via the sideload server (HTTP Digest auth) into
  `screenshots/`, newest-first thumbnail strip, open in OS viewer, hover-to-delete.
- **Capture** — USB capture card / webcam stream into the card, on-demand
  screenshot and WebM/MP4 recording.
- **Deploy app** — Sideload a ZIP or folder (zipped in-process, no `archiver`
  dependency), recents dropdown for one-click redeploy, and **Delete installed
  app** to clear the "identical package" rejection.
- **Telnet** — Roku debug console (port 8085) with VS Code Dark+ colorization,
  foldable backtraces, inline JSON folding, substring filter, reliable Copy, a
  **Check** probe, and robust Open with stale-socket cleanup. The Open/Close
  button now syncs to the main-process socket state after a renderer reload.
- **Send keys** — Saved-user dropdown; send username, password, or the full
  sign-in sequence.
- **Remote** — On-screen remote with clickable overlay buttons sending ECP keypresses.
- **Status bar** — Device online/offline dot + IP, refreshed every 5 s.
- **Layout** — Drag cards by their header to reorder; collapsed state and order
  persisted to `config.json`.
- **Themed confirm dialog** (`components/confirm.js`) replacing native
  `window.confirm` for destructive actions.
- **Release workflow** — GitHub Actions matrix (`windows-latest` +
  `macos-latest`) building NSIS installer + portable zip (Windows) and `.dmg` +
  zip for x64/arm64 (macOS), published to a draft GitHub Release on a `v*` tag.

### Known limitations

- The Registry inspector requires a channel build that embeds and runs the RALE
  TrackerTask.
- Release binaries are unsigned: Windows SmartScreen warns on first run, and
  macOS Gatekeeper requires right-click → **Open**.
- The macOS build uses the default Electron icon until a 512×512 icon is added.


