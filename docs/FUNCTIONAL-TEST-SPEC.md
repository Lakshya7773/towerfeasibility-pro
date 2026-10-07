# TowerFeasibility Pro — Phase 2 Functional Test Specification

## Overview

This document defines the functional test specification for TowerFeasibility Pro.
Tests are executed via Firebase Test Lab Robo tests, which automatically crawl
the app and detect crashes, ANRs, and UI issues.

## Test Environment

- **Platform:** Android
- **Device:** SmallPhone.arm (API 35)
- **App:** TowerFeasibility Pro (React Native/Expo)
- **Data Pack:** Rajasthan (bundled)

## Functional Tests


### FT-001 — App launch

**Description:** Launch application and verify initial screen renders

**Steps:**
1. Launch app from launcher
1. Verify HomeScreen renders with "Tower Feasibility" title
1. Verify "Start site analysis" button is present
1. Verify data pack status is shown

**Expected:** App launches without crash, HomeScreen renders correctly

**Severity:** P0


### FT-002 — Location selection

**Description:** Open location selection and select a valid location

**Steps:**
1. Tap "Start site analysis" button
1. Verify MapScreen renders with map view
1. Verify coordinate input fields are present
1. Verify radius selector is present

**Expected:** MapScreen renders with map, inputs, and radius selector

**Severity:** P0


### FT-003 — Coordinate input

**Description:** Enter valid latitude/longitude

**Steps:**
1. Enter latitude: 26.9124
1. Enter longitude: 75.7873
1. Tap "Go" button
1. Verify coordinates are accepted

**Expected:** Coordinates accepted, map updates to new location

**Severity:** P0


### FT-004 — Invalid coordinates

**Description:** Test invalid coordinate handling

**Steps:**
1. Enter latitude: 95 (invalid)
1. Enter longitude: 75.7873
1. Tap "Go" button
1. Verify controlled validation behavior

**Expected:** App shows validation error, does not crash

**Severity:** P1


### FT-005 — Rajasthan boundary handling

**Description:** Test valid and invalid Rajasthan locations

**Steps:**
1. Enter valid Rajasthan coordinates (26.9124, 75.7873)
1. Verify analysis works
1. Enter non-Rajasthan coordinates (e.g., 19.0760, 72.8777 - Mumbai)
1. Verify app handles gracefully

**Expected:** Valid Rajasthan location works, non-Rajasthan handled gracefully

**Severity:** P1


### FT-006 — Run feasibility analysis

**Description:** Run full feasibility analysis

**Steps:**
1. Select valid location
1. Tap "Run feasibility analysis"
1. Verify loading state appears
1. Wait for analysis to complete
1. Verify results screen appears

**Expected:** Analysis completes, results screen renders

**Severity:** P0


### FT-007 — Tower information

**Description:** Verify tower information is displayed

**Steps:**
1. Navigate to analysis results
1. Verify tower count is shown
1. Verify nearest tower distance is shown
1. Verify tower density is shown

**Expected:** Tower information renders correctly

**Severity:** P1


### FT-008 — Network opportunity

**Description:** Verify network opportunity section renders

**Steps:**
1. Navigate to analysis results
1. Verify network opportunity section is present
1. Verify fiber distance is shown
1. Verify accessibility classification is shown

**Expected:** Network opportunity section renders correctly

**Severity:** P1


### FT-009 — Report sections / scoring

**Description:** Verify the feasibility summary and report sections render

**Steps:**
1. Navigate to analysis results
1. Verify overall score (1-10) is shown
1. Verify recommendation (Go / Conditional / No-Go) is shown
1. Verify report contains sections 1-8
1. Verify no section renders NaN/Infinity/undefined

**Expected:** Score + recommendation + 8 report sections render without NaN

**Severity:** P1

**PRODUCT GAP:** No commercial feasibility module (CAPEX/OPEX/revenue/ROI/payback) exists in the product


### FT-010 — Report generation

**Description:** Generate PDF report

**Steps:**
1. Navigate to analysis results
1. Tap "View / export PDF report"
1. Verify report screen renders
1. Tap "Generate PDF"
1. Verify PDF is generated

**Expected:** PDF report generates successfully

**Severity:** P0


### FT-011 — PDF export

**Description:** Export PDF and verify file

**Steps:**
1. Generate PDF
1. Tap "Share / Save"
1. Verify share dialog appears
1. Cancel share dialog

**Expected:** PDF export works, share dialog appears

**Severity:** P1


### FT-012 — Back/navigation

**Description:** Test back navigation

**Steps:**
1. Navigate to analysis results
1. Press back button
1. Verify return to map screen
1. Press back button
1. Verify return to home screen

**Expected:** Back navigation works correctly

**Severity:** P1


### FT-013 — Repeated analysis

**Description:** Run multiple analyses sequentially

**Steps:**
1. Run analysis for location A
1. Return to map
1. Run analysis for location B
1. Verify results are different
1. Verify no state contamination

**Expected:** Multiple analyses work correctly

**Severity:** P1


### FT-014 — Missing/empty data

**Description:** Test missing data handling

**Steps:**
1. Select location with no tower data
1. Run analysis
1. Verify graceful handling

**Expected:** Missing data handled gracefully

**Severity:** P2


### FT-015 — Network/API failure

**Description:** Test offline behavior

**Steps:**
1. Disable network (airplane mode)
1. Run analysis
1. Verify app works offline

**Expected:** App works fully offline

**Severity:** P0


### FT-016 — Offline behavior

**Description:** Verify offline capability

**Steps:**
1. Verify all data is bundled
1. Run analysis without network
1. Verify results are correct

**Expected:** App is fully functional offline

**Severity:** P0


### FT-017 — Map behavior

**Description:** Test map rendering and interaction

**Steps:**
1. Open map screen
1. Verify map loads
1. Tap on map to move site
1. Verify site marker updates
1. Change radius selector
1. Verify radius overlay updates

**Expected:** Map renders and responds to interaction

**Severity:** P1


### FT-018 — Large dataset behavior

**Description:** Test with full Rajasthan dataset

**Steps:**
1. Select location in dense area (Jaipur)
1. Run analysis
1. Verify analysis completes
1. Verify results are reasonable

**Expected:** Analysis works with large dataset

**Severity:** P1


### FT-019 — Empty search/no result

**Description:** Test no-result handling

**Steps:**
1. Select location with no data
1. Run analysis
1. Verify controlled behavior

**Expected:** No-result case handled gracefully

**Severity:** P2


### FT-020 — Full end-to-end journey

**Description:** Complete user journey

**Steps:**
1. Launch app
1. Select location
1. Run analysis
1. Inspect results
1. Inspect tower/network info
1. Inspect commercial feasibility
1. Generate report
1. Export PDF
1. Return home
1. Perform second analysis

**Expected:** Full journey completes without crash

**Severity:** P0


## Product Scope Gaps Identified During Test Design

The mission brief specified tests for a commercial feasibility section
(CAPEX / OPEX / revenue / ROI / payback). **No such module exists in the
application source.** The app implements a 5-dimension technical
feasibility score and an 8-section report. This is a scope gap, not a
failing test — it is recorded here so it is not mistaken for a defect or
silently asserted as passing.

## Execution

Tests are executed via Firebase Test Lab Robo tests. The Robo crawler:
1. Launches the app
2. Navigates through screens
3. Taps buttons and enters text
4. Detects crashes and ANRs
5. Captures screenshots and video

## Results

Results are available in the Firebase console:
https://console.firebase.google.com/project/tower-feseability-app/test-lab

## Known Limitations

- Robo tests cannot verify numerical correctness (covered by Phase 3 golden tests)
- Robo tests cannot test offline behavior directly (requires device manipulation)
- Some UI elements may not be accessible to the Robo crawler

## Next Steps

1. Run Robo test on Firebase Test Lab
2. Analyze results for crashes and ANRs
3. Document any defects found
4. Proceed to Phase 3 (engineering validation)
