#!/usr/bin/env bash
# Builds a self-contained JARVIS zip that runs on another machine without installing
# anything: the app bundled into one server file, the built web app, and a Node.js
# runtime per target platform.
#
#   npm run package:portable          → dist-portable/JARVIS-<version>-portable.zip
#
# Targets: macOS Apple Silicon (darwin-arm64) and Linux x86-64 (linux-x64).
set -euo pipefail

NODE_VERSION="v24.22.3"
TARGETS=("darwin-arm64" "linux-x64")

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"
OUT="$ROOT/dist-portable"
CACHE="$OUT/.cache"
STAGE="$OUT/JARVIS"
ZIP="$OUT/JARVIS-$VERSION-portable.zip"

cd "$ROOT"
echo "==> Building JARVIS $VERSION"
npm run build

rm -rf "$STAGE" "$ZIP"
mkdir -p "$STAGE/app/server/dist" "$STAGE/app/web" "$STAGE/runtime" "$CACHE"

echo "==> Bundling the server into one file"
# Dependencies (express, mysql2, …) are pure JavaScript, so they are inlined and no
# node_modules folder is shipped. CommonJS packages inside an ESM bundle need `require`.
npx esbuild apps/server/src/index.ts \
  --bundle --platform=node --format=esm --target=node24 \
  --outfile="$STAGE/app/server/dist/index.mjs" \
  --banner:js="import { createRequire as __jarvisRequire } from 'node:module'; const require = __jarvisRequire(import.meta.url);" \
  --log-level=warning
# The server serves the web app from ../../web/dist relative to its own file.
cp -R apps/web/dist "$STAGE/app/web/dist"
find "$STAGE/app/web/dist" -name '*.map' -delete

echo "==> Fetching Node.js $NODE_VERSION runtimes"
SUMS="$CACHE/SHASUMS256-$NODE_VERSION.txt"
[ -f "$SUMS" ] || curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt" -o "$SUMS"
for target in "${TARGETS[@]}"; do
  archive="node-$NODE_VERSION-$target.tar.gz"
  [ -f "$CACHE/$archive" ] || curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/$archive" -o "$CACHE/$archive"
  expected="$(grep " $archive\$" "$SUMS" | cut -d' ' -f1)"
  actual="$(shasum -a 256 "$CACHE/$archive" | cut -d' ' -f1)"
  if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
    echo "Checksum mismatch for $archive — delete $CACHE and retry." >&2
    exit 1
  fi
  dest="$STAGE/runtime/$target"
  mkdir -p "$dest"
  # Only the node executable and its licence are needed.
  tar -xzf "$CACHE/$archive" -C "$dest" --strip-components=1 \
    "node-$NODE_VERSION-$target/bin/node" "node-$NODE_VERSION-$target/LICENSE"
done

echo "==> Writing launchers and instructions"
cat > "$STAGE/start-mac.command" <<'EOF'
#!/bin/bash
# Double-click to start JARVIS on macOS (Apple Silicon). Close this window to stop it.
DIR="$(cd "$(dirname "$0")" && pwd)"
# Files copied from the internet or AirDrop are quarantined; clear it for the bundled runtime.
xattr -dr com.apple.quarantine "$DIR" 2>/dev/null
if [ "$(uname -m)" != "arm64" ]; then
  echo "This JARVIS package includes a runtime for Apple Silicon Macs only."
  read -r -p "Press Enter to close." _; exit 1
fi
exec "$DIR/start-common.sh" "$DIR/runtime/darwin-arm64/bin/node" open
EOF

cat > "$STAGE/start-linux.sh" <<'EOF'
#!/bin/bash
# Run ./start-linux.sh to start JARVIS on Linux (x86-64). Press Ctrl+C to stop it.
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ "$(uname -m)" != "x86_64" ]; then
  echo "This JARVIS package includes a runtime for 64-bit x86 Linux only."; exit 1
fi
exec "$DIR/start-common.sh" "$DIR/runtime/linux-x64/bin/node" xdg-open
EOF

cat > "$STAGE/start-common.sh" <<'EOF'
#!/bin/bash
# Shared launcher. Usage: start-common.sh <node binary> <command that opens a URL>
DIR="$(cd "$(dirname "$0")" && pwd)"
NODE="$1"
OPENER="$2"

# Saved connections, history and the encryption key stay inside this folder.
export NODE_ENV=production
export JARVIS_DATA_DIR="${JARVIS_DATA_DIR:-$DIR/data}"
export JARVIS_HOST="${JARVIS_HOST:-127.0.0.1}"
export JARVIS_PORT="${JARVIS_PORT:-4310}"

# Optional settings (port, network access, login): copy jarvis.env.example to jarvis.env.
ENV_FILE="$DIR/jarvis.env"
if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
fi

URL="http://localhost:$JARVIS_PORT"
chmod +x "$NODE" 2>/dev/null

if "$NODE" -e "
  const s = require('net').createServer();
  s.once('error', () => process.exit(1));
  s.listen(Number(process.env.JARVIS_PORT), process.env.JARVIS_HOST, () => s.close());
"; then :; else
  echo "Port $JARVIS_PORT is already in use. Is JARVIS already running? Open $URL"
  echo "To use another port, set JARVIS_PORT in jarvis.env (see jarvis.env.example)."
  read -r -p "Press Enter to close." _ 2>/dev/null; exit 1
fi

echo "Starting JARVIS on $URL"
echo "Keep this window open while you use JARVIS. Close it (or press Ctrl+C) to stop."
echo

# Open the browser once the server answers.
(
  for _ in $(seq 1 60); do
    if "$NODE" -e "fetch('http://127.0.0.1:$JARVIS_PORT/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))" 2>/dev/null; then
      command -v "$OPENER" >/dev/null 2>&1 && "$OPENER" "$URL" >/dev/null 2>&1
      exit 0
    fi
    sleep 0.5
  done
) &

exec "$NODE" --enable-source-maps "$DIR/app/server/dist/index.mjs"
EOF

cat > "$STAGE/jarvis.env.example" <<'EOF'
# Optional settings. Copy this file to "jarvis.env" (same folder) and uncomment lines.

# Port JARVIS listens on (default 4310).
# JARVIS_PORT=4310

# ── Let other computers on your network use this JARVIS ─────────────────────────
# Listen on the network, require a login, and name the address others will type
# (find this computer's IP: macOS `ipconfig getifaddr en0`, Linux `hostname -I`).
# JARVIS_HOST=0.0.0.0
# JARVIS_PUBLIC_ORIGIN=http://192.168.1.20:4310
# JARVIS_AUTH_USERNAME=admin
# JARVIS_AUTH_PASSWORD=choose-a-strong-password

# Time limit for queries, in milliseconds.
# JARVIS_QUERY_TIMEOUT_MS=30000
EOF

cat > "$STAGE/README.txt" <<EOF
JARVIS $VERSION — Just A Relational Visualization & Interactive SQL
=====================================================================

Nothing to install. Everything JARVIS needs is in this folder.

START
-----
macOS (Apple Silicon: M1/M2/M3/M4)
  Double-click "start-mac.command".
  If macOS says it "cannot be opened" or is from an "unidentified developer":
  right-click start-mac.command → Open → Open. (Only needed the first time.)
  Or, in Terminal:  xattr -dr com.apple.quarantine /path/to/JARVIS

Linux (64-bit x86)
  In a terminal, inside this folder:   ./start-linux.sh

Your browser opens http://localhost:4310 . Keep the terminal window open while
you use JARVIS; close it (or press Ctrl+C) to stop JARVIS.

CONNECT TO MYSQL
----------------
Click "+ New connection", enter host, port, username and password, click Test,
then "Save & connect". For MySQL on the same computer use host 127.0.0.1,
port 3306.

YOUR DATA
---------
Saved connections are kept in the "data" folder here (passwords encrypted).
Delete that folder to start fresh. Move the whole JARVIS folder to keep them.

OPTIONS
-------
Copy jarvis.env.example to jarvis.env to change the port, or to let other
computers on your network use this JARVIS (with a login).
EOF

chmod +x "$STAGE/start-mac.command" "$STAGE/start-linux.sh" "$STAGE/start-common.sh" \
  "$STAGE"/runtime/*/bin/node

echo "==> Creating zip"
(cd "$OUT" && zip -qry "$ZIP" JARVIS -x '*.DS_Store')
echo
echo "Done: $ZIP ($(du -h "$ZIP" | cut -f1))"
