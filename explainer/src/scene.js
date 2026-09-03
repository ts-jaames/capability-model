import { wRect, wLine, wArrow, wEllipse, wStick, wCheck } from "./geometry.js";
import { drawShapeReveal, drawTextReveal } from "./draw.js";
import { CONFIG, BEATS, buildTimeline } from "./script.js";

const { flat, beatSpans, duration } = buildTimeline(BEATS, CONFIG);

// Pen-tip location inside hand.png (in image pixels) and on-canvas scale.
// Tuned so the marker tip sits exactly on the stroke being drawn.
const HAND = { tipX: 288, tipY: 168, scale: 0.5, srcW: 1024, srcH: 1024 };

function segmentsFor(a) {
  switch (a.type) {
    case "box":
      return wRect(a.x, a.y, a.w, a.h, a.seed);
    case "line":
      return wLine([a.x1, a.y1], [a.x2, a.y2], a.seed, { amp: 1.3, bow: 1.4 });
    case "arrow":
      return wArrow([a.x1, a.y1], [a.x2, a.y2], a.seed, { amp: 1.2, bow: 1.4 });
    case "ellipse":
      return wEllipse(a.cx, a.cy, a.rx, a.ry, a.seed, { sweep: a.sweep ?? 1.12 });
    case "stick":
      return wStick(a.x, a.y, a.scale, a.seed);
    case "check":
      return wCheck(a.x, a.y, a.size, a.seed);
    default:
      return null;
  }
}

// Cache geometry so it is generated once, not per frame.
const geomCache = new Map();
function getSegments(a) {
  if (!geomCache.has(a)) geomCache.set(a, segmentsFor(a));
  return geomCache.get(a);
}

let handImg = null;
let showCaptions = true;

function wrapText(ctx, str, maxW) {
  const words = str.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function currentBeat(t) {
  let b = beatSpans[0];
  for (const span of beatSpans) if (span.start <= t) b = span;
  return b;
}

function drawCaptions(ctx, t) {
  const beat = currentBeat(t);
  const idx = beatSpans.indexOf(beat) + 1;
  ctx.save();
  // Top-left beat tag
  ctx.font = "500 26px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = CONFIG.colors.caption;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`${idx}/${beatSpans.length}  ${beat.title}`, 40, 52);
  // Bottom subtitle band
  ctx.font = "400 30px ui-sans-serif, system-ui, sans-serif";
  const lines = wrapText(ctx, beat.narration, CONFIG.width - 240);
  const lineH = 40;
  const bandH = lines.length * lineH + 40;
  const bandY = CONFIG.height - bandH;
  ctx.fillStyle = "rgba(247,245,239,0.85)";
  ctx.fillRect(0, bandY, CONFIG.width, bandH);
  ctx.fillStyle = "#6b7480";
  lines.forEach((l, i) => {
    const w = ctx.measureText(l).width;
    ctx.fillText(l, (CONFIG.width - w) / 2, bandY + 34 + i * lineH);
  });
  ctx.restore();
}

function drawHand(ctx, tip) {
  if (!handImg) return;
  const w = HAND.srcW * HAND.scale;
  const h = HAND.srcH * HAND.scale;
  const dx = tip[0] - HAND.tipX * HAND.scale;
  const dy = tip[1] - HAND.tipY * HAND.scale;
  ctx.drawImage(handImg, dx, dy, w, h);
}

export function renderFrame(ctx, t) {
  ctx.fillStyle = CONFIG.colors.paper;
  ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);

  const beat = currentBeat(t);
  const era = beat ? beatSpans.indexOf(beat) : 0;
  // Map beat index -> era id by recomputing from flat (era stored on actions).
  // Find the era active at t using the flat actions of the current beat.
  let activeEra = 0;
  for (const a of flat) if (a.start <= t) activeEra = a.era;

  let handTip = null;
  for (const a of flat) {
    if (a.type === "hold") continue;
    if (a.era !== activeEra) continue;
    if (a.start > t) continue;
    const denom = Math.max(1e-6, a.end - a.start);
    const progress = t >= a.end ? 1 : (t - a.start) / denom;
    const drawing = progress < 1;
    let tip;
    if (a.type === "text") {
      tip = drawTextReveal(ctx, a, progress, CONFIG.colors);
    } else {
      const segs = getSegments(a);
      const color = a.accent ? CONFIG.colors.accent : CONFIG.colors.ink;
      const width = a.width || (a.type === "text" ? 4.5 : a.type === "check" ? 8 : 4.6);
      tip = drawShapeReveal(ctx, segs, progress, { color, width });
    }
    if (drawing && tip) handTip = tip;
  }

  if (handTip) drawHand(ctx, handTip);
  if (showCaptions) drawCaptions(ctx, t);
}

async function ready() {
  try {
    await document.fonts.load('40px "Patrick Hand"');
    await document.fonts.ready;
  } catch (e) {}
  await new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      handImg = img;
      res();
    };
    img.onerror = () => res();
    img.src = "assets/hand.png";
  });
  return true;
}

export const Explainer = {
  CONFIG,
  duration,
  beatSpans,
  renderFrame,
  ready,
  setCaptions(v) {
    showCaptions = v;
  },
  setHandTuning(t) {
    Object.assign(HAND, t);
  },
};

if (typeof window !== "undefined") window.Explainer = Explainer;
