# Roku dev panel — TODO

Backlog of improvements and new features. Roughly ordered by value-per-effort.
Pick any item and ask to implement.

## Inner-loop iteration (biggest wins)

- [ ] **Watch & auto-deploy** — pick a project folder, watch for source changes,
  auto-zip and POST to `/plugin_install`. Replaces the manual
  `zip → Select ZIP → Deploy` dance — the core Roku dev loop.
- [x] **Deploy from folder** — same as Select ZIP but zips a folder on the fly
  so you don't have to pre-build. Reuses the watcher's zip helper.
- [ ] **Deploy-then-resume-telnet** — sideloading drops the telnet socket.
  Auto-reconnect after a successful deploy and optionally mark the first new
  line.

## Telnet console upgrades

- [ ] **Clickable `pkg:/source/…(line)` references** — open the file in the
  user's editor via `vscode://file/<abs>:<line>` URL. Backtraces become
  navigable in one click.
- [ ] **Save log to file (rolling)** — write the raw stream to disk
  (`logs/roku-YYYY-MM-DD.log`) so logs survive crashes and the Clear button.
- [ ] **Regex filter + exclude patterns** — current substring filter handles
  one term; regex + exclude is huge for noisy SDK output. Could split filter
  into include/exclude fields.
- [ ] **Crash watcher** — detect `BRIGHTSCRIPT: ERROR` / `Backtrace` in the
  stream and surface a system-tray notification (or flash the tray icon and
  bring the window forward).
- [ ] **Multi-port debug tabs** — separate panes for 8085 (main),
  8089 (BrightScript console), 8080 (profiler).
- [x] **Stack-trace folding** — collapse `Backtrace:` blocks; click to expand.
- [x] **Inline JSON folding** — detect JSON objects/arrays in log lines,
  collapse to `▸ {…} N keys`, click to expand to pretty-printed JSON.
- [ ] **Interactive BrightScript Debugger** — send commands back through the
  socket when the `Brightscript Debugger>` prompt is detected (currently
  read-only).

## Device & app inspection

- [ ] **App list with launch buttons** — `GET /query/apps`, render as a list,
  one-click `/launch/<id>`. Add a deep-link field for `contentId` /
  `mediaType` / extra params.
- [ ] **Active-app + media-player polling** — show current foreground app and
  playback state (position, duration, state) next to the device-info card.
- [ ] **Raw ECP sender** — small input form: path → response viewer. Great for
  one-off testing without dropping to curl.
- [ ] **Registry inspector** — read/write `pkg:/registry/…` (requires a small
  helper channel or known ECP endpoints).
- [ ] **Developer settings launcher** — open `http://<device>/r/dev` and the
  hidden settings pages (perf overlay, scene-graph inspector toggles).

## Workflow polish

- [ ] **Multi-device profiles** — save N hosts + credentials, swap with a
  dropdown in the device card. Useful when testing across Express / Stick /
  TV / different OS versions.
- [ ] **Macro recorder** — record a keypress sequence + replay. Roughly half
  the value of an automation framework at 5% of the effort. Save macros to
  config; expose as buttons.
- [ ] **Global hotkeys** — bind Deploy, Screenshot, Reboot to function keys
  (in-app accelerators first; consider OS-global later).
- [ ] **Reveal screenshots/recordings in folder** — context-menu "Show in
  Explorer" on the thumbnails.
- [ ] **Screenshot diff** — pick two screenshots, show side-by-side or
  difference overlay. Useful for regression testing UI work.

## Build & packaging

- [ ] **Build-and-deploy hook** — run a configured shell command (npm script,
  make, ropm) before zipping and deploying. Lets the panel kick off a real
  build pipeline.
- [ ] **Package signing** — POST `mysubmit=Package` (Save Packaged
  Application) to produce a signed `.pkg` for prod release builds.
- [ ] **Multi-device deploy** — select multiple discovered devices and deploy
  the same ZIP to all of them in parallel.
- [ ] **Deploy history with rollback** — keep the last N deployed ZIPs in a
  staging dir; click any to redeploy.

## Testing-adjacent (your logs show RALE + RTA traffic already)

- [ ] **RALE panel** — connect to RALE on port 54321, browse the SceneGraph
  tree, inspect node fields. Big lift but enormous if RALE is already part of
  the project.
- [ ] **RTA OnDeviceComponent bridge** — small UI to send Roku Test Automation
  commands (get/set fields, simulate input) without writing a separate test
  harness.
- [ ] **Smoke-test runner** — scripted keypress sequences with screenshot
  checkpoints; pass/fail based on image-diff against a baseline.

## Network / observability

- [ ] **HTTP request log viewer** — your debug logs already contain
  `[DEBUG] Making request with {...}` — parse those into a sortable
  table (method, URL, status, duration) instead of scrolling raw text.
- [ ] **Beacon dashboard** — extract `[beacon.signal]` / `[beacon.report]`
  lines into a timeline view (`AppLaunch*`, `AppSuspend*`, etc.).

## Capture improvements

- [ ] **Per-device screenshot folders** — auto-organize captures by device IP
  or friendly name.
- [ ] **Recording annotations** — overlay keypress markers on the recorded
  video so you can see what input produced what behavior.
- [ ] **Configurable capture FPS / bitrate** — currently fixed; expose in a
  capture settings panel.

---

## Recommendation

If picking three to do next, do these together — they cover what you'd feel
every day:

1. **Watch & auto-deploy** (inner loop)
2. **Clickable `pkg:/source/…(line)` links** (debugging speed)
3. **Crash watcher + tray notifications** (catches errors when not staring at
   the console)
