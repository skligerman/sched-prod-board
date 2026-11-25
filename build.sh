#!/bin/sh
# Copy app/ to docs/ (served by GitHub Pages) and stamp the current git sha into it (R6).
# The sha is the source commit; commit docs/ after building.
set -eu
cd "$(dirname "$0")"
sha=$(git rev-parse --short HEAD)
rm -rf docs && cp -R app docs
sed "s/__BUILD_SHA__/$sha/g" app/index.html > docs/index.html
echo "built docs/ at $sha"
