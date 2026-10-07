/**
 * Stub for `web-worker` — React Native has no Web Worker API.
 * geotiff imports this for worker-based decoding; we force synchronous mode
 * by making the import resolve to this no-op stub.
 */
module.exports = class Worker {
  constructor() {
    throw new Error('Web Workers are not supported in React Native');
  }
};
