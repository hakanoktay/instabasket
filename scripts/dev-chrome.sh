#!/usr/bin/env bash
# Opens a separate Chrome profile ("KeepKeep Dev") for testing on the real
# Instagram: only the unpacked extension/ is installed there (not the store
# version, so buttons don't show twice), and port 9222 lets test scripts
# look at the pages (Playwright connectOverCDP). Chrome doesn't allow this
# port on the everyday profile, hence the separate one.
#
#   ./scripts/dev-chrome.sh
#
# First time only: in that window, chrome://extensions → Developer mode →
# Load unpacked → extension/, then sign in to instagram.com. Both are kept.
set -euo pipefail

profile="$HOME/.keepkeep-dev-chrome"
mkdir -p "$profile"
open -na "Google Chrome" --args \
  --user-data-dir="$profile" \
  --remote-debugging-port=9222 \
  --no-first-run --no-default-browser-check \
  "chrome://extensions/" "https://www.instagram.com/"
