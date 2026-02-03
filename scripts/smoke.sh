#!/usr/bin/env bash
set -euo pipefail

curl -fsS https://app.aqua-suite.app/ | head -n 5
curl -fsS https://app.aqua-suite.app/version.json
curl -fsS https://api.aqua-suite.app/health
curl -fsS https://api.aqua-suite.app/meta

