/**
 * The actual placeholder shapes, one per archetype (SPEC §5.1 / §13.2).
 *
 * Split from `placeholders.ts` on purpose: that file is the mechanism, this one
 * is content. Colours are locked per archetype — elite is a gold overlay drawn
 * by the renderer, never a recolour (SPEC §13.7).
 */
import {
  registerPlaceholder,
  circle,
  poly,
  tri,
  rect,
  diamond,
  cross,
  ghost,
  ring,
} from './placeholders.ts';

/** Sprite grid sizes from SPEC §13.7, in world units. */
const S_COMMON = 48;
const S_BRUTE = 80;
const S_BOSS = 192;
const S_PROJ = 24;

// --- Enemies -----------------------------------------------------------------

registerPlaceholder('enemy/grunt/*', S_COMMON, (c, s) => {
  circle(c, s * 0.42, '#5c8a3a', '#22380f');
  // Eye slit: gives the blob a facing so rotation reads.
  c.fillStyle = '#22380f';
  c.fillRect(s * 0.1, -s * 0.06, s * 0.2, s * 0.12);
});

registerPlaceholder('enemy/runner/*', S_COMMON, (c, s) => {
  tri(c, s * 0.5, '#d9c33a', '#5f5309');
});

registerPlaceholder('enemy/brute/*', S_BRUTE, (c, s) => {
  poly(c, 6, s * 0.46, '#b04a35', '#4d1c11');
  poly(c, 6, s * 0.24, '#8c3826', '#4d1c11');
});

registerPlaceholder('enemy/swarmling/*', S_COMMON * 0.5, (c, s) => {
  circle(c, s * 0.44, '#b8bec9', '#4c525c');
});

registerPlaceholder('enemy/spitter/*', S_COMMON, (c, s) => {
  diamond(c, s * 0.9, s * 0.72, '#8a4fd0', '#361a5c');
  c.fillStyle = '#cfa6ff';
  c.beginPath();
  c.arc(s * 0.16, 0, s * 0.09, 0, Math.PI * 2);
  c.fill();
});

registerPlaceholder('enemy/warden/*', S_COMMON, (c, s) => {
  rect(c, s * 0.76, s * 0.76, '#4a7fb5', '#17304a', 4);
  // The front shield bar — this is the tell for the 100 deg damage cone.
  c.fillStyle = '#9dd0ff';
  c.fillRect(s * 0.3, -s * 0.42, s * 0.14, s * 0.84);
  c.strokeStyle = '#17304a';
  c.lineWidth = 1.8;
  c.strokeRect(s * 0.3, -s * 0.42, s * 0.14, s * 0.84);
});

registerPlaceholder('enemy/mender/*', S_COMMON, (c, s) => {
  cross(c, s * 0.42, s * 0.28, '#7fe0a0', '#1f5c38');
});

registerPlaceholder('enemy/splitter/*', S_COMMON, (c, s) => {
  diamond(c, s * 0.86, s * 0.64, '#e08a35', '#5e3208');
  // Split seam: telegraphs that this one comes apart when it dies.
  c.strokeStyle = '#5e3208';
  c.lineWidth = 2.4;
  c.beginPath();
  c.moveTo(0, -s * 0.32);
  c.lineTo(0, s * 0.32);
  c.stroke();
});

registerPlaceholder('enemy/wraith/*', S_COMMON, (c, s) => {
  c.globalAlpha = 0.72;
  ghost(c, s * 0.46, '#5fe0e0', '#17595c');
  c.globalAlpha = 1;
  c.fillStyle = '#0d2a2c';
  c.fillRect(s * 0.02, -s * 0.14, s * 0.1, s * 0.1);
  c.fillRect(s * 0.2, -s * 0.14, s * 0.1, s * 0.1);
});

// --- Bosses ------------------------------------------------------------------

registerPlaceholder('boss/colossus/*', S_BOSS, (c, s) => {
  poly(c, 6, s * 0.44, '#c05a3f', '#3d150c');
  poly(c, 6, s * 0.28, '#8a3624', '#3d150c');
  ring(c, s * 0.5, 3, '#f2c14e');
});

registerPlaceholder('boss/hive/*', S_BOSS, (c, s) => {
  circle(c, s * 0.42, '#7a6a3a', '#2e2710');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    c.beginPath();
    c.arc(Math.cos(a) * s * 0.26, Math.sin(a) * s * 0.26, s * 0.09, 0, Math.PI * 2);
    c.fillStyle = '#c8b25a';
    c.fill();
  }
  ring(c, s * 0.5, 3, '#f2c14e');
});

registerPlaceholder('boss/warlock/*', S_BOSS, (c, s) => {
  diamond(c, s * 0.8, s * 0.94, '#7a3fbf', '#2a1149');
  circle(c, s * 0.16, '#e2c6ff', '#2a1149');
  ring(c, s * 0.5, 3, '#f2c14e');
});

// --- Tower -------------------------------------------------------------------

registerPlaceholder('tower/base', 128, (c, s) => {
  poly(c, 8, s * 0.32, '#39465c', '#141c28');
  poly(c, 8, s * 0.24, '#4b5b76', '#141c28');
});

registerPlaceholder('tower/core', 64, (c, s) => {
  circle(c, s * 0.26, '#9fe8ff', '#1e4a5e');
  circle(c, s * 0.14, '#ffffff', '#9fe8ff');
});

registerPlaceholder('tower/cannon', 96, (c, s) => {
  // Drawn pointing right (0 rad) — the renderer rotates it (SPEC §13.7).
  rect(c, s * 0.5, s * 0.16, '#68789a', '#141c28', 3);
  c.fillStyle = '#9fe8ff';
  c.fillRect(s * 0.2, -s * 0.05, s * 0.08, s * 0.1);
});

registerPlaceholder('tower/shield', 128, (c, s) => {
  ring(c, s * 0.42, 4, 'rgba(159,232,255,0.85)');
});

// --- Projectiles & pickups ---------------------------------------------------

registerPlaceholder('proj/bolt', S_PROJ, (c, s) => {
  c.beginPath();
  c.moveTo(s * 0.42, 0);
  c.lineTo(-s * 0.2, s * 0.14);
  c.lineTo(-s * 0.08, 0);
  c.lineTo(-s * 0.2, -s * 0.14);
  c.closePath();
  c.fillStyle = '#bfe9ff';
  c.fill();
  c.strokeStyle = '#3f8fb5';
  c.lineWidth = 1.4;
  c.stroke();
});

registerPlaceholder('proj/enemy_bolt', S_PROJ, (c, s) => {
  circle(c, s * 0.2, '#c78af5', '#3c1a5e');
});

registerPlaceholder('proj/orb', S_PROJ * 1.4, (c, s) => {
  circle(c, s * 0.3, '#9fe8ff', '#1e4a5e');
});

registerPlaceholder('pickup/gold', 24, (c, s) => {
  circle(c, s * 0.3, '#f2c14e', '#6b4c0d');
  c.fillStyle = '#fff0c0';
  c.beginPath();
  c.arc(-s * 0.08, -s * 0.08, s * 0.08, 0, Math.PI * 2);
  c.fill();
});

registerPlaceholder('pickup/xp', 24, (c, s) => {
  diamond(c, s * 0.5, s * 0.62, '#4ea8f2', '#123a5e');
});

// --- FX ----------------------------------------------------------------------

registerPlaceholder('fx/spark', 16, (c, s) => {
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.arc(0, 0, s * 0.2, 0, Math.PI * 2);
  c.fill();
});

registerPlaceholder('fx/ring', 64, (c, s) => {
  ring(c, s * 0.4, 3, '#ffffff');
});

registerPlaceholder('fx/burst', 64, (c, s) => {
  poly(c, 8, s * 0.36, 'rgba(255,240,200,0.95)', 'rgba(255,180,80,0.9)');
});

registerPlaceholder('fx/smoke', 48, (c, s) => {
  circle(c, s * 0.3, 'rgba(150,160,175,0.55)', 'rgba(90,100,115,0.4)');
});

registerPlaceholder('fx/telegraph_circle', 128, (c, s) => {
  ring(c, s * 0.44, 4, 'rgba(226,86,77,0.9)');
});

// --- UI icons ----------------------------------------------------------------

const UI = 40;

function glyph(text: string, fill: string): (c: CanvasRenderingContext2D, s: number) => void {
  // UI icons are rasterised once at load, so fillText here costs nothing per frame.
  return (c, s): void => {
    circle(c, s * 0.42, '#1d2531', '#2b3543');
    c.fillStyle = fill;
    c.font = `700 ${Math.round(s * 0.5)}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 0, s * 0.02);
  };
}

registerPlaceholder('ui/up_damage', UI, glyph('⚔', '#e2564d'));
registerPlaceholder('ui/up_rate', UI, glyph('⚡', '#f2c14e'));
registerPlaceholder('ui/up_range', UI, glyph('◎', '#7fd4a8'));
registerPlaceholder('ui/up_hp', UI, glyph('❤', '#e2564d'));
registerPlaceholder('ui/up_regen', UI, glyph('✚', '#7fe0a0'));
registerPlaceholder('ui/up_critchance', UI, glyph('✦', '#4ea8f2'));
registerPlaceholder('ui/up_critdmg', UI, glyph('✸', '#a86ff0'));
registerPlaceholder('ui/up_pickup', UI, glyph('◈', '#f2c14e'));
registerPlaceholder('ui/card_offense', UI, glyph('⚔', '#e2564d'));
registerPlaceholder('ui/card_defense', UI, glyph('🛡', '#4ea8f2'));
registerPlaceholder('ui/card_economy', UI, glyph('🪙', '#f2c14e'));
registerPlaceholder('ui/card_utility', UI, glyph('✧', '#a86ff0'));
registerPlaceholder('ui/ability_nova', UI, glyph('◉', '#9fe8ff'));
registerPlaceholder('ui/ability_fury', UI, glyph('⚡', '#f2c14e'));
registerPlaceholder('ui/ability_bulwark', UI, glyph('🛡', '#7fd4a8'));

/** Imported for its side effects; this export exists so the import is never elided. */
export const PLACEHOLDERS_REGISTERED = true;
