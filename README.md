# TowerFeasibility Pro

Offline Android app for telecom tower site feasibility analysis across 7 dimensions,
with on-device PDF report generation. **Zero API dependency at runtime.**

Built by Digital Shift Solutions.

---

## What it does

Pick a site (lat/lon) inside an installed regional data pack and the app evaluates:

| # | Dimension | Output |
|---|-----------|--------|
| 1 | Population density | People within 2/5/10 km, density class |
| 2 | Competitor tower density | Towers within 1/2/5 km, saturation class, co-location flag |
| 3 | Nearby resources | Distance to nearest fiber, accessibility grade, resource score |
| 4 | RoW compliance | Fees, timelines, required documents |
| 5 | Line-of-sight / terrain | LOS status, Fresnel clearance, recommended height, path loss, RSRP |
| 6 | Soil & foundation | FAO soil class, foundation suitability |
| 7 | Administration | Jurisdiction, governing authority, compliance list |
| 8 | PDF report | 12-section professional report, shareable |

---

## Repository layout

```
towerfeasibility/
├── app/                          # React Native (Expo) Android app
│   ├── src/
│   │   ├── app/App.tsx           # navigation shell
│   │   ├── screens/              # Home, DataPack, Map, Analysis, Report
│   │   ├── analysis/             # the 7 engines + orchestrator
│   │   ├── data/                 # pack manager, loader, bootstrap
│   │   ├── report/               # report builder + HTML/PDF renderer
│   │   ├── models/               # TypeScript domain types
│   │   └── utils/                # geo math, WKB decoder
│   ├── android/                  # generated native project (prebuild)
│   └── assets/
├── data-pipeline/
│   ├── scripts/                  # Python build-time processors
│   └── ...
├── data/                         # national source datasets (gitignored)
├── dist/packs/                   # built data packs
└── docs/                         # DATA_SOURCES.md and notes
```

---

## Quick start

### Build a data pack

```bash
cd /home/lakshya/company/towerfeasibility
. .venv/bin/activate
python data-pipeline/scripts/build_pack.py --region rajasthan --output-dir dist/packs
```

Produces `dist/packs/data-pack-rajasthan/` (~78 MB) with a `manifest.json`
and SHA-256 checksums.

### Verify the engines

```bash
npx tsx data-pipeline/scripts/test_engines.ts     # 39 assertions against real pack data
python data-pipeline/scripts/verify_pack.py       # pack integrity + spatial queries
```

### Run the app

```bash
cd app
npx tsc --noEmit                    # typecheck
npx expo start                      # dev server
npx expo run:android                # build + install on device
```

### Build the APK

```bash
cd app/android
export ANDROID_HOME=/home/lakshya/android-sdk
export JAVA_HOME=$(dirname $(dirname $(readlink -f $(which java))))
./gradlew assembleDebug --no-daemon --max-workers=1
```

APK lands in `app/android/app/build/outputs/apk/debug/`.

> This host has ~3.3 GB RAM. `gradle.properties` is tuned for that
> (1 GB heap, 1 worker, arm64 only). For a multi-ABI store build use EAS.

---

## Data packs

A pack is a self-contained directory the app reads offline:

```
data-pack-<region>/
├── manifest.json                 # region, bounds, version, file checksums
├── vectors/
│   ├── towers.sqlite             # lat/lon indexed tower locations
│   ├── fiber.sqlite              # R*Tree + WKB fiber routes
│   └── soil.geojson              # soil polygons with classification
└── config/
    └── soil-classification.json  # FAO code -> soil class -> foundation
```

Packs are installed to `<documents>/data-packs/` at runtime and can be
deleted to reclaim space. See `docs/DATA_SOURCES.md` for sources and licences.

---

## Data sources

| Layer | Source | Licence |
|---|---|---|
| Towers | Tarang Sanchar (DoT registry, 665,077 sites) + NIC | CC0 1.0 |
| Fiber | BharatNet / BBNL OFC (370,878 segments) | Govt open |
| Soil type | FAO Digital Soil Map of the World (634 units) | FAO-Open |
| Soil properties | ISRIC SoilGrids 250 m | CC-BY-4.0 |
| Population | WorldPop 2020 (1 km) | CC-BY-4.0 |
| Elevation | Copernicus GLO-30 / SRTM | Open |
| Base map | Protomaps / OpenStreetMap | ODbL |

**Known gaps** (documented, not hidden):
- Urban private fiber (Jio/Airtel/Vi) is not publicly available — only public
  BharatNet routes are represented.
- Tower registry is 2022-vintage and undercounts recent 5G rollout.
- Soil is screening-grade; a geotechnical survey is required before design.

Every PDF carries these disclaimers.

---

## Architecture notes

- **Build-time heavy, runtime light.** All data processing happens in
  `data-pipeline/`; the app only reads pre-built packs.
- **Engines are pure functions.** `src/analysis/*` take plain data in and
  return plain objects, so they are testable outside React Native
  (see `test_engines.ts`).
- **No native map dependency yet.** The map screen currently uses coordinate
  entry plus presets; MapLibre + PMTiles is the planned replacement.
- **expo-file-system v57 class API** (`File`/`Directory`/`Paths`) is used
  throughout — the older `documentDirectory` string API is gone.

---

## Validation — two independent paths

These validate **different artifacts**; do not confuse them.

| | Debug path | Release path |
|---|---|---|
| Workflow | `ci.yml` → `firebase-test-lab.yml` | `release-validation.yml` → `firebase-test-lab-suite.yml` |
| Artifact | `towerfeasibility-debug-apk` | `towerfeasibility-release-apk` (signed) |
| Tests | Robo crawl | Robo **+ targeted functional tests** |
| Devices | SmallPhone.arm API 35 | primary device **+ 5-device matrix** |
| Triggers | pull requests / manual | manual only |

The debug APK is signed with a public keystore so it needs no secrets; the
release APK is **non-debuggable**, production-signed and has no cleartext
traffic or dev-support hooks — a materially different binary. An app that only
fails when it is not debuggable passes a debug test and fails in production.
**A Robo pass on debug is not evidence that the release build runs**, which is
why the release path exists.

See **`docs/RELEASE-VALIDATION.md`** for the full path, the targeted test list,
required secrets and the Test Lab quota warning.

### Test suites

```bash
cd data-pipeline/scripts
npx tsx qa_suite_core.ts      # 193 checks — geometry, scoring, adversarial verdicts
npx tsx test_golden.ts        # 83 golden engineering tests (2 blocked = domain authority)
npx tsx test_provenance.ts    # 43 checks — dataset vintages / no fabricated authority
npx tsx qa_regression.ts      # 37   npx tsx qa_adversarial.ts  # 71
npx tsx test_engines.ts       # 40   npx tsx test_physics.ts    # 19
python test_accuracy.py       # 28   python test_trustworthiness.py  # 34
```

---

## Status

| Area | State |
|---|---|
| Data acquisition (towers, fiber, soil) | ✅ done, full India |
| Build-time processors + pack builder | ✅ Rajasthan pack built & verified |
| Analysis engines | ✅ ~700 checks passing across 14 suites |
| PDF report | ✅ 20-section evidence-first report (provenance, confidence, limitations) |
| App UI + navigation | ✅ implemented, typechecks clean |
| Deterministic decision object ("why engine") | ✅ contributions, confidence, sensitivity, NOT-ASSESSED |
| Map (MapLibre + PMTiles, offline) | ✅ working (ranged PMTiles reads) |
| Elevation packs (LoS) | ✅ SRTM z11, terrain profile + Fresnel |
| Release APK (signed, arm64-v8a, no INTERNET) | ✅ built & statically verified |
| Release runtime validation | ⬜ path implemented, needs signing secrets (B-1) |
| iOS | ⬜ out of scope |

**Positioning:** an offline *first-pass technical screening* tool. It does not
predict coverage, does not assess commercial viability (no CAPEX/OPEX/ARPU/ROI
model exists) and does not replace a site survey. See
`docs/PHASE-1-7-PROFESSIONAL-VALIDATION.md` for the independent verdicts,
`docs/DOMAIN-VALIDATION-REGISTER.md` for every product-defined assumption, and
`docs/TRACEABILITY-MATRIX.md` for output→source→test mapping.
