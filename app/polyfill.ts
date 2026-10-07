// Polyfill for Hermes engine — FinalizationRegistry
if (typeof global.FinalizationRegistry === 'undefined') {
  (global as any).FinalizationRegistry = class {
    register() {}
    unregister() {}
  };
}
