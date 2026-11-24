#!/bin/sh
# Copy app/ to dist/ and stamp the current git sha into it (R6). Deploy dist/.
set -eu
cd "$(dirname "$0")"
sha=$(git rev-parse --short HEAD)
rm -rf dist && cp -R app dist
sed "s/__BUILD_SHA__/$sha/g" app/index.html > dist/index.html
echo "built dist/ at $sha"
