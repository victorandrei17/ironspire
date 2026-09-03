import { Atlas, atlasVariantForDpr, type AtlasJson } from './atlas.ts';
import { setAtlas } from './drawSprite.ts';
import { atlasJsonUrl, atlasImageUrl, hasAnyAtlas } from './atlasManifest.ts';

/**
 * Loads the atlas, if there is one (SPEC §13.6).
 *
 * Every failure path here is a no-op, not an error: the game is fully playable
 * on procedural placeholders. A blank screen in production because a PNG 404'd
 * is exactly what this design exists to prevent.
 */
export type LoadProgress = (loaded: number, total: number) => void;

export class AssetRegistry {
  atlas: Atlas | null = null;
  /** True when an atlas actually loaded. False is a normal, supported state. */
  loaded = false;
  lastError: string | null = null;

  async load(name: string, dpr: number, onProgress?: LoadProgress): Promise<void> {
    onProgress?.(0, 2);
    if (!hasAnyAtlas()) {
      this.lastError = 'no atlas packed';
      onProgress?.(2, 2);
      return;
    }
    const variant = atlasVariantForDpr(name, dpr);
    const url = atlasJsonUrl(variant) ?? atlasJsonUrl(name);
    const json = url === null ? null : await this.fetchJson(url);
    if (json === null) {
      this.lastError = 'no atlas manifest';
      onProgress?.(2, 2);
      return;
    }
    onProgress?.(1, 2);

    const atlas = Atlas.parse(json);
    const imgUrl = atlasImageUrl(json.meta.image);
    const image = imgUrl === null ? null : await this.fetchImage(imgUrl);
    onProgress?.(2, 2);
    if (image === null) {
      this.lastError = 'atlas image failed to decode';
      return;
    }
    atlas.image = image;
    atlas.maskImage = buildWhiteMask(image, json.meta.size.w, json.meta.size.h);
    this.atlas = atlas;
    this.loaded = true;
    setAtlas(atlas);
  }

  private async fetchJson(url: string): Promise<AtlasJson | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return (await res.json()) as AtlasJson;
    } catch {
      // A broken atlas must never break the game — fall through to placeholders.
      return null;
    }
  }

  private async fetchImage(url: string): Promise<ImageBitmap | HTMLImageElement | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      // createImageBitmap decodes off the main thread; fall back for old Safari.
      if (typeof createImageBitmap === 'function') return await createImageBitmap(blob);
      return await decodeViaImage(URL.createObjectURL(blob));
    } catch {
      return null;
    }
  }
}

function decodeViaImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = (): void => resolve(img);
    img.onerror = (): void => resolve(null);
    img.src = src;
  });
}

function buildWhiteMask(
  image: ImageBitmap | HTMLImageElement,
  w: number,
  h: number,
): HTMLCanvasElement | null {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx === null) return null;
  ctx.drawImage(image, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  return c;
}
