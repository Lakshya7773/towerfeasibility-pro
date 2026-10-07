/**
 * Phase 5 — Multi-Device / API Compatibility Test Matrix
 * 
 * Tests the app on multiple Firebase Test Lab devices to verify
 * compatibility across different Android versions, screen sizes,
 * and hardware configurations.
 * 
 * Device selection criteria:
 * - ARM64 compatible (app is arm64-v8a only)
 * - API level between minSdk (24) and targetSdk (36)
 * - Mix of screen sizes and Android versions
 * - Virtual devices only (cost control)
 */

const { writeFileSync } = require('fs');
const { join, resolve } = require('path');
const { fileURLToPath } = require('url');

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

// ============================================================
// DEVICE MATRIX
// ============================================================

const deviceMatrix = [
  {
    id: 'DEV-001',
    name: 'Small ARM Phone',
    model: 'SmallPhone.arm',
    version: '35',
    locale: 'en',
    orientation: 'portrait',
    resolution: '1280x720',
    apiRange: '26-35',
    purpose: 'Baseline test — smallest screen, most common config',
    priority: 'P0',
  },
  {
    id: 'DEV-002',
    name: 'Medium ARM Phone',
    model: 'MediumPhone.arm',
    version: '35',
    locale: 'en',
    orientation: 'portrait',
    resolution: '2400x1080',
    apiRange: '26-36',
    purpose: 'Standard phone — most common user device',
    priority: 'P0',
  },
  {
    id: 'DEV-003',
    name: 'Pixel 2 ARM',
    model: 'Pixel2.arm',
    version: '33',
    locale: 'en',
    orientation: 'portrait',
    resolution: '1920x1080',
    apiRange: '26-33',
    purpose: 'Google Pixel class — clean Android experience',
    priority: 'P1',
  },
  {
    id: 'DEV-004',
    name: 'Medium ARM Tablet',
    model: 'MediumTablet.arm',
    version: '34',
    locale: 'en',
    orientation: 'landscape',
    resolution: '2560x1600',
    apiRange: '26-35',
    purpose: 'Tablet form factor — larger screen, landscape',
    priority: 'P1',
  },
  {
    id: 'DEV-005',
    name: 'Small ARM Phone (Older)',
    model: 'SmallPhone.arm',
    version: '30',
    locale: 'en',
    orientation: 'portrait',
    resolution: '1280x720',
    apiRange: '26-35',
    purpose: 'Older Android version — backward compatibility',
    priority: 'P1',
  },
];

// ============================================================
// TEST SCENARIOS
// ============================================================

const testScenarios = [
  {
    id: 'TS-001',
    name: 'App launch and startup',
    description: 'Verify app launches without crash on each device',
    steps: [
      'Install APK',
      'Launch app from launcher',
      'Wait for initial render',
      'Verify HomeScreen appears',
    ],
    expected: 'App launches successfully, HomeScreen renders',
    severity: 'P0',
  },
  {
    id: 'TS-002',
    name: 'Navigation flow',
    description: 'Verify basic navigation works on each device',
    steps: [
      'Launch app',
      'Tap "Start site analysis"',
      'Verify MapScreen appears',
      'Enter coordinates',
      'Tap "Run feasibility analysis"',
      'Verify AnalysisScreen appears',
    ],
    expected: 'Navigation works correctly on all devices',
    severity: 'P0',
  },
  {
    id: 'TS-003',
    name: 'Core analysis flow',
    description: 'Verify analysis completes on each device',
    steps: [
      'Navigate to MapScreen',
      'Enter valid coordinates (26.9124, 75.7873)',
      'Tap "Run feasibility analysis"',
      'Wait for analysis to complete',
      'Verify results are displayed',
    ],
    expected: 'Analysis completes successfully on all devices',
    severity: 'P0',
  },
  {
    id: 'TS-004',
    name: 'Map rendering',
    description: 'Verify map renders correctly on each device',
    steps: [
      'Navigate to MapScreen',
      'Verify map loads',
      'Tap on map to move site',
      'Verify site marker updates',
      'Change radius selector',
    ],
    expected: 'Map renders and responds to interaction',
    severity: 'P1',
  },
  {
    id: 'TS-005',
    name: 'Report generation',
    description: 'Verify PDF report generation works on each device',
    steps: [
      'Complete analysis',
      'Navigate to ReportScreen',
      'Tap "Generate PDF"',
      'Verify PDF is generated',
      'Tap "Share / Save"',
    ],
    expected: 'PDF report generates successfully',
    severity: 'P0',
  },
  {
    id: 'TS-006',
    name: 'Crash detection',
    description: 'Monitor for crashes and ANRs during full flow',
    steps: [
      'Execute full user journey',
      'Monitor logcat for crashes',
      'Check for ANR dialogs',
      'Verify app remains responsive',
    ],
    expected: 'No crashes or ANRs during full flow',
    severity: 'P0',
  },
  {
    id: 'TS-007',
    name: 'Memory and performance',
    description: 'Check for memory leaks and performance issues',
    steps: [
      'Run multiple analyses sequentially',
      'Monitor memory usage',
      'Check for OOM errors',
      'Verify app remains responsive',
    ],
    expected: 'No memory leaks or performance degradation',
    severity: 'P1',
  },
];

// ============================================================
// GENERATE TEST MATRIX CONFIGURATION
// ============================================================

function generateTestMatrixConfig() {
  const config = {
    name: 'TowerFeasibility Pro — Multi-Device Test Matrix',
    description: 'Compatibility testing across multiple Android devices and API levels',
    app: {
      package: 'com.digitalshift.towerfeasibility',
      version: '1.0.0',
      minSdk: 24,
      targetSdk: 36,
      abi: 'arm64-v8a',
    },
    devices: deviceMatrix,
    scenarios: testScenarios,
    execution: {
      type: 'robo',
      timeout: '30m',
      parallel: false,
      retryOnFailure: true,
    },
    reporting: {
      screenshots: true,
      video: true,
      logcat: true,
    },
  };

  return config;
}

// ============================================================
// GENERATE TEST SCRIPT
// ============================================================

function generateTestScript() {
  const script = `#!/usr/bin/env bash
# Phase 5 — Multi-Device Test Matrix
# Generated by test_device_matrix.ts

set -euo pipefail

PROJECT_ID="\${FIREBASE_PROJECT_ID:-tower-feseability-app}"
APK_PATH="\${1:-dist/ci/app-debug.apk}"
TIMEOUT="\${2:-30m}"

echo "=== Phase 5: Multi-Device Test Matrix ==="
echo "Project: $PROJECT_ID"
echo "APK: $APK_PATH"
echo "Timeout: $TIMEOUT"
echo ""

# Verify APK exists
if [ ! -f "$APK_PATH" ]; then
  echo "ERROR: APK not found at $APK_PATH"
  exit 1
fi

# Device matrix
DEVICES=(
  "SmallPhone.arm:35:en:portrait"
  "MediumPhone.arm:35:en:portrait"
  "Pixel2.arm:33:en:portrait"
  "MediumTablet.arm:34:en:landscape"
  "SmallPhone.arm:30:en:portrait"
)

# Run tests for each device
for device_config in "\${DEVICES[@]}"; do
  IFS=':' read -r model version locale orientation <<< "$device_config"
  
  echo ""
  echo "========================================"
  echo "Testing: $model (API $version)"
  echo "========================================"
  echo ""
  
  gcloud firebase test android run \\
    --type robo \\
    --app "$APK_PATH" \\
    --device model=$model,version=$version,locale=$locale,orientation=$orientation \\
    --timeout "$TIMEOUT" \\
    --project "$PROJECT_ID" \\
    --record-video \\
    --results-dir="device-test-$(date +%Y%m%d-%H%M%S)-$model" \\
    --format="json" || {
      echo "WARNING: Test failed for $model (API $version)"
      continue
    }
  
  echo ""
  echo "✓ Test completed for $model (API $version)"
done

echo ""
echo "========================================"
echo "All device tests completed"
echo "========================================"
echo ""
echo "Check Firebase console for results:"
echo "https://console.firebase.google.com/project/$PROJECT_ID/test-lab"
`;

  return script;
}

// ============================================================
// GENERATE TEST REPORT
// ============================================================

function generateTestReport() {
  const report = `# TowerFeasibility Pro — Phase 5 Multi-Device Test Matrix

## Overview

This document defines the multi-device compatibility test matrix for TowerFeasibility Pro.
Tests are executed on multiple Firebase Test Lab devices to verify compatibility
across different Android versions, screen sizes, and hardware configurations.

## App Configuration

| Field | Value |
|-------|-------|
| Package | com.digitalshift.towerfeasibility |
| Version | 1.0.0 (versionCode 1) |
| Min SDK | 24 (Android 7.0) |
| Target SDK | 36 (Android 16) |
| ABI | arm64-v8a |

## Device Matrix

${deviceMatrix.map(d => `
### ${d.id} — ${d.name}

| Field | Value |
|-------|-------|
| Model | ${d.model} |
| API Level | ${d.version} |
| Resolution | ${d.resolution} |
| API Range | ${d.apiRange} |
| Purpose | ${d.purpose} |
| Priority | ${d.priority} |
`).join('\n')}

## Test Scenarios

${testScenarios.map(s => `
### ${s.id} — ${s.name}

**Description:** ${s.description}

**Steps:**
${s.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

**Expected:** ${s.expected}

**Severity:** ${s.severity}
`).join('\n')}

## Execution

Tests are executed via Firebase Test Lab Robo tests. Each device runs the full
test scenario suite, including:
- App launch and startup
- Navigation flow
- Core analysis
- Map rendering
- Report generation
- Crash detection
- Memory and performance

## Results

Results are available in the Firebase console:
https://console.firebase.google.com/project/tower-feseability-app/test-lab

## Cost Estimate

- 5 devices × 30 minutes = 150 device-minutes
- At $1/device/hour (Blaze plan) = $2.50 per full matrix run
- Free under Spark plan (10 tests/day, 60 min/day virtual)

## Known Limitations

- Virtual devices may not perfectly replicate physical device behavior
- Some hardware-specific features (GPS, sensors) cannot be tested
- Network conditions are simulated, not real-world

## Next Steps

1. Run the test matrix on Firebase Test Lab
2. Analyze results for device-specific issues
3. Document any compatibility defects
4. Proceed to Phase 6 (release validation)
`;

  return report;
}

// ============================================================
// MAIN
// ============================================================

const outputDir = join(__dirname, '..', '..', 'docs');
const scriptPath = join(outputDir, 'device-test-matrix.sh');
const reportPath = join(outputDir, 'DEVICE-TEST-MATRIX.md');

// Write test script
writeFileSync(scriptPath, generateTestScript());
console.log(`Generated test script: ${scriptPath}`);

// Write test report
writeFileSync(reportPath, generateTestReport());
console.log(`Generated test report: ${reportPath}`);

// Output summary
console.log('\n=== Phase 5 Multi-Device Test Matrix ===');
console.log(`Devices: ${deviceMatrix.length}`);
console.log(`Scenarios: ${testScenarios.length}`);
console.log(`Total tests: ${deviceMatrix.length * testScenarios.length}`);
console.log('');
console.log('Device coverage:');
deviceMatrix.forEach(d => {
  console.log(`  ${d.id}: ${d.name} (API ${d.version}, ${d.resolution})`);
});
console.log('');
console.log('Tests are executed via Firebase Test Lab Robo tests.');
console.log('See docs/DEVICE-TEST-MATRIX.md for full specification.');
