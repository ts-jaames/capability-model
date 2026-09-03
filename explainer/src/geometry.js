import { mulberry32 } from "./rng.js";

// A "shape" is an ordered array of segments. A segment is a polyline:
// an array of [x, y] points. Drawing reveals segments in order, so the
// segment order defines the stroke order a hand would follow.

export function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return total;
}

export function shapeLength(segments) {
  let total = 0;
  for (const seg of segments) total += polylineLength(seg);
  return total;
}

// Resample a straight span into n points with per-point perpendicular noise
// plus a gentle low-frequency bow, so lines look hand-drawn, not ruler-straight.
function wobbleSpan(a, b, seed, { amp = 1.6, bow = 2.2, step = 6 } = {}) {
  const r = mulberry32(seed);
  const len = dist(a, b);
  const n = Math.max(2, Math.round(len / step));
  const dx = (b[0] - a[0]) / n;
  const dy = (b[1] - a[1]) / n;
  // Unit normal
  const nl = Math.max(1e-6, len);
  const nx = -(b[1] - a[1]) / nl;
  const ny = (b[0] - a[0]) / nl;
  const bowSign = r() > 0.5 ? 1 : -1;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const tt = i / n;
    const bowOff = Math.sin(tt * Math.PI) * bow * bowSign;
    const jitter = (r() * 2 - 1) * amp;
    const off = bowOff + jitter;
    pts.push([a[0] + dx * i + nx * off, a[1] + dy * i + ny * off]);
  }
  return pts;
}

export function wLine(a, b, seed, opts) {
  return [wobbleSpan(a, b, seed, opts)];
}

// A rough rectangle drawn as one continuous 4-side path with slight corner
// overshoot, Excalidraw-style. Returns 4 segments in draw order.
export function wRect(x, y, w, h, seed, opts = {}) {
  const o = 3; // corner overshoot
  const tl = [x - o, y];
  const tr = [x + w + o, y];
  const tr2 = [x + w, y - o];
  const br = [x + w, y + h + o];
  const br2 = [x + w + o, y + h];
  const bl = [x - o, y + h];
  const bl2 = [x, y + h + o];
  const tl2 = [x, y - o];
  return [
    wobbleSpan(tl, tr, seed + 1, opts),
    wobbleSpan(tr2, br, seed + 2, opts),
    wobbleSpan(br2, bl, seed + 3, opts),
    wobbleSpan(bl2, tl2, seed + 4, opts),
  ];
}

// Rough circle/ellipse as a single open-ish loop that slightly overshoots,
// the way a hand closes a circle.
export function wEllipse(cx, cy, rx, ry, seed, { amp = 1.8, step = 7, sweep = 1.12 } = {}) {
  const r = mulberry32(seed);
  const circ = Math.PI * (rx + ry);
  const n = Math.max(16, Math.round((circ * sweep) / step));
  const start = -Math.PI / 2 + (r() * 2 - 1) * 0.2;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const ang = start + (i / n) * (Math.PI * 2 * sweep);
    const rr = 1 + (r() * 2 - 1) * (amp / Math.max(rx, ry));
    pts.push([cx + Math.cos(ang) * rx * rr, cy + Math.sin(ang) * ry * rr]);
  }
  return [pts];
}

// Arrow: a wobbly shaft plus two short head strokes at the tip.
export function wArrow(a, b, seed, opts = {}) {
  const shaft = wobbleSpan(a, b, seed, opts);
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const head = 16;
  const spread = 0.42;
  const h1 = [b[0] - Math.cos(ang - spread) * head, b[1] - Math.sin(ang - spread) * head];
  const h2 = [b[0] - Math.cos(ang + spread) * head, b[1] - Math.sin(ang + spread) * head];
  return [shaft, wobbleSpan(b, h1, seed + 7, { ...opts, bow: 0.6 }), wobbleSpan(b, h2, seed + 9, { ...opts, bow: 0.6 })];
}

// A checkmark.
export function wCheck(x, y, size, seed, opts = {}) {
  const a = [x, y + size * 0.45];
  const b = [x + size * 0.38, y + size * 0.9];
  const c = [x + size, y];
  return [wobbleSpan(a, b, seed + 1, { ...opts, bow: 0.6 }), wobbleSpan(b, c, seed + 2, { ...opts, bow: 1.0 })];
}

// A stick figure: head, body, two arms, two legs (in draw order).
export function wStick(x, y, scale, seed) {
  const s = scale;
  const headR = 12 * s;
  const headCy = y + headR;
  const neck = [x, y + headR * 2];
  const hip = [x, y + headR * 2 + 34 * s];
  const shoulder = [x, y + headR * 2 + 8 * s];
  const segs = [];
  segs.push(...wEllipse(x, headCy, headR, headR, seed + 1, { amp: 1.2, step: 5 }));
  segs.push(wobbleSpan(neck, hip, seed + 2, { amp: 1.2, bow: 1.2 }));
  segs.push(wobbleSpan(shoulder, [x - 16 * s, y + headR * 2 + 26 * s], seed + 3, { amp: 1, bow: 1 }));
  segs.push(wobbleSpan(shoulder, [x + 16 * s, y + headR * 2 + 26 * s], seed + 4, { amp: 1, bow: 1 }));
  segs.push(wobbleSpan(hip, [x - 14 * s, hip[1] + 30 * s], seed + 5, { amp: 1, bow: 1.2 }));
  segs.push(wobbleSpan(hip, [x + 14 * s, hip[1] + 30 * s], seed + 6, { amp: 1, bow: 1.2 }));
  return segs;
}

// Walk revealed length along a shape's segments, returning the tip point at
// `revealLen` and the list of point-runs to stroke up to that length.
export function walkReveal(segments, revealLen) {
  const runs = [];
  let remaining = revealLen;
  let tip = segments[0] ? segments[0][0] : [0, 0];
  for (const seg of segments) {
    if (remaining <= 0) break;
    const segLen = polylineLength(seg);
    if (remaining >= segLen) {
      runs.push(seg);
      tip = seg[seg.length - 1];
      remaining -= segLen;
      continue;
    }
    // Partial segment
    const run = [seg[0]];
    let acc = 0;
    for (let i = 1; i < seg.length; i++) {
      const d = dist(seg[i - 1], seg[i]);
      if (acc + d >= remaining) {
        const f = (remaining - acc) / d;
        const px = seg[i - 1][0] + (seg[i][0] - seg[i - 1][0]) * f;
        const py = seg[i - 1][1] + (seg[i][1] - seg[i - 1][1]) * f;
        run.push([px, py]);
        tip = [px, py];
        break;
      }
      run.push(seg[i]);
      acc += d;
    }
    runs.push(run);
    remaining = 0;
    break;
  }
  return { runs, tip };
}
