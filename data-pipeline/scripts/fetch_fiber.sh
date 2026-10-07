#!/bin/bash
# Download India fiber (BBNL/BharatNet OFC) datasets from ramSeraph/indian_communications
cd /home/lakshya/company/towerfeasibility/data/fiber || exit 1

echo "=== fetching release asset list ==="
curl -s --max-time 60 https://api.github.com/repos/ramSeraph/indian_communications/releases \
  | python3 -c "
import sys, json
for rel in json.load(sys.stdin):
    for a in rel.get('assets', []):
        print(a['name'] + '\t' + a['browser_download_url'])
" > /tmp/fiber_urls.tsv

wc -l /tmp/fiber_urls.tsv

for f in BBNL_OFCs.parquet BBNL_OFCs.pmtiles BBNL_OLTs.parquet BBNL_ONTs.parquet \
         GatiShakti_PMWANI_Hotspots.parquet TNGIS_TANFINET_Links.parquet TNGIS_TANFINET_Nodes.parquet; do
  url=$(awk -F'\t' -v n="$f" '$1==n {print $2}' /tmp/fiber_urls.tsv)
  if [ -z "$url" ]; then echo "!! no URL for $f"; continue; fi
  echo "=== downloading $f"
  curl -sL --max-time 1200 -o "$f" "$url"
  ls -la "$f"
done
echo "=== FIBER DOWNLOAD COMPLETE ==="
ls -la
