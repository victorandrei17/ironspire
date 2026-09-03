/**
 * Build-time discovery of atlas files.
 *
 * We resolve the atlas through Vite's glob rather than fetching it blind: with
 * no art in the repo a blind fetch logs a 404 in the console on every boot, and
 * "no console errors" is part of the Definition of Done. No atlas simply means
 * no entries here, and the placeholders take over (SPEC §13.6).
 */
const jsonUrls: Record<string, string> = import.meta.glob('/assets/atlas/*.json', {
  eager: true,
  query: '?url',
  import: 'default',
});

const imageUrls: Record<string, string> = import.meta.glob('/assets/atlas/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

function basename(path: string): string {
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  return path.slice(slash + 1, dot > slash ? dot : undefined);
}

/** Resolved URL for `<name>.json`, or null when that atlas was not packed. */
export function atlasJsonUrl(name: string): string | null {
  for (const path of Object.keys(jsonUrls)) {
    if (basename(path) === name) return jsonUrls[path] ?? null;
  }
  return null;
}

/** Resolved URL for an atlas image referenced by the manifest's `meta.image`. */
export function atlasImageUrl(fileName: string): string | null {
  const want = basename(fileName);
  for (const path of Object.keys(imageUrls)) {
    if (basename(path) === want) return imageUrls[path] ?? null;
  }
  return null;
}

/** True when at least one atlas was packed into the build. */
export function hasAnyAtlas(): boolean {
  return Object.keys(jsonUrls).length > 0;
}
