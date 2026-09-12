#!/bin/bash
# Start the Roku dev panel.
#
# Run this from a terminal. It has to be a terminal: macOS grants Local Network
# access per app bundle, the terminal app holds that grant, and a process it
# spawns inherits it. Launched from Finder or the Dock instead, every call to
# the Roku comes back EHOSTUNREACH.
#
#   ./start.sh        start detached, hand the prompt back
#   ./start.sh -f     stay in the foreground (Ctrl-C to stop)

set -e
cd "$(dirname "$0")"

PROJECT="$PWD"
ELECTRON="$PROJECT/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"

if [ ! -x "$ELECTRON" ]; then
  echo "Electron is not installed. Run: npm install" >&2
  exit 1
fi

# The bracket keeps the pattern from matching the shell running pgrep itself.
if pgrep -f "[E]lectron $PROJECT\$" > /dev/null 2>&1; then
  # Closing the window doesn't quit the app on macOS (see window-all-closed in
  # src/main/main.js), so "running" may mean "running with no window". Activating
  # the bundle fires Electron's `activate` handler, which recreates the window.
  open -a "$PROJECT/node_modules/electron/dist/Electron.app"
  echo "Roku dev panel is already running — brought it to the front."
  exit 0
fi

if [ "$1" = "-f" ] || [ "$1" = "--foreground" ]; then
  exec "$ELECTRON" "$PROJECT"
fi

# Subshell detach: survives closing the terminal window. `nohup ... & disown`
# does not — the app dies with the session.
( nohup "$ELECTRON" "$PROJECT" > /dev/null 2>&1 & )
echo "Roku dev panel started."
