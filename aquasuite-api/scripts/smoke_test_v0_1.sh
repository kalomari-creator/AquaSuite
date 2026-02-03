#!/usr/bin/env bash
set -euo pipefail

LOCATION_ID=${1:-""}

LOGIN=$(printf '{"username":"admin","pin":"1590"}' | \
  curl -s -X POST http://127.0.0.1:3000/auth/login \
  -H "Content-Type: application/json" \
  -d @-)

TOKEN=$(node -e 'const d=JSON.parse(process.argv[1]||"{}"); console.log(d.token||"")' "$LOGIN")
if [ -z "$TOKEN" ]; then
  echo "Login failed"
  exit 1
fi

LOC=$(curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3000/locations)
if ! echo "$LOC" | grep -q "email_tag"; then
  echo "locations missing email_tag"
  exit 1
fi

if [ -n "$LOCATION_ID" ]; then
  curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:3000/instructor-variants?locationId=$LOCATION_ID" > /dev/null
fi

if [ ! -f /var/www/aquasuite/version.json ]; then
  echo "version.json missing in /var/www/aquasuite"
  exit 1
fi

STAFF_FILE="/home/swimlabs-server/Downloads/team-Westchester Swim Studios.csv"
if [ -f "$STAFF_FILE" ]; then
  echo "Staff file exists, run: npm run staff:import -- --file '$STAFF_FILE' --location slw"
else
  echo "Staff file not found; skipping staff import"
fi

curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3000/intakes > /dev/null

echo "v0.1 smoke test OK"
