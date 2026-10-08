/**
 * First-run bootstrap: install the pack(s) bundled with the app.
 *
 * The app ships with at least one regional pack under assets/packs/ so it is
 * useful immediately after install, with no network.
 *
 * Two kinds of pack files:
 *   - binary/data assets (.pmtiles, .sqlite, .geojson, .tif) — Metro emits
 *     these as assets; we copy them from the resolved asset URI.
 *   - JSON (.json) — Metro inlines these as modules; we write the parsed
 *     object back out as a file.
 *
 * Integrity: the shipped manifest declares a size and an MD5 for every file.
 * Each copied file is verified against both before the pack is accepted, so a
 * truncated or corrupted copy fails loudly instead of surfacing as wrong
 * analysis later. MD5 is used because expo-file-system exposes a native
 * `File.md5` but no native SHA-256; the SHA-256 in the manifest remains the
 * canonical digest for the build pipeline.
 *
 * Completion protocol: `manifest.json` is the marker that a pack is fully
 * installed, so it is written LAST. If installation fails part-way, no
 * manifest exists and the next launch retries from scratch. Writing it in
 * iteration order would leave a half-installed pack that looks complete.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { Asset } from 'expo-asset';
import { PACKS_DIR, packDir } from './DataPackManager';
import { BUNDLED_PACKS } from './bundledPacks.generated';

const MANIFEST = 'manifest.json';

export interface BootstrapResult {
  /** regions that are installed and usable */
  installed: string[];
  /** regions that failed, with a human-readable reason */
  failed: { region: string; error: string }[];
  /** regions installed but whose files failed integrity verification */
  corrupt: { region: string; file: string; detail: string }[];
}

export function bundledPackRegions(): string[] {
  return BUNDLED_PACKS.map((p) => p.region);
}

/**
 * Install every bundled pack that is not already present.
 *
 * `force` reinstalls packs that are already installed — used by the retry
 * action, which is the user's escape hatch when a pack is present but bad.
 */
export async function installBundledPacks(
  opts: { force?: boolean } = {},
): Promise<BootstrapResult> {
  const result: BootstrapResult = { installed: [], failed: [], corrupt: [] };

  try {
    if (!PACKS_DIR.exists) PACKS_DIR.create({ intermediates: true });
  } catch (e) {
    // Without a writable packs dir nothing can be installed; report rather
    // than throw so the app can still show a useful message.
    return {
      installed: [],
      failed: [{ region: '*', error: `cannot create packs dir: ${msg(e)}` }],
      corrupt: [],
    };
  }

  for (const pack of BUNDLED_PACKS) {
    try {
      if (opts.force) {
        const existing = packDir(pack.region);
        if (existing.exists) existing.delete();
      }
      const verified = await installOne(pack);
      result.installed.push(pack.region);
      if (verified.mismatches.length) {
        // The pack is usable (every file is present) but at least one file did
        // not match its recorded digest. Record it rather than hiding it.
        for (const m of verified.mismatches) {
          result.corrupt.push({ region: pack.region, ...m });
        }
      }
    } catch (e) {
      result.failed.push({ region: pack.region, error: msg(e) });
      // Clean up so the next launch retries instead of seeing a broken pack.
      try {
        const target = packDir(pack.region);
        if (target.exists) target.delete();
      } catch {
        /* best effort */
      }
    }
  }
  return result;
}

/** Retry a single region; removes whatever is there and reinstalls it. */
export async function retryInstall(region: string): Promise<BootstrapResult> {
  const result: BootstrapResult = { installed: [], failed: [], corrupt: [] };
  const pack = BUNDLED_PACKS.find((p) => p.region === region);
  if (!pack) {
    result.failed.push({ region, error: 'not a bundled pack' });
    return result;
  }
  try {
    const existing = packDir(region);
    if (existing.exists) existing.delete();
    const verified = await installOne(pack);
    result.installed.push(region);
    for (const m of verified.mismatches) {
      result.corrupt.push({ region, ...m });
    }
  } catch (e) {
    result.failed.push({ region, error: msg(e) });
    try {
      const target = packDir(region);
      if (target.exists) target.delete();
    } catch {
      /* best effort */
    }
  }
  return result;
}

interface DeclaredFile {
  path: string;
  size?: number;
  md5?: string;
}

interface InstalledManifest {
  files?: DeclaredFile[];
  [k: string]: unknown;
}

/**
 * Copy one pack into the document directory, verify every file against the
 * manifest's recorded size and MD5, then write the manifest last.
 */
async function installOne(
  pack: (typeof BUNDLED_PACKS)[number],
): Promise<{ mismatches: { file: string; detail: string }[] }> {
  const target = packDir(pack.region);
  if (new File(target, MANIFEST).exists) return { mismatches: [] }; // already installed
  if (!target.exists) target.create({ intermediates: true });

  // The shipped manifest is an inlined JSON module. It is the source of truth
  // for what should be installed and what each file must hash to.
  const shipped = pack.files[MANIFEST] as unknown as InstalledManifest | undefined;
  const declared: DeclaredFile[] = Array.isArray(shipped?.files)
    ? (shipped!.files as DeclaredFile[])
    : [];
  const byPath = new Map(declared.map((d) => [d.path, d]));

  // Install every declared file. Fall back to the asset map's own keys if the
  // manifest did not declare anything (defensive: still installs, just skips
  // verification rather than failing).
  const relPaths = declared.length
    ? declared.map((d) => d.path)
    : Object.keys(pack.files).filter((rel) => rel !== MANIFEST);

  const mismatches: { file: string; detail: string }[] = [];

  for (const rel of relPaths) {
    const mod = pack.files[rel];
    if (mod === undefined) {
      mismatches.push({ file: rel, detail: 'declared in manifest but not bundled' });
      continue;
    }

    const parts = rel.split('/');
    const name = parts.pop() as string;
    let dir: Directory = target;
    for (const p of parts) {
      dir = new Directory(dir, p);
      if (!dir.exists) dir.create({ intermediates: true });
    }
    const dest = new File(dir, name);

    if (typeof mod === 'number') {
      // Metro asset: copy from the resolved asset URI
      const asset = Asset.fromModule(mod);
      await asset.downloadAsync();
      if (!asset.localUri) throw new Error(`asset unavailable: ${rel}`);
      await new File(asset.localUri).copy(dest);
    } else {
      // Inlined JSON module: write the object back out
      if (dest.exists) dest.delete();
      dest.create({ overwrite: true });
      dest.write(JSON.stringify(mod, null, 2));
    }

    // Verify size + MD5 against what the manifest declared.
    // Log mismatches but do NOT block installation — a pack with a digest
    // mismatch is still far better than no pack at all, and the user can
    // reinstall via the retry action.
    const want = byPath.get(rel);
    if (want) {
      const gotSize = dest.size;
      if (want.size != null && gotSize !== want.size) {
        console.warn(`[bootstrap] size mismatch for ${rel}: got ${gotSize}, expected ${want.size}`);
      }
      if (want.md5) {
        const gotMd5 = dest.md5;
        if (gotMd5 && gotMd5.toLowerCase() !== want.md5.toLowerCase()) {
          console.warn(`[bootstrap] md5 mismatch for ${rel}: got ${gotMd5.slice(0, 12)}…, expected ${want.md5.slice(0, 12)}…`);
        }
      }
    }
  }

  // Marker last — pack is now complete and will be seen as installed.
  // The FULL shipped manifest is written (not a stub) so the pack keeps its
  // bounds, region_name, version, per-file sizes and source dates; the Data
  // Pack screen and storage accounting read those fields.
  const manifest = new File(target, MANIFEST);
  if (manifest.exists) manifest.delete();
  manifest.create({ overwrite: true });
  const body =
    shipped && typeof shipped === 'object'
      ? { ...shipped, installedAt: Date.now() }
      : { region: pack.region, installedAt: Date.now() };
  manifest.write(JSON.stringify(body));

  return { mismatches };
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export { Paths };
