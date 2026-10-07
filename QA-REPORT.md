# TowerFeasibility Pro — QA Evaluation Report

**Date:** 2026-10-06  
**Tester:** Automated QA (ADB + logcat + source analysis)  
**Device:** Xiaomi 25028RN03I (Android 15, API 35, 720×1640 @ 320dpi)  
**APK:** `dist/TowerFeasibilityPro-rajasthan-release.apk` (228 MB)  
**Package:** `com.digitalshift.towerfeasibility`

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Overall Status** | 🔴 **BLOCKED — App crashes on launch** |
| Critical Issues | 1 |
| High Issues | 0 (untestable — app won't start) |
| Medium Issues | 0 (untestable) |
| Low Issues | 0 (untestable) |
| Screens Testable | 0 of 5 |
| Features Testable | 0 of 5 |

**The app cannot be launched. It crashes during React Native bundle initialization before any UI is rendered. All functional, UI/UX, and on-device testing is blocked.**

---

## Issue #1 — CRITICAL: App Crashes on Launch (FinalizationRegistry)

### Severity: CRITICAL
### Category: Functional / Build Configuration

### Description

The app crashes immediately on launch with an uncaught JavaScript exception:

```
ReferenceError: Property 'FinalizationRegistry' doesn't exist
```

The crash occurs inside the Hermes JavaScript engine during module loading, before any React component renders. The app process dies with `SIGABRT` and the user sees the app flash and return to the launcher.

### Evidence

**Logcat crash trace:**
```
Abort message: 'terminating due to uncaught exception of type facebook::jni::JniException: 
com.facebook.react.common.JavascriptException: [runtime not ready]: ReferenceError: 
Property 'FinalizationRegistry' doesn't exist, stack:
  anonymous@1:276447
  loadModuleImplementation@1:289875
  guardedLoadModule@1:289506
  metroRequire@1:288854
  anonymous@1:254949
  ...
  facebook::react::Task::execute(facebook::jsi::Runtime&, bool)+312
  facebook::react::RuntimeScheduler_Modern::executeTask(...)
  facebook::react::RuntimeScheduler_Modern::runEventLoop(...)
```

**Native crash (tombstone):**
```
signal 6 (SIGABRT), code -1 (SI_QUEUE)
#07 libreactnative.so — facebook::react::JsErrorHandler::handleErrorWithCppPipeline
#08 libreactnative.so — facebook::react::JsErrorHandler::handleError
```

**Process death:**
```
ActivityManager: Process com.digitalshift.towerfeasibility (pid 25846) has died: cch CRE
WindowManager: WIN DEATH: Window{... com.digitalshift.towerfeasibility/.MainActivity}
```

### Root Cause Analysis

| Factor | Detail |
|--------|--------|
| **Hermes version in APK** | `hermes-v250829098.0.17` (from `sdks/.hermesv1version`) |
| **Hermes version expected** | `hermes-v0.17.0` (from `sdks/.hermesversion`) |
| **JS engine setting** | `hermesEnabled=false` in `android/gradle.properties` |
| **JS bundle format** | Hermes bytecode (magic: `c61fbc03`) |
| **Native libs in APK** | `libhermesvm.so` (2.4 MB), `libreactnative.so` (6.9 MB) |
| **React Native version** | 0.86.3 |
| **New Architecture** | `newArchEnabled=false` |

**The mismatch:** The APK contains Hermes bytecode and `libhermesvm.so`, but `hermesEnabled=false` in gradle.properties. The Hermes engine bundled in the APK does not include `FinalizationRegistry` support (it's a newer Hermes feature), but the JS bundle or one of its dependencies references it.

The crash stack shows the error originates in `loadModuleImplementation` → `metroRequire` → `anonymous`, meaning a module loaded at startup references `FinalizationRegistry` which doesn't exist in this Hermes build.

### Steps to Reproduce

1. Install the APK: `adb install -r TowerFeasibilityPro-rajasthan-release.apk`
2. Launch: `adb shell am start -n com.digitalshift.towerfeasibility/.MainActivity`
3. **Result:** App crashes immediately, returns to launcher

### Expected Behavior
App should launch and display the splash screen ("TowerFeasibility Pro" + loading indicator), then transition to the Home screen.

### Actual Behavior
App crashes during JS bundle initialization. No UI is ever rendered.

### Likely Fixes
1. **Add FinalizationRegistry polyfill** to the app entry point (`index.ts` or `App.tsx`):
   ```typescript
   if (typeof global.FinalizationRegistry === 'undefined') {
     global.FinalizationRegistry = class {
       register() {}
       unregister() {}
     };
   }
   ```
2. **Or** rebuild with a Hermes version that includes `FinalizationRegistry` support
3. **Or** identify which npm dependency references `FinalizationRegistry` and replace/patch it

---

## App Architecture (Source Analysis)

Since the app cannot be launched, the following is from source code analysis only.

### Screens (5)
| Screen | File | Purpose |
|--------|------|---------|
| Home | `src/screens/HomeScreen.tsx` | Main landing screen |
| Data Packs | `src/screens/DataPackScreen.tsx` | Manage offline data packs |
| Map | `src/screens/MapScreen.tsx` | Map view with tower sites |
| Analysis | `src/screens/AnalysisScreen.tsx` | Feasibility analysis |
| Report | `src/screens/ReportScreen.tsx` | Report generation |

### Navigation
- React Navigation v7 (`@react-navigation/native-stack`)
- Stack navigator with 5 screens
- Initial route: Home

### Data Layer
- **Offline-first:** Data packs installed from APK assets on first launch
- **Integrity checking:** MD5 + size verification of installed packs
- **SQLite:** `expo-sqlite` for local data storage
- **Raster sampling:** `src/data/RasterSampler.ts` for geospatial data
- **PMTiles:** Bundled map tiles for offline map display

### Analysis Engines (7)
| Engine | File |
|--------|------|
| Tower | `src/analysis/towerEngine.ts` |
| Line-of-Sight | `src/analysis/losEngine.ts` |
| Population | `src/analysis/populationEngine.ts` |
| Administrative | `src/analysis/adminEngine.ts` |
| Resource | `src/analysis/resourceEngine.ts` |
| Row | `src/analysis/rowEngine.ts` |
| Soil | `src/analysis/soilEngine.ts` |

### Report System
- `src/report/ReportBuilder.ts` — builds report data
- `src/report/ReportRenderer.ts` — renders report UI
- `src/report/reportHtml.ts` — HTML report generation

---

## Testing Scope & Blockers

### What Could NOT Be Tested
- ❌ All 5 screens (app won't launch)
- ❌ Navigation flow
- ❌ Map rendering and interaction
- ❌ Data pack installation
- ❌ Analysis engines
- ❌ Report generation
- ❌ UI/UX quality
- ❌ Touch interactions
- ❌ Offline functionality
- ❌ Performance
- ❌ Accessibility

### What Was Verified
- ✅ APK installs successfully
- ✅ App process starts
- ✅ Crash is reproducible (100% failure rate)
- ✅ Crash is in JS engine initialization, not native code
- ✅ Source code structure is sound (proper navigation, data layer, analysis engines)

---

## Recommendations

### Immediate (P0)
1. **Fix the FinalizationRegistry crash** — add a polyfill in `index.ts` before any other imports:
   ```typescript
   // Polyfill for Hermes engine
   if (typeof global.FinalizationRegistry === 'undefined') {
     (global as any).FinalizationRegistry = class {
       register() {}
       unregister() {}
     };
   }
   ```
2. Rebuild and redeploy the APK
3. Re-run this QA suite

### Post-Fix (P1)
4. Test all 5 screens end-to-end
5. Verify data pack installation flow
6. Test map rendering with bundled PMTiles
7. Validate analysis engine outputs
8. Test report generation and sharing
9. Verify offline functionality (airplane mode)
10. Test on multiple Android versions

---

## Appendix: Device Info

| Property | Value |
|----------|-------|
| Model | Xiaomi 25028RN03I |
| Android Version | 15 |
| API Level | 35 |
| Screen | 720 × 1640 |
| Density | 320 dpi |
| Architecture | arm64-v8a |
| USB Debugging | Enabled |
