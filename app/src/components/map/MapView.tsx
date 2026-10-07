/**
 * Offline vector map: MapLibre GL JS inside a WebView.
 *
 * Why a WebView: MapLibre Native (Android) has no PMTiles support and fetches
 * tiles over HTTP. MapLibre GL JS can register custom protocol handlers, so we
 * register `pmtiles://` (tiles) and `localglyph://` (font glyphs) and serve
 * both from files bundled with / installed by the app. Nothing touches the
 * network.
 *
 * Flow:
 *   1. MapView builds an HTML doc with the inlined MapLibre + PMTiles bundles
 *   2. PMTiles protocol reads byte ranges via window.__readRange -> RN bridge
 *   3. RN reads those bytes from the pack's local .pmtiles file and returns
 *      them base64-encoded via injectJavaScript
 *   4. Glyphs come from GLYPHS (bundled base64) with no bridge round-trip
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { File, Directory, Paths } from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { packDir } from '../../data/DataPackManager';
import { MAPLIBRE_JS, PMTILES_JS, MAPLIBRE_CSS, GLYPHS } from './mapBundles.generated';

/** Path to a pack's base map PMTiles file. */
function packBaseMapPath(region: string): string {
  return `${packDir(region).uri}/tiles/base-map.pmtiles`;
}

interface Tower {
  lat: number;
  lon: number;
  operator?: string;
}

interface MapViewProps {
  region: string;
  siteLat: number;
  siteLon: number;
  onMapPress?: (lat: number, lon: number) => void;
  radiusKm?: number;
  towers?: Tower[];
  fiberSegments?: number[][][];
}

export default function MapView({
  region,
  siteLat,
  siteLon,
  onMapPress,
  radiusKm = 5,
  towers = [],
  fiberSegments = [],
}: MapViewProps) {
  const webRef = useRef<WebView>(null);
  // URI of the pack's base-map .pmtiles file, used for ranged reads.
  const baseMapUriRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [htmlUri, setHtmlUri] = useState<string | null>(null);

  const baseMapPath = packBaseMapPath(region);

  useEffect(() => {
    const f = new File(baseMapPath);
    if (!f.exists) {
      setError(
        'Base map tiles are not in this pack. ' +
          'This looks like a Lite pack — install a Full pack to see the map.',
      );
      return;
    }
    baseMapUriRef.current = f.uri;
  }, [baseMapPath]);

  // Build the HTML once per site/layer combination, and write it to disk.
  // A ~1.8 MB inline `source={{html}}` string sits at Android WebView's
  // loadData size limit, so we load the document from a file:// URI instead.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const doc = buildMapHtml({
          siteLat, siteLon, radiusKm, towers, fiberSegments, glyphs: GLYPHS,
        });
        const dir = new Directory(Paths.cache, 'map');
        if (!dir.exists) dir.create({ intermediates: true });
        const f = new File(dir, `map-${region}.html`);
        if (f.exists) f.delete();
        f.create();
        f.write(doc);
        if (!cancelled) {
          setHtmlUri(f.uri);
          setReady(false);
        }
      } catch (e: any) {
        if (!cancelled) setError(`Failed to prepare map: ${e?.message ?? e}`);
      }
    })();
    return () => { cancelled = true; };
  }, [siteLat, siteLon, radiusKm, towers, fiberSegments, region]);

  const handleMessage = useCallback(
    async (event: any) => {
      let msg: any;
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }

      if (msg.type === 'ready') {
        setReady(true);
        return;
      }
      if (msg.type === 'press' && onMapPress) {
        onMapPress(msg.lat, msg.lon);
        return;
      }
      if (msg.type === 'error') {
        setError(String(msg.message));
        return;
      }
      if (msg.type === 'log') {
        console.log('[map]', msg.message);
        return;
      }

      if (msg.type === 'range' && baseMapUriRef.current) {
        const { id, offset, length } = msg;
        try {
          // Range read straight from disk via the legacy API: expo-file-system's
          // new `File.slice()` returns an RN Blob, and RN's Blob has no
          // `arrayBuffer()` — only `slice`/`close` — so it cannot be used here.
          const b64 = await FileSystemLegacy.readAsStringAsync(baseMapUriRef.current, {
            encoding: FileSystemLegacy.EncodingType.Base64,
            position: offset,
            length,
          });
          webRef.current?.injectJavaScript(
            `window.__rangeResult(${JSON.stringify(id)}, ${JSON.stringify(b64)}); true;`,
          );
        } catch (e: any) {
          webRef.current?.injectJavaScript(
            `window.__rangeResult(${JSON.stringify(id)}, null); true;`,
          );
        }
      }
    },
    [onMapPress],
  );

  if (error) {
    return (
      <View style={s.container}>
        <Text style={s.errorText}>{error}</Text>
        <Text style={s.hint}>Install a data pack that includes base map tiles.</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {htmlUri && (
        <WebView
          ref={webRef}
          style={s.map}
          originWhitelist={['*']}
          source={{ uri: htmlUri }}
          onMessage={handleMessage}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          androidLayerType="hardware"
          mixedContentMode="never"
          setSupportMultipleWindows={false}
        />
      )}
      {!ready && (
        <View style={s.loading} pointerEvents="none">
          <ActivityIndicator size="large" color="#1e40af" />
          <Text style={s.loadingText}>Loading offline map…</Text>
        </View>
      )}
    </View>
  );
}

interface HtmlOpts {
  siteLat: number;
  siteLon: number;
  radiusKm: number;
  towers: Tower[];
  fiberSegments: number[][][];
  glyphs: Record<string, string>;
}

function buildMapHtml({
  siteLat,
  siteLon,
  radiusKm,
  towers,
  fiberSegments,
  glyphs,
}: HtmlOpts): string {
  const towersGeo = {
    type: 'FeatureCollection',
    features: towers.map((t) => ({
      type: 'Feature',
      properties: { operator: t.operator ?? '' },
      geometry: { type: 'Point', coordinates: [t.lon, t.lat] },
    })),
  };
  const fiberGeo = {
    type: 'FeatureCollection',
    features: fiberSegments.map((coords) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coords },
    })),
  };

  // Inline the bundles. `</script>` cannot appear in them (verified at build).
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>${MAPLIBRE_CSS}
  html, body, #map { margin:0; padding:0; height:100%; width:100%; background:#f1f5f9; }
</style>
</head>
<body>
<div id="map"></div>
<script>
// ---- RN bridge: byte-range reads + event posting ----
(function(){
  var pending = {}, seq = 0;
  window.__rangeResult = function(id, b64){
    var p = pending[id];
    if (!p) return;
    delete pending[id];
    if (b64 == null) { p.reject(new Error('range read failed')); return; }
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    p.resolve(bytes.buffer);
  };
  window.__readRange = function(offset, length){
    return new Promise(function(resolve, reject){
      var id = 'r' + (seq++);
      pending[id] = { resolve: resolve, reject: reject };
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type:'range', id:id, offset:offset, length:length
      }));
    });
  };
  window.__post = function(o){ window.ReactNativeWebView.postMessage(JSON.stringify(o)); };
  window.__glyphs = ${JSON.stringify(glyphs)};
})();
</script>
<script>${MAPLIBRE_JS}</script>
<script>${PMTILES_JS}</script>
<script>
(function(){
  try {
    var protocol = new pmtiles.Protocol({ metadata: true });
    maplibregl.addProtocol('pmtiles', protocol.tile);
    protocol.add(new pmtiles.PMTiles({
      getKey: function(){ return 'local'; },
      getBytes: function(offset, length){
        return window.__readRange(offset, length).then(function(buf){ return { data: buf }; });
      }
    }));

    // Glyphs: serve bundled base64 PBF, no network.
    maplibregl.addProtocol('localglyph', function(params, abortController){
      var m = params.url.match(/^localglyph:\\/\\/(.+)/);
      var key = m ? decodeURIComponent(m[1]) : '';
      var b64 = window.__glyphs[key];
      if (!b64) return Promise.resolve({ data: new Uint8Array(0) });
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return Promise.resolve({ data: bytes.buffer });
    });
  } catch (e) {
    window.__post({ type:'error', message: 'protocol: ' + e.message });
  }

  var style = {
    version: 8,
    glyphs: 'localglyph://{fontstack}/{range}',
    sources: { basemap: { type:'vector', url:'pmtiles://local' } },
    layers: [
      { id:'bg', type:'background', paint:{ 'background-color':'#f1f5f9' } },
      { id:'earth', type:'fill', source:'basemap', 'source-layer':'earth',
        paint:{ 'fill-color':'#f8fafc' } },
      { id:'landcover', type:'fill', source:'basemap', 'source-layer':'landcover',
        paint:{ 'fill-color':'#e8f3e8', 'fill-opacity':0.7 } },
      { id:'landuse', type:'fill', source:'basemap', 'source-layer':'landuse',
        paint:{ 'fill-color':'#eef6ee', 'fill-opacity':0.6 } },
      { id:'water', type:'fill', source:'basemap', 'source-layer':'water',
        paint:{ 'fill-color':'#bfdbfe' } },
      { id:'roads-minor', type:'line', source:'basemap', 'source-layer':'roads',
        filter:['in',['get','kind'],['literal',['minor_road','path','track']]],
        paint:{ 'line-color':'#cbd5e1', 'line-width':['interpolate',['linear'],['zoom'],8,0.3,14,1.4] } },
      { id:'roads-major', type:'line', source:'basemap', 'source-layer':'roads',
        filter:['in',['get','kind'],['literal',['highway','major_road','medium_road']]],
        paint:{ 'line-color':'#94a3b8', 'line-width':['interpolate',['linear'],['zoom'],6,0.4,14,2.2] } },
      { id:'boundaries', type:'line', source:'basemap', 'source-layer':'boundaries',
        paint:{ 'line-color':'#cbd5e1', 'line-width':0.6, 'line-dasharray':[3,2] } },
      { id:'places', type:'symbol', source:'basemap', 'source-layer':'places',
        filter:['has','name'],
        layout:{ 'text-field':['get','name'], 'text-size':11,
                 'text-font':['Noto Sans Regular'], 'text-max-width':8 },
        paint:{ 'text-color':'#334155', 'text-halo-color':'#ffffff', 'text-halo-width':1.2 } }
    ]
  };

  var map = new maplibregl.Map({
    container:'map', style:style,
    center:[${siteLon}, ${siteLat}], zoom:11, attributionControl:false
  });

  map.on('load', function(){
    var R = ${radiusKm}, latR = ${siteLat} * Math.PI/180, pts = [];
    var dLat = R/111.32, dLon = R/(111.32*Math.cos(latR));
    for (var i=0;i<=64;i++){ var th=(i/64)*2*Math.PI;
      pts.push([${siteLon}+dLon*Math.cos(th), ${siteLat}+dLat*Math.sin(th)]); }
    map.addSource('radius',{ type:'geojson', data:{ type:'Feature', properties:{},
      geometry:{ type:'Polygon', coordinates:[pts] } } });
    map.addLayer({ id:'radius-fill', type:'fill', source:'radius',
      paint:{ 'fill-color':'#3b82f6', 'fill-opacity':0.08 } });
    map.addLayer({ id:'radius-line', type:'line', source:'radius',
      paint:{ 'line-color':'#3b82f6', 'line-width':1.5, 'line-opacity':0.6 } });

    map.addSource('site',{ type:'geojson', data:{ type:'Feature', properties:{},
      geometry:{ type:'Point', coordinates:[${siteLon}, ${siteLat}] } } });
    map.addLayer({ id:'site-marker', type:'circle', source:'site',
      paint:{ 'circle-color':'#1e40af','circle-radius':7,
              'circle-stroke-width':2,'circle-stroke-color':'#ffffff' } });

    var tw = ${JSON.stringify(towersGeo)};
    if (tw.features.length) {
      map.addSource('towers',{ type:'geojson', data:tw });
      map.addLayer({ id:'towers', type:'circle', source:'towers',
        paint:{ 'circle-color':'#ef4444','circle-radius':4,'circle-opacity':0.75 } });
    }
    var fb = ${JSON.stringify(fiberGeo)};
    if (fb.features.length) {
      map.addSource('fiber',{ type:'geojson', data:fb });
      map.addLayer({ id:'fiber', type:'line', source:'fiber',
        paint:{ 'line-color':'#3b82f6','line-width':2,'line-opacity':0.85 } });
    }
    window.__post({ type:'ready' });
  });

  map.on('click', function(e){
    window.__post({ type:'press', lat:e.lngLat.lat, lon:e.lngLat.lng });
  });
  map.on('error', function(e){
    if (e && e.error) window.__post({ type:'error', message: e.error.message || String(e.error) });
  });
})();
</script>
</body>
</html>`;
}

const s = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  map: { flex: 1, backgroundColor: '#f1f5f9' },
  loading: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { marginTop: 8, color: '#64748b' },
  errorText: { color: '#dc2626', fontWeight: '600', textAlign: 'center', marginTop: 40 },
  hint: { color: '#94a3b8', fontSize: 12, textAlign: 'center', marginTop: 8 },
});
