# Offline Map Architecture

## The constraint

MapLibre **Native** (Android) has no PMTiles support, and it fetches tiles over
HTTP. Its `OfflineManager` downloads tiles from a *remote* style URL — the
opposite of this app's zero-network requirement. `TransformRequestManager` can
only rewrite URLs/headers; it cannot serve bytes from a local file.

## The approach

Run **MapLibre GL JS inside a WebView**, with tile byte-ranges bridged to
`expo-file-system`.

```
  WebView (MapLibre GL JS + pmtiles.js, both inlined)
        │  pmtiles://local/{z}/{x}/{y}
        ▼
  pmtiles.Protocol  ──►  window.__readRange(offset, length)
        │                        │  postMessage {type:'range', id, offset, length}
        │                        ▼
        │                 React Native  ──►  File.slice(offset, offset+length)
        │                        │              on the pack's base-map.pmtiles
        │                        ▼
        └─────────────  injectJavaScript(window.__rangeResult(id, base64))
```

Glyphs use a second custom protocol, `localglyph://`, served from base64 PBF
bundled in `mapBundles.generated.ts`. No network at any point.

## Why the HTML is written to disk

The generated document is ~1.8 MB (inlined MapLibre + glyphs). Android
WebView's `loadData` has a size limit, so `MapView` writes the document to
`<cache>/map/map-<region>.html` and loads it via `file://`.

## Files

| File | Role |
|------|------|
| `app/src/components/map/MapView.tsx` | WebView host, range bridge, HTML builder |
| `app/src/components/map/mapBundles.generated.ts` | Inlined MapLibre JS/CSS, pmtiles JS, glyph PBFs |
| `data-pipeline/scripts/gen_map_bundles.py` | Regenerates the bundles module from `app/assets/map/` |
| `data-pipeline/scripts/fetch_basemap.sh` | Extracts a region's PMTiles from the global Protomaps build |
| `data-pipeline/scripts/test_map_pmtiles.js` | Verifies the range-read path against the real pack |
| `data-pipeline/scripts/gen_map_test_html.py` | Builds a browser-testable copy of the map |
| `data-pipeline/scripts/range_server.py` | Range-capable static server for browser verification |

## Verifying the map without a device

```bash
# 1. generate the browser copy
python data-pipeline/scripts/gen_map_test_html.py

# 2. serve it (python -m http.server will NOT work — no Range support)
python data-pipeline/scripts/range_server.py /tmp/map_test 8899

# 3. open http://127.0.0.1:8899/index.html
```

Expected: roads, water, landuse, place labels, the coverage circle and the site
marker, all rendered from the local 84 MB PMTiles.

## Data source

Basemap tiles come from the Protomaps global build
(`https://build.protomaps.com/20261001.pmtiles`, ~138 GB) via
`pmtiles extract --bbox=... --maxzoom=12`, which pulls only the needed tiles
over HTTP range requests. Rajasthan is 84 MB at z0–12. Attribution: OpenStreetMap.
