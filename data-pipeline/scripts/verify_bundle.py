#!/usr/bin/env python3
"""
Verify a bundled pack is internally consistent and installable.

Checks the exact contract bootstrap.ts relies on:
  - every file the manifest declares is present in the bundled assets
  - every file's size and MD5 match the manifest
  - every file in the generated require() map is declared in the manifest
    (an undeclared file would be copied but never verified)
  - tier-excluded files are genuinely absent

Run against whichever tier is currently bundled.
"""
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
APP = os.path.join(ROOT, "app")
GEN = os.path.join(APP, "src", "data", "bundledPacks.generated.ts")

REGION = sys.argv[1] if len(sys.argv) > 1 else "rajasthan"
ASSETS = os.path.join(APP, "assets", "packs", f"data-pack-{REGION}")

fails = []
def check(name, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {name}{('  -> ' + detail) if detail else ''}")
    if not ok:
        fails.append(name)

# ---- parse the generated require() map ----
gen = open(GEN, encoding="utf-8").read()
# Match the tier on the pack entry in the array, not the interface union.
tier_m = re.search(r"\n\s{4}tier:\s*['\"](\w+)['\"]", gen)
tier = tier_m.group(1) if tier_m else "?"
require_paths = re.findall(
    rf"\"([^\"]+)\":\s*require\(\"\.\./\.\./assets/packs/data-pack-{REGION}/([^\"]+)\"\)", gen)
declared_in_ts = sorted({rel for _full, rel in require_paths})

print(f"region={REGION} tier={tier}")
print(f"require() map lists {len(declared_in_ts)} files\n")

# ---- manifest ----
mpath = os.path.join(ASSETS, "manifest.json")
check("bundled manifest exists", os.path.exists(mpath), mpath)
manifest = json.load(open(mpath))
declared = manifest.get("files", [])
check("manifest declares a tier", "tier" in manifest, manifest.get("tier", "MISSING"))
check("manifest tier matches generated TS", manifest.get("tier") == tier,
      f"{manifest.get('tier')} vs {tier}")

# ---- every declared file present + hashes match ----
missing, bad_size, bad_md5 = [], [], []
for f in declared:
    p = os.path.join(ASSETS, f["path"])
    if not os.path.exists(p):
        missing.append(f["path"]); continue
    got = os.path.getsize(p)
    if got != f["size"]:
        bad_size.append(f"{f['path']} {got}!={f['size']}")
        continue
    if f.get("md5"):
        h = hashlib.md5(open(p, "rb").read()).hexdigest()
        if h != f["md5"]:
            bad_md5.append(f["path"])

check("every declared file is present in assets", not missing, ", ".join(missing) or "all present")
check("every declared size matches disk", not bad_size, ", ".join(bad_size) or f"{len(declared)} files")
check("every declared MD5 matches disk", not bad_md5, ", ".join(bad_md5) or f"{len(declared)} files")

# ---- require() map and manifest agree ----
manifest_paths = sorted({f["path"] for f in declared} | {"manifest.json"})
check("require() map == manifest declarations", declared_in_ts == manifest_paths,
      f"ts={len(declared_in_ts)} manifest={len(manifest_paths)}"
      + ("" if declared_in_ts == manifest_paths else
         f" diff={set(declared_in_ts) ^ set(manifest_paths)}"))

# ---- tier exclusions actually absent ----
excluded = manifest.get("excluded", [])
present_excluded = [e for e in excluded if os.path.exists(os.path.join(ASSETS, e))]
check("tier-excluded files are absent", not present_excluded, ", ".join(present_excluded) or f"excluded {len(excluded)}")

# ---- total size ----
total = sum(f["size"] for f in declared)
print(f"\npack size (declared): {total/1e6:.1f} MB")
print(f"files: {len(declared)}")
for f in declared:
    print(f"   {f['path']:34s} {f['size']/1e6:8.2f} MB")

# ---- what the tier means for the app ----
has_map = any("base-map" in f["path"] for f in declared)
has_elev = any("elevation" in f["path"] for f in declared)
print(f"\ncapabilities: map={'yes' if has_map else 'NO (Lite)'} "
      f"los_terrain={'yes' if has_elev else 'NO (Lite)'} "
      f"towers/fiber/soil/population=yes")

print(f"\n{'='*60}")
if fails:
    print(f"BUNDLE CHECK: {len(fails)} FAILED -> {fails}")
else:
    print("BUNDLE CHECK: all passed")
print("=" * 60)
sys.exit(1 if fails else 0)
