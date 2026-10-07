# TowerFeasibility Pro — Phase 5 Multi-Device Test Matrix

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


### DEV-001 — Small ARM Phone

| Field | Value |
|-------|-------|
| Model | SmallPhone.arm |
| API Level | 35 |
| Resolution | 1280x720 |
| API Range | 26-35 |
| Purpose | Baseline test — smallest screen, most common config |
| Priority | P0 |


### DEV-002 — Medium ARM Phone

| Field | Value |
|-------|-------|
| Model | MediumPhone.arm |
| API Level | 35 |
| Resolution | 2400x1080 |
| API Range | 26-36 |
| Purpose | Standard phone — most common user device |
| Priority | P0 |


### DEV-003 — Pixel 2 ARM

| Field | Value |
|-------|-------|
| Model | Pixel2.arm |
| API Level | 33 |
| Resolution | 1920x1080 |
| API Range | 26-33 |
| Purpose | Google Pixel class — clean Android experience |
| Priority | P1 |


### DEV-004 — Medium ARM Tablet

| Field | Value |
|-------|-------|
| Model | MediumTablet.arm |
| API Level | 34 |
| Resolution | 2560x1600 |
| API Range | 26-35 |
| Purpose | Tablet form factor — larger screen, landscape |
| Priority | P1 |


### DEV-005 — Small ARM Phone (Older)

| Field | Value |
|-------|-------|
| Model | SmallPhone.arm |
| API Level | 30 |
| Resolution | 1280x720 |
| API Range | 26-35 |
| Purpose | Older Android version — backward compatibility |
| Priority | P1 |


## Test Scenarios


### TS-001 — App launch and startup

**Description:** Verify app launches without crash on each device

**Steps:**
1. Install APK
2. Launch app from launcher
3. Wait for initial render
4. Verify HomeScreen appears

**Expected:** App launches successfully, HomeScreen renders

**Severity:** P0


### TS-002 — Navigation flow

**Description:** Verify basic navigation works on each device

**Steps:**
1. Launch app
2. Tap "Start site analysis"
3. Verify MapScreen appears
4. Enter coordinates
5. Tap "Run feasibility analysis"
6. Verify AnalysisScreen appears

**Expected:** Navigation works correctly on all devices

**Severity:** P0


### TS-003 — Core analysis flow

**Description:** Verify analysis completes on each device

**Steps:**
1. Navigate to MapScreen
2. Enter valid coordinates (26.9124, 75.7873)
3. Tap "Run feasibility analysis"
4. Wait for analysis to complete
5. Verify results are displayed

**Expected:** Analysis completes successfully on all devices

**Severity:** P0


### TS-004 — Map rendering

**Description:** Verify map renders correctly on each device

**Steps:**
1. Navigate to MapScreen
2. Verify map loads
3. Tap on map to move site
4. Verify site marker updates
5. Change radius selector

**Expected:** Map renders and responds to interaction

**Severity:** P1


### TS-005 — Report generation

**Description:** Verify PDF report generation works on each device

**Steps:**
1. Complete analysis
2. Navigate to ReportScreen
3. Tap "Generate PDF"
4. Verify PDF is generated
5. Tap "Share / Save"

**Expected:** PDF report generates successfully

**Severity:** P0


### TS-006 — Crash detection

**Description:** Monitor for crashes and ANRs during full flow

**Steps:**
1. Execute full user journey
2. Monitor logcat for crashes
3. Check for ANR dialogs
4. Verify app remains responsive

**Expected:** No crashes or ANRs during full flow

**Severity:** P0


### TS-007 — Memory and performance

**Description:** Check for memory leaks and performance issues

**Steps:**
1. Run multiple analyses sequentially
2. Monitor memory usage
3. Check for OOM errors
4. Verify app remains responsive

**Expected:** No memory leaks or performance degradation

**Severity:** P1


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
