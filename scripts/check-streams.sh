#!/usr/bin/env bash
set -euo pipefail
# Airwave stream-health checker.
# Reads public/channels.json, probes every stream URL, and reports dead ones.
# A stream is "alive" only if ALL of these hold:
#   1. HTTP 200,
#   2. body starts with #EXTM3U (a real HLS playlist),
#   3. the response includes `Access-Control-Allow-Origin: *`
#      (without it the playlist loads for curl/VLC but the browser refuses
#      to play it — this was the cause of the Oct 2026 "stream is down" wave).
# Exit 0 = all healthy.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JSON="$ROOT/public/channels.json"
REPORT="$ROOT/scripts/last-check.txt"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
TMPDIR_WORK="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_WORK"' EXIT

count=0
dead=()

while IFS=$'\t' read -r id name stream; do
  count=$((count+1))
  # NOTE: the Origin header matters — many CDNs only send CORS headers when
  # the request carries one, exactly like a real browser does.
  code="$(curl -sL --compressed -m 15 -A "$UA" -H "Origin: https://airwave-psi.vercel.app" -D "$TMPDIR_WORK/hdrs_$id" -o "$TMPDIR_WORK/body_$id" -w "%{http_code}" "$stream" 2>/dev/null || echo 000)"
  head="$(head -c 7 "$TMPDIR_WORK/body_$id" 2>/dev/null)"
  cors="$(grep -im1 '^access-control-allow-origin:' "$TMPDIR_WORK/hdrs_$id" 2>/dev/null || true)"
  if [ "$code" != "200" ] || [ "$head" != "#EXTM3U" ] || [ -z "$cors" ]; then
    dead+=("$id | $name | http=$code head=${head:-empty} cors=${cors:-MISSING}")
  fi
done < <(jq -r '.[] | [.id, .name, .stream] | @tsv' "$JSON")

{
  echo "checked: $count"
  echo "dead: ${#dead[@]}"
  echo "at: $(date -u +%FT%TZ)"
  for d in "${dead[@]:-}"; do echo "DEAD: $d"; done
} > "$REPORT"

if [ "${#dead[@]}" -eq 0 ]; then
  echo "OK: all $count streams healthy"
  exit 0
else
  echo "FAIL: ${#dead[@]} of $count streams dead"
  printf '%s\n' "${dead[@]}"
  exit 1
fi
