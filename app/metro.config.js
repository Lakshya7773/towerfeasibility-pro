// Metro config — adds data-pack asset extensions so the bundled pack files
// (PMTiles, SQLite, GeoJSON) are treated as assets and copied into the APK.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Treat pack data files as assets rather than source modules.
// `tif` matters: the pack now ships population + elevation GeoTIFFs, and
// without this Metro tries to parse them as source and the bundle fails.
const extraExts = ['pmtiles', 'sqlite', 'geojson', 'tif', 'tiff'];
config.resolver.assetExts = Array.from(
  new Set([...config.resolver.assetExts, ...extraExts]),
);

// geotiff imports `web-worker` for worker-based decoding; React Native has
// no Web Worker API, so resolve it to a stub that throws if actually used.
const origResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'web-worker') {
    return { type: 'sourceFile', filePath: require.resolve('./src/stubs/web-worker.js') };
  }
  if (origResolve) return origResolve(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
