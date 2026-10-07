/**
 * Data pack manager — install / list / delete offline regional packs.
 *
 * A pack is a directory under the app's document directory:
 *   <document>/data-packs/data-pack-<region>/
 *       manifest.json
 *       vectors/towers.sqlite
 *       vectors/fiber.sqlite
 *       vectors/soil.geojson
 *       config/soil-classification.json
 *
 * Uses the expo-file-system v57 class API (File / Directory / Paths).
 */
import { Directory, File, Paths } from 'expo-file-system';
import { Asset } from 'expo-asset';

export interface PackManifest {
  region: string;
  region_name: string;
  state: string;
  version: string;
  created_at: string;
  installedAt?: number;
  bounds: { min_lat: number; max_lat: number; min_lon: number; max_lon: number };
  files: { path: string; size: number; sha256: string; md5?: string }[];
  /**
   * Upstream publication vintages, one per dataset. These are the SOURCE dates,
   * never the pack build time — see data-pipeline/scripts/provenance.py.
   */
  source_dates?: Record<string, string>;
  /** Full provenance records (source/type/vintage/resolution/limitation). */
  provenance?: Record<string, {
    source: string; provider?: string; type: string; vintage: string;
    resolution?: string; coverage?: string; status?: string; limitation?: string;
  }>;
}

export const PACKS_DIR = new Directory(Paths.document, 'data-packs');

export function packDir(region: string): Directory {
  return new Directory(PACKS_DIR, `data-pack-${region}`);
}

export function ensurePacksDir(): void {
  if (!PACKS_DIR.exists) PACKS_DIR.create({ intermediates: true });
}

export function isPackInstalled(region: string): boolean {
  return new File(packDir(region), 'manifest.json').exists;
}

export async function readManifest(region: string): Promise<PackManifest | null> {
  const f = new File(packDir(region), 'manifest.json');
  if (!f.exists) return null;
  try {
    return JSON.parse(await f.text()) as PackManifest;
  } catch (e) {
    // A corrupt manifest must not take down the pack list; treat it as
    // "not installed" so the pack can be reinstalled.
    console.warn(`manifest unreadable for ${region}`, e);
    return null;
  }
}

export async function listInstalledPacks(): Promise<PackManifest[]> {
  const out: PackManifest[] = [];
  try {
    ensurePacksDir();
  } catch (e) {
    console.warn('cannot access packs dir', e);
    return out;
  }
  let entries: unknown[];
  try {
    entries = PACKS_DIR.list();
  } catch (e) {
    console.warn('cannot list packs dir', e);
    return out;
  }
  for (const entry of entries) {
    if (!(entry instanceof Directory)) continue;
    const region = entry.name.replace('data-pack-', '');
    try {
      const m = await readManifest(region);
      if (m) out.push(m);
    } catch (e) {
      console.warn(`skipping unreadable pack ${region}`, e);
    }
  }
  return out;
}

export function deletePack(region: string): void {
  const d = packDir(region);
  try {
    if (d.exists) d.delete();
  } catch (e) {
    console.warn(`cannot delete pack ${region}`, e);
    throw new Error(`Could not delete ${region}: ${e instanceof Error ? e.message : e}`);
  }
}

/** Storage used by all installed packs, in bytes. */
export async function storageUsedBytes(): Promise<number> {
  const packs = await listInstalledPacks();
  return packs.reduce((s, m) => s + m.files.reduce((a, f) => a + f.size, 0), 0);
}

export interface IntegrityIssue {
  file: string;
  detail: string;
}

/**
 * Check an installed pack's files against the manifest's recorded size and
 * MD5. Returns the files that do not match; an empty array means the pack is
 * intact.
 *
 * This runs on launch for installed packs because bootstrap only verifies at
 * install time — a file truncated later (failed update, storage pressure,
 * interrupted copy) would otherwise be served as valid data.
 */
export async function verifyInstalledPack(region: string): Promise<IntegrityIssue[]> {
  const manifest = await readManifest(region);
  if (!manifest) return [{ file: '*', detail: 'manifest missing or unreadable' }];

  const dir = packDir(region);
  const issues: IntegrityIssue[] = [];

  for (const f of manifest.files ?? []) {
    const target = new File(dir, f.path);
    if (!target.exists) {
      issues.push({ file: f.path, detail: 'missing' });
      continue;
    }
    if (f.size != null && target.size !== f.size) {
      issues.push({ file: f.path, detail: `size ${target.size} != ${f.size}` });
      continue;
    }
    if (f.md5) {
      const got = target.md5;
      if (got && got.toLowerCase() !== f.md5.toLowerCase()) {
        issues.push({ file: f.path, detail: `md5 ${got.slice(0, 12)}… != ${f.md5.slice(0, 12)}…` });
      }
    }
  }
  return issues;
}

/**
 * Install a pack bundled as an Expo asset (offline, no network).
 * `assets` maps pack-relative path -> require('...') module id.
 */
export async function installFromAssets(
  region: string,
  assets: Record<string, number>,
): Promise<void> {
  ensurePacksDir();
  const dir = packDir(region);
  if (!dir.exists) dir.create({ intermediates: true });

  for (const [rel, mod] of Object.entries(assets)) {
    const asset = Asset.fromModule(mod);
    await asset.downloadAsync();
    if (!asset.localUri) continue;
    const src = new File(asset.localUri);
    const parts = rel.split('/');
    const name = parts.pop() as string;
    let target = dir;
    for (const p of parts) {
      target = new Directory(target, p);
      if (!target.exists) target.create({ intermediates: true });
    }
    await src.copy(new File(target, name));
  }
}

/** Install a pack from a local directory (side-load / SD card). */
export async function installFromDirectory(region: string, sourceDir: Directory): Promise<void> {
  ensurePacksDir();
  const target = packDir(region);
  if (target.exists) target.delete();
  await sourceDir.copy(target);
}
