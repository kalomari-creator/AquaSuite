# AquaSuite Web V1

## Overview
Static web app built with Vite. Source lives in /web; build outputs to /dist.

## Build
- npm install
- npm run build

## Deploy
- Copy /dist to a staging dir
- Atomic swap into /var/www/aquasuite
- Ensure version.json cache-busting behavior remains

## Safety
- Do not store secrets in frontend.
- All access control enforced by the API.
