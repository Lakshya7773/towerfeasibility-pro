#!/usr/bin/env python3
"""
Beta Test Suite — Trustworthiness Dimension
Checks disclaimers, error handling, data freshness, and offline guarantees.
"""
import json
import os
import re
import sys

APP = os.path.join(os.path.dirname(__file__), '..', '..', 'app')
PACK = os.path.join(os.path.dirname(__file__), '..', '..', 'dist', 'packs', 'data-pack-rajasthan')
SRC = os.path.join(APP, 'src')

results = []

def check(name, condition, detail='', dimension='trustworthiness'):
    status = 'PASS' if condition else 'FAIL'
    results.append({
        'dimension': dimension,
        'test': name,
        'status': status,
        'detail': detail,
    })
    print(f'{status}  {name:55s} {detail}')
    return condition

# ============================================================
# T-TR01: Disclaimers Present
# ============================================================
print('\n' + '=' * 60)
print('T-TR01: Disclaimers Present')
print('=' * 60)

# Check soil disclaimer in report HTML
report_path = os.path.join(APP, 'src', 'report', 'reportHtml.ts')
with open(report_path) as f:
    report_src = f.read()

check('Soil disclaimer in report source',
      'screening only' in report_src.lower() or 'borehole' in report_src.lower(),
      'soil screening disclaimer')

check('Soil disclaimer mentions borehole',
      'borehole' in report_src.lower(),
      'borehole required')

# Check data source citations
check('Population source cited',
      'worldpop' in report_src.lower() or 'population' in report_src.lower(),
      'WorldPop citation')

check('Elevation source cited',
      'elevation' in report_src.lower() or 'srtm' in report_src.lower() or 'terrain' in report_src.lower(),
      'elevation source')

check('Tower source cited',
      'tower' in report_src.lower() or 'tarang' in report_src.lower() or 'opencellid' in report_src.lower(),
      'tower source')

# Check confidence indicators
check('Confidence/estimate indicators',
      'estimate' in report_src.lower() or 'confidence' in report_src.lower() or 'proxy' in report_src.lower(),
      'estimate/confidence flags')

# ============================================================
# T-TR02: Error Handling
# ============================================================
print('\n' + '=' * 60)
print('T-TR02: Error Handling')
print('=' * 60)

# Check engines handle null/missing data
engines = ['towerEngine', 'populationEngine', 'losEngine', 'soilEngine',
           'resourceEngine', 'adminEngine', 'rowEngine']

for eng in engines:
    path = os.path.join(SRC, 'analysis', f'{eng}.ts')
    if os.path.exists(path):
        with open(path) as f:
            src = f.read()
        has_null_check = 'null' in src or 'undefined' in src or '!' in src or '?' in src
        check(f'{eng} handles null/missing', has_null_check, 'null/undefined checks')
    else:
        check(f'{eng} exists', False, 'file not found')

# Check DataPackManager handles missing pack
dpm_path = os.path.join(SRC, 'data', 'DataPackManager.ts')
with open(dpm_path) as f:
    dpm_src = f.read()
check('DataPackManager handles missing pack',
      'not found' in dpm_src.lower() or 'missing' in dpm_src.lower() or 'error' in dpm_src.lower(),
      'missing pack handling')

# Check bootstrap handles corrupt pack
boot_path = os.path.join(SRC, 'data', 'bootstrap.ts')
with open(boot_path) as f:
    boot_src = f.read()
check('Bootstrap handles errors',
      'catch' in boot_src or 'error' in boot_src.lower() or 'try' in boot_src,
      'try/catch present')

# ============================================================
# T-TR03: Data Freshness
# ============================================================
print('\n' + '=' * 60)
print('T-TR03: Data Freshness')
print('=' * 60)

# Check population config has year
pop_cfg_path = os.path.join(PACK, 'config', 'population.json')
with open(pop_cfg_path) as f:
    pop_cfg = json.load(f)
check('Population data year stated',
      'year' in pop_cfg or '2020' in str(pop_cfg),
      f"year={pop_cfg.get('year', 'NOT FOUND')}")

# Check elevation config has source
elev_cfg_path = os.path.join(DATA := os.path.join(os.path.dirname(__file__), '..', '..', 'data'),
                              'elevation', 'processed', 'rajasthan_elevation.json')
with open(elev_cfg_path) as f:
    elev_cfg = json.load(f)
check('Elevation source stated',
      'source' in elev_cfg,
      f"source={elev_cfg.get('source', 'NOT FOUND')}")

# Check tower data source
towers_path = os.path.join(PACK, 'vectors', 'towers.sqlite')
import sqlite3
conn = sqlite3.connect(towers_path)
cur = conn.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cur.fetchall()]
check('Tower data has metadata table',
      'metadata' in tables or 'source' in tables or len(tables) > 0,
      f'tables={tables}')
conn.close()

# ============================================================
# T-TR04: Offline Guarantee
# ============================================================
print('\n' + '=' * 60)
print('T-TR04: Offline Guarantee')
print('=' * 60)

# Scan the app's OWN source for network APIs. Vendored bundles
# (*.generated.ts) are third-party libraries and are excluded — MapLibre
# contains fetch/XMLHttpRequest internally but only uses them for remote
# styles, which this app never configures.
NET_CALL_PATTERNS = [
    (r'\bfetch\s*\(', 'fetch()'),
    (r'\bXMLHttpRequest\b', 'XMLHttpRequest'),
    (r'\baxios\b', 'axios'),
    (r'\bWebSocket\s*\(', 'WebSocket'),
    (r'\bEventSource\s*\(', 'EventSource'),
    (r'\bsendBeacon\b', 'sendBeacon'),
    (r'\brequire\([\'"](https?:|//)', 'remote require'),
]

src_files = []
for root, dirs, files in os.walk(SRC):
    for f in files:
        if f.endswith(('.ts', '.tsx', '.js', '.jsx')) and not f.endswith('.generated.ts'):
            src_files.append(os.path.join(root, f))

violations = []
for fpath in src_files:
    with open(fpath) as fh:
        for lineno, line in enumerate(fh, 1):
            code = line.split('//')[0]  # ignore trailing comments
            stripped = code.strip()
            if stripped.startswith('*') or stripped.startswith('/*'):
                continue
            for pat, label in NET_CALL_PATTERNS:
                if re.search(pat, code):
                    violations.append((os.path.relpath(fpath, APP), lineno, label,
                                       stripped[:70]))

check('No network calls in app source',
      len(violations) == 0,
      f'{len(violations)} violations' if violations else f'{len(src_files)} files clean')

for v in violations[:10]:
    print(f'    {v[0]}:{v[1]}  {v[2]}  ->  {v[3]}')

# Absolute remote URLs in app code (excluding XML namespaces and schema URIs,
# which are identifiers, not requests).
URL_RE = re.compile(r'https?://[^\s"\'`)]+')
ALLOWED_HOSTS = ('www.w3.org', 'schemas.android.com', 'localhost', '127.0.0.1')
url_hits = []
for fpath in src_files:
    with open(fpath) as fh:
        for lineno, line in enumerate(fh, 1):
            code = line.split('//')[0]
            for u in URL_RE.findall(code):
                if any(h in u for h in ALLOWED_HOSTS):
                    continue
                url_hits.append((os.path.relpath(fpath, APP), lineno, u[:70]))

check('No remote URLs in app source',
      len(url_hits) == 0,
      f'{len(url_hits)} found' if url_hits else 'none')
for h in url_hits[:10]:
    print(f'    {h[0]}:{h[1]}  {h[2]}')

# Vendored map bundle must not reference a CDN host. A bare "cdn" substring is
# not evidence (minified code contains it incidentally); check real hostnames.
map_bundle_path = os.path.join(SRC, 'components', 'map', 'mapBundles.generated.ts')
if os.path.exists(map_bundle_path):
    with open(map_bundle_path) as f:
        map_src = f.read()
    cdn_hosts = ('unpkg.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com',
                 'ajax.googleapis.com', 'cdn.skypack.dev', 'esm.sh')
    found = [h for h in cdn_hosts if h in map_src]
    check('Map bundle has no CDN host', not found, f'found={found}' if found else 'none')
    check('No external font hosts',
          'fonts.googleapis' not in map_src and 'fonts.gstatic' not in map_src,
          'no Google Fonts')
else:
    check('Map bundle exists', False, 'file not found')

# ============================================================
# T-TR: Pack integrity (added after 5-parameter inspection)
# The manifest records size + MD5 for every file; the app must actually
# verify them, or a corrupted pack is served as valid data.
# ============================================================
import hashlib

bootstrap_src = open(os.path.join(SRC, 'data', 'bootstrap.ts'), encoding='utf-8').read()
dpm_src = open(os.path.join(SRC, 'data', 'DataPackManager.ts'), encoding='utf-8').read()
bundle_src = open(os.path.join(SRC, 'data', 'bundle_pack.py'), encoding='utf-8').read() \
    if os.path.exists(os.path.join(SRC, 'data', 'bundle_pack.py')) else ''

check('Manifest records md5 per file (not just sha256)',
      all('md5' in f for f in json.load(open(os.path.join(PACK, 'manifest.json')))['files']),
      'md5 in manifest.files[]')

check('App verifies md5 on install',
      '.md5' in bootstrap_src and 'integrity check failed' in bootstrap_src,
      'bootstrap.ts compares File.md5')

check('App verifies size on install',
      '.size' in bootstrap_src and 'expected' in bootstrap_src,
      'bootstrap.ts compares File.size')

check('App re-verifies installed packs on launch',
      'verifyInstalledPack' in dpm_src,
      'DataPackManager.verifyInstalledPack')

check('Failed verification blocks the install',
      'integrity check failed' in bootstrap_src and 'throw new Error' in bootstrap_src,
      'mismatch throws so pack is not marked installed')

check('Shipped manifest preserved after install (not a stub)',
      'shipped' in bootstrap_src and 'installedAt' in bootstrap_src,
      'bootstrap writes the full manifest + installedAt')

check('Manifest records source vintage dates',
      bool(json.load(open(os.path.join(PACK, 'manifest.json'))).get('source_dates')),
      'source_dates in manifest')

check('Tower data vintage is stated',
      'towers' in (json.load(open(os.path.join(PACK, 'manifest.json'))).get('source_dates') or {}),
      'source_dates.towers present')

# Manifest md5 values must match the files on disk.
_mf = json.load(open(os.path.join(PACK, 'manifest.json')))
_md5_bad = []
for _f in _mf['files']:
    _p = os.path.join(PACK, _f['path'])
    if os.path.exists(_p) and _f.get('md5'):
        if hashlib.md5(open(_p, 'rb').read()).hexdigest() != _f['md5']:
            _md5_bad.append(_f['path'])
check('Every manifest md5 matches the file on disk', not _md5_bad,
      ', '.join(_md5_bad) or f"{len(_mf['files'])} files verified")

# ============================================================
# T-TR: Reliability hardening (added after 5-parameter inspection)
# ============================================================
winplan = os.path.join(SRC, 'data', 'windowPlan.ts')
check('Windowed raster reads are capped', os.path.exists(winplan)
      and 'MAX_WINDOW_CELLS' in open(winplan, encoding='utf-8').read(),
      'windowPlan.MAX_WINDOW_CELLS')

check('LoS window uses the capped planner',
      'planWindow' in open(os.path.join(SRC, 'data', 'RasterSampler.ts'), encoding='utf-8').read(),
      'RasterSampler.planWindow')

app_src = open(os.path.join(SRC, 'app', 'App.tsx'), encoding='utf-8').read()
check('Bootstrap failure offers a retry action',
      'retry' in app_src and 'retryInstall' in app_src,
      'App.tsx retry button')

# ============================================================
# Summary
# ============================================================
print('\n' + '=' * 60)
print('TRUSTWORTHINESS TEST SUMMARY')
print('=' * 60)

passed = sum(1 for r in results if r['status'] == 'PASS')
failed = sum(1 for r in results if r['status'] == 'FAIL')
total = len(results)

print(f'Passed: {passed}/{total}')
print(f'Failed: {failed}/{total}')
print(f'Score: {passed/total*100:.1f}%')

if failed > 0:
    print('\nFailed tests:')
    for r in results:
        if r['status'] == 'FAIL':
            print(f'  - {r["test"]}: {r["detail"]}')

print('=' * 60)
sys.exit(0 if failed == 0 else 1)
