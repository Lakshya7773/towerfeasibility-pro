# TowerFeasibility Pro — Beta Test Plan

**Version:** 1.0-beta  
**Date:** 2026-10-05  
**Tester:** Lakshya (Digital Shift Solutions)  
**Build:** `dist/TowerFeasibilityPro-rajasthan-release.apk` (229 MB)

---

## Test Dimensions

| # | Dimension | What It Measures | Weight |
|---|-----------|------------------|--------|
| 1 | **Technical** | Does it work? Installs, launches, no crashes, offline | 25% |
| 2 | **Accuracy** | Are the numbers right? vs ground truth | 30% |
| 3 | **Trustworthiness** | Can you rely on it? Disclaimers, edge cases, confidence | 20% |
| 4 | **Usefulness** | Does it help decisions? Workflow, report quality, UX | 25% |

---

## 1. Technical Tests (25%)

### T-T01: Cold Install & Launch
- [ ] APK installs via `adb install`
- [ ] App launches to home screen within 10s
- [ ] No crash on first launch
- [ ] Data pack bootstrap completes (progress shown)

### T-T02: Offline Operation
- [ ] Enable airplane mode
- [ ] App launches and functions fully offline
- [ ] Map renders from local PMTiles
- [ ] Analysis runs without network
- [ ] PDF generates without network

### T-T03: Navigation Flow
- [ ] Home → Map → Analysis → Report navigation works
- [ ] Back navigation works
- [ ] No dead ends or broken screens

### T-T04: Map Interaction
- [ ] Map pans and zooms smoothly
- [ ] Tower overlay renders
- [ ] Layer toggles work
- [ ] Site marker placement works
- [ ] Coordinate editing works

### T-T05: Analysis Execution
- [ ] All 7 engines run without error
- [ ] Results populate in UI
- [ ] No NaN or undefined values
- [ ] Reasonable execution time (< 30s)

### T-T06: PDF Generation
- [ ] PDF generates without error
- [ ] All 12 sections present
- [ ] Charts render
- [ ] Map snippet included
- [ ] File is shareable

### T-T07: Edge Cases
- [ ] No crash on rapid navigation
- [ ] No crash on invalid coordinates
- [ ] Graceful handling of missing data
- [ ] Memory stays bounded during use

---

## 2. Accuracy Tests (30%)

### T-A01: Population Accuracy
- [ ] Ajmer 2km population vs Census 2011
- [ ] Jaipur 5km population vs known density
- [ ] Rural vs urban classification correct
- [ ] Density gradient makes sense

### T-A02: Elevation Accuracy
- [ ] Jaipur elevation vs known (~430m)
- [ ] Jaisalmer elevation vs known (~225m)
- [ ] Mt Abu elevation vs known (~1722m)
- [ ] Terrain profile matches topography

### T-A03: Tower Density Accuracy
- [ ] Ajmer tower count vs Tarang Sanchar
- [ ] Density per km² reasonable
- [ ] Competitor identification correct

### T-A04: Fiber Proximity Accuracy
- [ ] Nearest fiber distance vs BBNL data
- [ ] Fiber route visualization correct

### T-A05: Soil Classification Accuracy
- [ ] Soil type at known locations vs FAO map
- [ ] Foundation suitability rating sensible

### T-A06: LoS/Terrain Accuracy
- [ ] Fresnel zone calculation correct
- [ ] Earth curvature bulge correct
- [ ] Path profile matches elevation raster

---

## 3. Trustworthiness Tests (20%)

### T-TR01: Disclaimers Present
- [ ] Soil report has "screening only — borehole required"
- [ ] Population data source cited
- [ ] Elevation data source cited
- [ ] Tower data source cited
- [ ] Confidence indicators on estimates

### T-TR02: Error Handling
- [ ] Missing data → clear message, not crash
- [ ] Out-of-bounds coordinates → graceful error
- [ ] Corrupt pack → recovery path

### T-TR03: Data Freshness
- [ ] Population data year stated (2020)
- [ ] Tower data source date stated
- [ ] Elevation data source stated

### T-TR04: Offline Guarantee
- [ ] No network requests during full workflow
- [ ] No external API calls
- [ ] No CDN dependencies

---

## 4. Usefulness Tests (25%)

### T-U01: Workflow Completeness
- [ ] Can complete full analysis in < 5 minutes
- [ ] Can generate report in < 1 minute
- [ ] Can share report

### T-U02: Report Quality
- [ ] Professional layout
- [ ] All 8 dimensions covered
- [ ] Charts are readable
- [ ] Map snippet is useful
- [ ] Recommendations are actionable

### T-U03: Decision Support
- [ ] Go/No-Go recommendation clear
- [ ] Risk factors identified
- [ ] Confidence level stated
- [ ] Next steps suggested

### T-U04: UI/UX Quality
- [ ] Intuitive navigation
- [ ] Clear labels
- [ ] Readable fonts
- [ ] Good color contrast
- [ ] Loading states shown

---

## Test Execution Log

| Test ID | Dimension | Result | Notes |
|---------|-----------|--------|-------|
| | | | |

---

## Summary

| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Technical | /7 | 25% | |
| Accuracy | /6 | 30% | |
| Trustworthiness | /4 | 20% | |
| Usefulness | /4 | 25% | |
| **Total** | | **100%** | |

---

## Issues Found

| # | Severity | Description | Status |
|---|----------|-------------|--------|
| | | | |

---

## Recommendation

[ ] Ship to production  
[ ] Fix critical issues then ship  
[ ] Major rework needed
