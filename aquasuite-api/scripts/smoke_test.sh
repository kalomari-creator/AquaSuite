#!/usr/bin/env bash
set -euo pipefail

LOCATION_ID=${1:?"locationId required"}
DATE=${2:-$(date +%F)}
FILE=${3:-/tmp/rollsheet.html}

LOGIN=$(curl -s -X POST http://127.0.0.1:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","pin":"1590"}')

TOKEN=$(node -e 'const d=JSON.parse(process.argv[1]||"{}"); console.log(d.token||"")' "$LOGIN")
if [ -z "$TOKEN" ]; then
  echo "Login failed: $LOGIN"
  exit 1
fi

UPLOAD=$(curl -s -H "Authorization: Bearer $TOKEN" \
  -F "file=@${FILE}" \
  "http://127.0.0.1:3000/uploads/roster?locationId=${LOCATION_ID}&date=${DATE}")

echo "Upload response: $UPLOAD"
CLASSES_INSERTED=$(node -e 'const d=JSON.parse(process.argv[1]||"{}"); console.log(d.classesInserted||0)' "$UPLOAD")
if [ "$CLASSES_INSERTED" -le 0 ]; then
  echo "No classes inserted"
  exit 1
fi

CLASSES=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3000/class-instances?locationId=${LOCATION_ID}&date=${DATE}")

CLASS_COUNT=$(node -e 'const d=JSON.parse(process.argv[1]||"{}"); console.log((d.classes||[]).length)' "$CLASSES")
if [ "$CLASS_COUNT" -le 0 ]; then
  echo "No classes returned"
  exit 1
fi

echo "Smoke test OK: $CLASS_COUNT classes"
