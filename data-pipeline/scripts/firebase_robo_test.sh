#!/usr/bin/env bash
# Firebase Test Lab — Robo test for TowerFeasibility Pro
#
# Runs the REAL production-signed, arm64-v8a APK on Test Lab's native ARM
# virtual device. Robo needs no test code: it crawls the UI, reports crashes,
# and returns screenshots + video + logcat.
#
# Prerequisites (one-time):
#   1. export PATH=$PATH:/home/lakshya/google-cloud-sdk/bin
#   2. gcloud auth login
#   3. gcloud config set project <YOUR_PROJECT_ID>
#   4. Test Lab API enabled for that project (console: APIs & Services)
#
# Usage:  ./firebase_robo_test.sh <PROJECT_ID> [MODEL] [VERSION]
#   MODEL default: MediumPhone.arm   (native ARM AVD — runs arm64-v8a APKs)
#   VERSION default: 34
#
# List ARM devices first:
#   gcloud firebase test android models list --filter=arm

set -euo pipefail

PROJECT_ID="${1:?usage: $0 <PROJECT_ID> [MODEL] [VERSION]}"
MODEL="${2:-MediumPhone.arm}"
VERSION="${3:-34}"

APK="/home/lakshya/company/towerfeasibility/dist/TowerFeasibilityPro-rajasthan-release.apk"
RESULTS_DIR="/home/lakshya/company/towerfeasibility/qa/firebase"
GCLOUD="/home/lakshya/google-cloud-sdk/bin/gcloud"

mkdir -p "$RESULTS_DIR"

if [ ! -f "$APK" ]; then
  echo "APK not found: $APK" >&2
  exit 1
fi

echo "APK      : $APK"
echo "SHA-256  : $(sha256sum "$APK" | cut -d' ' -f1)"
echo "Project  : $PROJECT_ID"
echo "Device   : $MODEL @ API $VERSION (ARM)"
echo "Results  : $RESULTS_DIR"
echo

"$GCLOUD" config set project "$PROJECT_ID" >/dev/null

# Robo crawls the app. --robo-directives lets us type text if a field is focused.
# A generous timeout lets Robo reach the Data Packs screen and open the pack.
"$GCLOUD" firebase test android run \
  --type robo \
  --app "$APK" \
  --device "model=$MODEL,version=$VERSION,locale=en,orientation=portrait" \
  --timeout 5m \
  --robo-timeout 4m \
  --results-dir "towerfeasibility-$(date +%Y%m%d-%H%M%S)" 2>&1 | tee "$RESULTS_DIR/robo-run.log"

echo
echo "Artifacts (crash report, screenshots, logcat, video) were written to the"
echo "Test Lab results bucket. Download locally with:"
echo "  gsutil -m cp -r gs://<results-bucket>/<results-dir> $RESULTS_DIR"
