#!/usr/bin/env bash
# Fetch a Protomaps basemap extract for a region via HTTP range requests.
#
# The global Protomaps build is ~138 GB; `pmtiles extract` pulls only the
# tiles inside the bbox, so this is fast and small (~80 MB for Rajasthan).
#
# Usage:
#   ./fetch_basemap.sh rajasthan 69.0,23.0,78.5,30.5 12
set -euo pipefail

REGION="${1:?region name required, e.g. rajasthan}"
BBOX="${2:?bbox required, e.g. 69.0,23.0,78.5,30.5}"
MAXZOOM="${3:-12}"

PMTILES_BIN="${PMTILES_BIN:-$HOME/.local/pmtiles-cli/pmtiles}"
SOURCE="${PMTILES_SOURCE:-https://build.protomaps.com/20261001.pmtiles}"
OUT_DIR="${OUT_DIR:-/home/lakshya/company/towerfeasibility/data/basemap}"

mkdir -p "$OUT_DIR"

echo "extracting $REGION  bbox=$BBOX  maxzoom=$MAXZOOM"
"$PMTILES_BIN" extract "$SOURCE" "$OUT_DIR/$REGION.pmtiles" \
  --bbox="$BBOX" --maxzoom="$MAXZOOM"

ls -la "$OUT_DIR/$REGION.pmtiles"
echo "done: $OUT_DIR/$REGION.pmtiles"
