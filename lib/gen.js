'use strict';

/**
 * Fort Gen 1 I (image) and Fort Gen 1 V (video) generators.
 *
 * Both are procedural: the prompt is hashed into a deterministic RNG seed,
 * keywords steer the palette and composition, and the result is rendered as
 * SVG (Fort Gen 1 V uses SMIL animation, so the "video" plays in any
 * browser). No external services, no dependencies - generation is honest
 * about being synthetic art, and every output is watermarked as generated.
 */

const { seededRng } = require('./model');

const PALETTES = {
  default: ['#22283a', '#5561d6', '#7fd1e8', '#e8ecf7', '#f2b544'],
  sunset:  ['#2b1631', '#83266b', '#e0533d', '#f2913d', '#f7cf5c'],
  ocean:   ['#04263b', '#0b5e8a', '#15a3c7', '#7fe0dc', '#eafaf7'],
  forest:  ['#12210f', '#2c5424', '#5c8a3c', '#a3c26a', '#e9edcd'],
  fire:    ['#1e0902', '#7a1704', '#cf3b0b', '#f2801f', '#fcd050'],
  night:   ['#050716', '#1a1f4d', '#3b3f8c', '#8087d9', '#d9dcff'],
  candy:   ['#3d1030', '#a12a7a', '#e05fae', '#f79ad3', '#ffe3f3'],
  desert:  ['#33210d', '#8a5a24', '#cf9a4f', '#ecc98c', '#faefd7'],
};

const PALETTE_HINTS = [
  [/sunset|dawn|dusk|autumn|warm/, 'sunset'],
  [/ocean|sea|water|wave|lake|river|rain/, 'ocean'],
  [/forest|tree|jungle|nature|grass|spring/, 'forest'],
  [/fire|lava|volcano|dragon|hot/, 'fire'],
  [/night|space|star|galaxy|moon|dark/, 'night'],
  [/candy|pink|dream|magic|neon/, 'candy'],
  [/desert|sand|dune|gold/, 'desert'],
];

function pickPalette(prompt) {
  const p = prompt.toLowerCase();
  for (const [re, name] of PALETTE_HINTS) if (re.test(p)) return { name, colors: PALETTES[name] };
  return { name: 'default', colors: PALETTES.default };
}

function esc(s) {
  return String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

function shapes(rng, colors, { animate = false, dur = 6 } = {}) {
  const parts = [];
  const count = 10 + Math.floor(rng() * 8);
  for (let i = 0; i < count; i++) {
    const cx = Math.floor(rng() * 640);
    const cy = Math.floor(rng() * 400);
    const r = 12 + Math.floor(rng() * 90);
    const color = colors[1 + Math.floor(rng() * (colors.length - 1))];
    const opacity = (0.25 + rng() * 0.55).toFixed(2);
    const kind = rng();
    let anim = '';
    if (animate) {
      const dx = Math.floor((rng() - 0.5) * 220);
      const dy = Math.floor((rng() - 0.5) * 160);
      const d = (dur * (0.6 + rng() * 0.8)).toFixed(1);
      anim =
        `<animateTransform attributeName="transform" type="translate" ` +
        `values="0 0; ${dx} ${dy}; 0 0" dur="${d}s" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="${opacity};${(opacity * 0.3).toFixed(2)};${opacity}" ` +
        `dur="${(dur * (0.5 + rng())).toFixed(1)}s" repeatCount="indefinite"/>`;
    }
    if (kind < 0.45) {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${opacity}">${anim}</circle>`);
    } else if (kind < 0.75) {
      const rot = Math.floor(rng() * 90);
      parts.push(
        `<rect x="${cx - r}" y="${cy - r / 2}" width="${r * 2}" height="${r}" rx="${Math.floor(r / 4)}" ` +
        `fill="${color}" opacity="${opacity}" transform="rotate(${rot} ${cx} ${cy})">${anim}</rect>`
      );
    } else {
      const x2 = cx + Math.floor((rng() - 0.5) * 2 * r * 2);
      const y2 = cy + Math.floor(rng() * r * 2);
      parts.push(
        `<polygon points="${cx},${cy - r} ${x2},${y2} ${cx - r},${cy + r}" ` +
        `fill="${color}" opacity="${opacity}">${anim}</polygon>`
      );
    }
  }
  return parts.join('\n    ');
}

function svgDoc(prompt, body, colors, { width = 640, height = 400, badge }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${colors[0]}"/>
      <stop offset="1" stop-color="${colors[1]}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <g>
    ${body}
  </g>
  <text x="12" y="${height - 12}" font-family="monospace" font-size="11" fill="${colors[colors.length - 1]}" opacity="0.85">${esc(badge)} · "${esc(prompt.slice(0, 60))}" · AI-generated</text>
</svg>`;
}

function generateImage(prompt, { seed } = {}) {
  const rng = seededRng('img:' + (seed ?? prompt));
  const { name, colors } = pickPalette(prompt);
  const svg = svgDoc(prompt, shapes(rng, colors), colors, { badge: 'Fort Gen 1 I' });
  return { svg, palette: name, format: 'svg', width: 640, height: 400 };
}

function generateVideo(prompt, { seed, duration = 6 } = {}) {
  const dur = Math.min(Math.max(Number(duration) || 6, 2), 30);
  const rng = seededRng('vid:' + (seed ?? prompt));
  const { name, colors } = pickPalette(prompt);
  const svg = svgDoc(prompt, shapes(rng, colors, { animate: true, dur }), colors, { badge: 'Fort Gen 1 V' });
  return { svg, palette: name, format: 'svg+smil', durationSeconds: dur, width: 640, height: 400 };
}

module.exports = { generateImage, generateVideo };
