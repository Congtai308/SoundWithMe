#!/bin/sh
# Starts the API (internal port 4000) and the web server (the host's $PORT)
# in one container, and stops the container if either one dies so the host
# restarts it. Used by infrastructure/docker/app.Dockerfile.
set -eu

# The public address, unless set explicitly: Render provides RENDER_EXTERNAL_URL.
PUBLIC_URL="${WEB_APP_URL:-${RENDER_EXTERNAL_URL:-}}"
if [ -z "$PUBLIC_URL" ]; then
  echo "Set WEB_APP_URL to the site's public https address" >&2
  exit 1
fi
export WEB_APP_URL="$PUBLIC_URL"
export GOOGLE_CALLBACK_URL="${GOOGLE_CALLBACK_URL:-$PUBLIC_URL/api/v1/auth/google/callback}"
# Both processes share a small instance (512 MB on Render's free plan).
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=200}"

(cd apps/api && PORT=4000 node dist/main.js) &
API_PID=$!
(cd apps/web && API_PROXY_TARGET=http://localhost:4000 node server.mjs) &
WEB_PID=$!

# Whichever exits first takes the container down with it.
while kill -0 "$API_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do
  sleep 2
done
echo "A process stopped; shutting down" >&2
kill "$API_PID" "$WEB_PID" 2>/dev/null || true
exit 1
