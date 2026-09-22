// The 38-swatch palette: 7 hues in 5 shades from full to light, plus
// white, gray and black.

export const PALETTE = [
  { hue: 'Red', shades: ['#E5484D', '#EC767A', '#F19A9D', '#F6BFC1', '#FBE0E1'] },
  { hue: 'Orange', shades: ['#F0782A', '#F49A5F', '#F7B58A', '#FAD0B4', '#FCE8DB'] },
  { hue: 'Yellow', shades: ['#F2BE1F', '#F5CE57', '#F8DB84', '#FAE8B1', '#FDF4D9'] },
  { hue: 'Green', shades: ['#2E9E5B', '#62B684', '#8CCAA5', '#B6DDC6', '#DBEFE3'] },
  { hue: 'Blue', shades: ['#2F7FE0', '#639FE8', '#8DB9EE', '#B6D2F4', '#DCE9FA'] },
  { hue: 'Indigo', shades: ['#4F46D8', '#7B74E2', '#9E99EA', '#C1BEF1', '#E1E0F8'] },
  { hue: 'Purple', shades: ['#9046C8', '#AC74D6', '#C299E1', '#D8BEEC', '#ECE0F6'] }
];

export const NEUTRALS = [
  { name: 'White', color: '#FFFFFF' },
  { name: 'Gray', color: '#8E8D88' },
  { name: 'Black', color: '#1D1D1F' }
];

const NEUTRAL_TINT = '#F1EFEA';

// The light background used behind a category's name.
export function tintFor(color) {
  for (const row of PALETTE) {
    if (row.shades.includes(color)) return row.shades[4];
  }
  return NEUTRAL_TINT;
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// Light colors get a dark check mark instead of a white one.
export function isLight(hex) {
  return luminance(hex) > 0.72;
}

// Very light colors need a thin outline to show up on white.
export function needsOutline(hex) {
  return luminance(hex) > 0.86;
}

// Screen reader name for a swatch, such as "Green, shade 1 of 5".
export function colorLabel(hex) {
  for (const row of PALETTE) {
    const i = row.shades.indexOf(hex);
    if (i !== -1) return `${row.hue}, shade ${i + 1} of 5`;
  }
  const neutral = NEUTRALS.find((n) => n.color === hex);
  return neutral ? neutral.name : hex;
}

// A new category gets the first full-strength hue not already in use.
export function nextColor(used) {
  const bases = PALETTE.map((row) => row.shades[0]);
  return bases.find((c) => !used.includes(c)) || bases[used.length % bases.length];
}
