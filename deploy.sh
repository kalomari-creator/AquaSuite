#!/usr/bin/env bash
set -euo pipefail

cd /opt/aquasuite
git pull --rebase

# API
cd /opt/aquasuite/aquasuite-api
npm ci
npm run db:up
pm2 restart aquasuite-api || pm2 start ecosystem.config.js

# (Optional) web landing
sudo systemctl reload nginx || true
