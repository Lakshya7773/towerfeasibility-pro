#!/usr/bin/env python3
"""
Build a browser-testable version of the offline map HTML.

The app runs this HTML in a WebView and serves PMTiles byte ranges over the RN
bridge. This script produces the same document but with a browser shim that
reads ranges over HTTP, so the map can be verified in a real browser before
trusting the WebView.

Writes /tmp/map_test/index.html and expects base-map.pmtiles alongside it.
"""
import base64
import json
import os
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(HERE, "..", "..", "app"))
ASSETS = os.path.join(APP, "assets", "map")
PACK_TILES = os.path.abspath(
    os.path.join(HERE, "..", "..", "dist", "packs", "data-pack-rajasthan", "tiles")
)
OUT = "/tmp/map_test"

GLYPHS = {
    "Noto Sans Regular/0-255": "Noto_Sans_Regular__0-255.pbf",
    "Noto Sans Regular/256-511": "Noto_Sans_Regular__256-511.pbf",
    "Noto Sans Regular/512-767": "Noto_Sans_Regular__512-767.pbf",
    "Noto Sans Devanagari Regular/2304-2559": "Noto_Sans_Devanagari_Regular__2304-2559.pbf",
    "Noto Sans Devanagari Regular/2560-2815": "Noto_Sans_Devanagari_Regular__2560-2815.pbf",
    "Noto Sans Devanagari Regular/2816-3071": "Noto_Sans_Devanagari_Regular__2816-3071.pbf",
}

SITE_LAT, SITE_LON, RADIUS = 26.9124, 75.7873, 5


def read(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


def main():
    os.makedirs(OUT, exist_ok=True)
    shutil.copy2(os.path.join(PACK_TILES, "base-map.pmtiles"),
                 os.path.join(OUT, "base-map.pmtiles"))

    maplibre = read(os.path.join(ASSETS, "maplibre-gl.js"))
    pmtiles = read(os.path.join(ASSETS, "pmtiles.js"))
    css = read(os.path.join(ASSETS, "maplibre-gl.css"))

    glyph_map = {}
    for key, fname in GLYPHS.items():
        p = os.path.join(ASSETS, "glyphs", fname)
        if os.path.exists(p):
            with open(p, "rb") as f:
                glyph_map[key] = base64.b64encode(f.read()).decode("ascii")

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>{css}
html,body,#map{{margin:0;padding:0;height:100%;width:100%;background:#f1f5f9;}}
#err{{position:absolute;top:0;left:0;right:0;background:#fee;color:#900;
      font:12px monospace;padding:6px;white-space:pre-wrap;z-index:9999;display:none;}}
</style></head>
<body>
<div id="map"></div><div id="err"></div>
<script>
// ---- browser shim replacing the React Native bridge ----
window.__status = {{tiles:0, errors:[]}};
window.__log = function(m){{ console.log(m); }};
window.__readRange = function(offset, length){{
  return fetch('/base-map.pmtiles', {{
    headers: {{ 'Range': 'bytes=' + offset + '-' + (offset + length - 1) }}
  }}).then(function(r){{
    if (!r.ok && r.status !== 206) throw new Error('range http ' + r.status);
    return r.arrayBuffer();
  }});
}};
window.onerror = function(msg){{
  var e = document.getElementById('err');
  e.style.display = 'block'; e.textContent += msg + '\\n';
  window.__status.errors.push(String(msg));
}};
window.__glyphs = {json.dumps(glyph_map)};
</script>
<script>{maplibre}</script>
<script>{pmtiles}</script>
<script>
(function(){{
  try {{
    var protocol = new pmtiles.Protocol({{ metadata: true }});
    maplibregl.addProtocol('pmtiles', protocol.tile);
    protocol.add(new pmtiles.PMTiles({{
      getKey: function(){{ return 'local'; }},
      getBytes: function(offset, length){{
        window.__status.tiles++;
        return window.__readRange(offset, length).then(function(buf){{
          return {{ data: buf }};
        }});
      }}
    }}));
    maplibregl.addProtocol('localglyph', function(params){{
      var m = params.url.match(/^localglyph:\\/\\/(.+)/);
      var key = m ? decodeURIComponent(m[1]) : '';
      var b64 = window.__glyphs[key];
      if (!b64) return Promise.resolve({{ data: new Uint8Array(0) }});
      var bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (var i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
      return Promise.resolve({{ data: bytes.buffer }});
    }});
  }} catch(e) {{ window.onerror('protocol: ' + e.message); }}

  var style = {{
    version: 8,
    glyphs: 'localglyph://{{fontstack}}/{{range}}',
    sources: {{ basemap: {{ type:'vector', url:'pmtiles://local' }} }},
    layers: [
      {{ id:'bg', type:'background', paint:{{ 'background-color':'#f1f5f9' }} }},
      {{ id:'earth', type:'fill', source:'basemap', 'source-layer':'earth',
        paint:{{ 'fill-color':'#f8fafc' }} }},
      {{ id:'landcover', type:'fill', source:'basemap', 'source-layer':'landcover',
        paint:{{ 'fill-color':'#e8f3e8', 'fill-opacity':0.7 }} }},
      {{ id:'landuse', type:'fill', source:'basemap', 'source-layer':'landuse',
        paint:{{ 'fill-color':'#eef6ee', 'fill-opacity':0.6 }} }},
      {{ id:'water', type:'fill', source:'basemap', 'source-layer':'water',
        paint:{{ 'fill-color':'#bfdbfe' }} }},
      {{ id:'roads-minor', type:'line', source:'basemap', 'source-layer':'roads',
        filter:['in',['get','kind'],['literal',['minor_road','path','track']]],
        paint:{{ 'line-color':'#cbd5e1', 'line-width':['interpolate',['linear'],['zoom'],8,0.3,14,1.4] }} }},
      {{ id:'roads-major', type:'line', source:'basemap', 'source-layer':'roads',
        filter:['in',['get','kind'],['literal',['highway','major_road','medium_road']]],
        paint:{{ 'line-color':'#94a3b8', 'line-width':['interpolate',['linear'],['zoom'],6,0.4,14,2.2] }} }},
      {{ id:'boundaries', type:'line', source:'basemap', 'source-layer':'boundaries',
        paint:{{ 'line-color':'#cbd5e1', 'line-width':0.6, 'line-dasharray':[3,2] }} }},
      {{ id:'places', type:'symbol', source:'basemap', 'source-layer':'places',
        filter:['has','name'],
        layout:{{ 'text-field':['get','name'], 'text-size':11,
                 'text-font':['Noto Sans Regular'], 'text-max-width':8 }},
        paint:{{ 'text-color':'#334155', 'text-halo-color':'#ffffff', 'text-halo-width':1.2 }} }}
    ]
  }};

  var map = new maplibregl.Map({{
    container:'map', style:style,
    center:[{SITE_LON}, {SITE_LAT}], zoom:11, attributionControl:false
  }});

  map.on('load', function(){{
    var R = {RADIUS}, latR = {SITE_LAT} * Math.PI/180, pts = [];
    var dLat = R/111.32, dLon = R/(111.32*Math.cos(latR));
    for (var i=0;i<=64;i++){{ var th=(i/64)*2*Math.PI;
      pts.push([{SITE_LON}+dLon*Math.cos(th), {SITE_LAT}+dLat*Math.sin(th)]); }}
    map.addSource('radius',{{ type:'geojson', data:{{ type:'Feature', properties:{{}},
      geometry:{{ type:'Polygon', coordinates:[pts] }} }} }});
    map.addLayer({{ id:'radius-fill', type:'fill', source:'radius',
      paint:{{ 'fill-color':'#3b82f6', 'fill-opacity':0.08 }} }});
    map.addLayer({{ id:'radius-line', type:'line', source:'radius',
      paint:{{ 'line-color':'#3b82f6', 'line-width':1.5, 'line-opacity':0.6 }} }});
    map.addSource('site',{{ type:'geojson', data:{{ type:'Feature', properties:{{}},
      geometry:{{ type:'Point', coordinates:[{SITE_LON}, {SITE_LAT}] }} }} }});
    map.addLayer({{ id:'site-marker', type:'circle', source:'site',
      paint:{{ 'circle-color':'#1e40af','circle-radius':7,
              'circle-stroke-width':2,'circle-stroke-color':'#ffffff' }} }});

    window.__status.loaded = true;
    // report what actually rendered
    setTimeout(function(){{
      var feats = {{}};
      ['water','roads','places','earth','landuse','landcover','boundaries'].forEach(function(l){{
        try {{ feats[l] = map.queryRenderedFeatures({{ layers:[l] }}).length; }}
        catch(e) {{ feats[l] = -1; }}
      }});
      window.__status.features = feats;
      window.__status.ok = true;
    }}, 2500);
  }});
  map.on('error', function(e){{
    if (e && e.error) window.__status.errors.push(String(e.error.message || e.error));
  }});
}})();
</script>
</body></html>"""

    with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)

    print(f"wrote {OUT}/index.html")
    print(f"  glyph ranges: {len(glyph_map)}")
    print(f"  basemap copied: {os.path.getsize(os.path.join(OUT,'base-map.pmtiles'))/1e6:.1f} MB")


if __name__ == "__main__":
    main()
