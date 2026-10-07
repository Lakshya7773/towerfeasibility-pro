#!/usr/bin/env bash
# Pull the latest CI-built APK artifact down to dist/.
#
# Heavy compute runs on GitHub Actions; this script only fetches the result,
# so the local machine never has to build anything.
#
# Usage:
#   ./pull_ci_artifact.sh [WORKFLOW] [ARTIFACT_NAME] [OUT_DIR]
#     WORKFLOW       ci.yml | release.yml          (default: ci.yml)
#     ARTIFACT_NAME  artifact to fetch             (default: towerfeasibility-debug-apk)
#     OUT_DIR        where to unpack               (default: dist/ci)
#
# Requires: gh CLI authenticated (gh auth status), or GH_TOKEN set.

set -euo pipefail

REPO="${REPO:-Lakshya7773/towerfeasibility-pro}"
WORKFLOW="${1:-ci.yml}"
ARTIFACT="${2:-towerfeasibility-debug-apk}"
OUT_DIR="${3:-dist/ci}"

GH="$(command -v gh || echo /home/lakshya/.local/gh/gh)"
if ! "$GH" auth status >/dev/null 2>&1 && [ -z "${GH_TOKEN:-}" ]; then
  echo "Not authenticated. Run: $GH auth login" >&2
  exit 1
fi

echo "Repo      : $REPO"
echo "Workflow  : $WORKFLOW"
echo "Artifact  : $ARTIFACT"
echo

# Latest successful run of that workflow
RUN_JSON=$("$GH" run list --repo "$REPO" --workflow "$WORKFLOW" --status success --limit 1 \
             --json databaseId,headSha,createdAt,displayTitle)
RUN_ID=$(echo "$RUN_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['databaseId'] if d else '')")
if [ -z "$RUN_ID" ]; then
  echo "No successful run of $WORKFLOW found yet." >&2
  echo "Recent runs:" >&2
  "$GH" run list --repo "$REPO" --workflow "$WORKFLOW" --limit 5 >&2
  exit 1
fi

echo "Run id    : $RUN_ID"
echo "$RUN_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin)[0]; print('Commit    :', d['headSha'][:12]); print('Title     :', d['displayTitle'])"
echo

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
"$GH" run download "$RUN_ID" --repo "$REPO" --name "$ARTIFACT" --dir "$OUT_DIR"

echo
echo "Downloaded to: $(cd "$OUT_DIR" && pwd)"
ls -la "$OUT_DIR"
echo
find "$OUT_DIR" -name '*.apk' -exec sh -c 'echo "APK: $1"; sha256sum "$1"' _ {} \;
