/** One packed frame, in atlas pixel space. */
export type AtlasFrame = {
  /** Source rect in the atlas image. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Pivot in 0..1 of the *untrimmed* source size. */
  px: number;
  py: number;
  /** Offset of the trimmed rect inside the untrimmed source, in source pixels. */
  ox: number;
  oy: number;
  /** Untrimmed logical size, in source pixels. */
  w: number;
  h: number;
};

export type AtlasJson = {
  meta: { image: string; size: { w: number; h: number }; scale: number; version: number };
  frames: Record<
    string,
    {
      frame: { x: number; y: number; w: number; h: number };
      pivot?: { x: number; y: number };
      trimmed?: boolean;
      spriteSourceSize?: { x: number; y: number; w: number; h: number };
      sourceSize?: { w: number; h: number };
    }
  >;
};

/**
 * A parsed atlas: key → frame, plus the decoded image.
 *
 * Lookup is a plain Map read in the hot loop; parsing happens once at load.
 */
export class Atlas {
  readonly frames = new Map<string, AtlasFrame>();
  image: ImageBitmap | HTMLImageElement | null = null;
  /** Solid-white copy of the atlas, for the hit flash. Built once at load. */
  maskImage: HTMLCanvasElement | null = null;
  /** Source-pixels-per-atlas-pixel. 2 for an @2x atlas. */
  scale = 1;

  static parse(json: AtlasJson): Atlas {
    const atlas = new Atlas();
    atlas.scale = json.meta.scale > 0 ? json.meta.scale : 1;
    for (const key of Object.keys(json.frames)) {
      const f = json.frames[key];
      if (f === undefined) continue;
      const source = f.sourceSize ?? { w: f.frame.w, h: f.frame.h };
      const sss = f.spriteSourceSize ?? { x: 0, y: 0, w: f.frame.w, h: f.frame.h };
      const pivot = f.pivot ?? { x: 0.5, y: 0.5 };
      atlas.frames.set(key, {
        sx: f.frame.x,
        sy: f.frame.y,
        sw: f.frame.w,
        sh: f.frame.h,
        px: pivot.x,
        py: pivot.y,
        ox: sss.x,
        oy: sss.y,
        w: source.w,
        h: source.h,
      });
    }
    return atlas;
  }

  get(key: string): AtlasFrame | undefined {
    return this.frames.get(key);
  }

  get ready(): boolean {
    return this.image !== null && this.frames.size > 0;
  }
}

/** Picks the @2x variant once the device is dense enough to see it (SPEC §13.3). */
export function atlasVariantForDpr(baseName: string, dpr: number): string {
  return dpr >= 1.5 ? `${baseName}@2x` : baseName;
}
