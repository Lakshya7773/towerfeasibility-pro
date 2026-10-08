# RELEASE VALIDATION PATH

Two independent validation paths exist. They validate **different artifacts** and
must not be confused.

| | Debug path | Release path |
|---|---|---|
| Workflow | `ci.yml` → `firebase-test-lab.yml` | `release-validation.yml` → `firebase-test-lab-suite.yml` |
| Artifact | `towerfeasibility-debug-apk` | `towerfeasibility-release-apk` (signed) |
| Signing | public debug keystore | production keystore (repository secrets) |
| Triggers | pull requests; manual | manual only |
| Tests | Robo crawl | Robo crawl **+ targeted functional tests** |
| Devices | SmallPhone.arm API 35 | primary device **+ 5-device matrix** |
| Purpose | fast feedback that the app builds and runs | evidence about the artifact that actually ships |

## Why two paths

The debug APK is signed with a public keystore, so it needs no secrets and can be
built on every push. The release APK is a materially different binary:

| | Debug | Release |
|---|---|---|
| `android:debuggable` | true | **false** |
| Signing certificate | public debug keystore | production keystore |
| `usesCleartextTraffic` | true | absent |
| Dev-support hooks (RN/WebView debugging) | present | absent |
| Minification / resource shrinking | off | off (currently disabled in both) |

The **non-debuggable** build is the meaningful difference: an app that only fails
when it is not debuggable — a real and common class of RN/Expo failure — passes a
debug-build test and fails in production. A Robo pass on the debug build is
therefore **not** evidence that the release build runs.

The release path therefore exists to validate the shipped artifact specifically.

## The release path

```
Release build  (assembleRelease + assembleReleaseAndroidTest)
      ↓
Signed release APK  +  release instrumentation APK  (same certificate)
      ↓
Firebase Test Lab
      ↓
Robo crawl   +   targeted functional tests
      ↓
5-device matrix
      ↓
PASS / FAIL  (release-verdict job)
```

### Stages

1. **`build-release`** — builds the signed release APK and the matching release
   `androidTest` APK, then **verifies both are signed with the same certificate**.
   Test Lab rejects an instrumentation run whose two APKs have different
   signatures, so this is checked before any quota is spent.
   Heap is set to `-Xmx2048m`: the ~294 MB data pack is buffered by the packager
   and `-Xmx512m` OOMs in `FinalizeBundleTask$BundleToolRunnable`.

2. **`validate-primary`** — Robo + targeted tests on SmallPhone.arm API 35.
   This is the fast gate: if the release artifact is broken, fail here before
   consuming the whole matrix's quota.

   The test APK is built by `assembleReleaseAndroidTest`. This requires
   `testBuildType "release"` in `app/build.gradle`: AGP only creates an
   androidTest variant for the *test build type*, and Test Lab rejects a run
   whose app and test APKs are signed with different certificates. Without that
   line the test APK would be debug-signed and the run would be rejected.

3. **`device-matrix`** — the same release artifact across the 5 devices from
   `docs/DEVICE-TEST-MATRIX.md`:

   | Device | API | Orientation |
   |---|---|---|
   | SmallPhone.arm | 35 | portrait |
   | MediumPhone.arm | 35 | portrait |
   | Pixel2.arm | 33 | portrait |
   | MediumTablet.arm | 34 | landscape |
   | SmallPhone.arm | 30 | portrait |

4. **`release-verdict`** — a single PASS/FAIL over the whole path.

## Targeted functional tests

Source: `app/android/app/src/androidTest/java/com/digitalshift/towerfeasibility/ReleaseFunctionalTest.java`

Deterministic UI assertions driven by UiAutomator — not a Robo crawl. Each test
drives a specific user journey and asserts a specific visible outcome:

| Test | Journey | Asserts |
|---|---|---|
| FT-001 | App launch | boots past the pack-install splash, home screen renders |
| FT-002 | Location selection | site screen opens with radius selector |
| FT-003 | Coordinate input | valid Ajmer coordinates accepted |
| FT-004 | Invalid coordinates | lat > 90 and non-numeric input handled, no crash |
| FT-005 | Run analysis | full 7-dimension analysis completes |
| FT-006 | Dimensions | population / towers / resources / soil sections render |
| FT-007 | Screening semantics | technical-screening wording; commercial gap stated; contribution breakdown present |
| FT-008 | Report screen | opens with Preview + Export tabs |
| FT-009 | Export tab | PDF affordance and report identity present |
| FT-010 | PDF generation | WebView→PDF completes offline |
| FT-011 | Lifecycle | background + resume does not crash |

FT-007 is a **release-semantics guard**: it asserts that the Phase-7 honesty
changes (technical screening instead of Go/No-Go, commercial feasibility declared
not assessed) actually shipped in the release artifact.

The tests run in method-name order and share one journey, so FT-005 onward depend
on earlier navigation. First launch copies ~246 MB of packs out of the APK, so
the boot timeout is deliberately 7 minutes.

## Running it

Requires these repository secrets:

| Secret | Purpose |
|---|---|
| `KEYSTORE_BASE64` | base64 of the production keystore |
| `KEYSTORE_PASSWORD` | keystore password |
| `KEY_ALIAS` | key alias |
| `KEY_PASSWORD` | key password |
| `GCP_SA_KEY` | Test Lab service account |
| `FIREBASE_PROJECT_ID` | Test Lab project |

Then: **Actions → Release Validation → Run workflow**.

Inputs:
- `run_robo` (default true)
- `run_targeted` (default true)
- `run_full_matrix` (default true — set false to validate only the primary device)

## Quota warning

The free Spark plan allows roughly **10 virtual tests per day**. A full run here
is 5 devices × 2 test types = **10 tests** — an entire day's quota in one
workflow. The primary-device gate plus `run_full_matrix=false` is the cheap way
to check a release without exhausting quota.

## Current status

The path is implemented but **has never run**, because `KEYSTORE_BASE64` and the
other signing secrets are not configured (blocker B-1 in
`docs/PHASE-1-7-PROFESSIONAL-VALIDATION.md`). Until it runs, the release APK
remains **statically validated only** — signed, correct ABI, no INTERNET
permission, correct embedded bundle — but never executed on a device.
