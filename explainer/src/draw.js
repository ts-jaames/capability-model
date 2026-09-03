import { walkReveal, shapeLength } from "./geometry.js";

export function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Stroke a set of point-runs as a felt-tip marker line.
export function strokeRuns(ctx, runs, { color, width = 4.5 }) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const run of runs) {
    if (!run || run.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(run[0][0], run[0][1]);
    for (let i = 1; i < run.length; i++) ctx.lineTo(run[i][0], run[i][1]);
    ctx.stroke();
  }
  ctx.restore();
}

// Reveal a stroke-based shape up to `progress` (0..1). Returns the pen tip.
export function drawShapeReveal(ctx, segments, progress, style) {
  const total = shapeLength(segments);
  const revealLen = Math.max(0, Math.min(1, progress)) * total;
  const { runs, tip } = walkReveal(segments, revealLen);
  strokeRuns(ctx, runs, style);
  return tip;
}

// Write-on text: reveal left-to-right with a moving clip. Returns pen tip
// riding along the top of the letters. Handles multi-line via "\n".
export function drawTextReveal(ctx, action, progress, colors) {
  const {
    x,
    y,
    text,
    size = 40,
    accent = false,
    align = "left",
    weight = "",
    lineHeight,
  } = action;
  const color = accent ? colors.accent : colors.ink;
  const lh = lineHeight || size * 1.12;
  const lines = String(text).split("\n");
  ctx.save();
  ctx.font = `${weight} ${size}px "Patrick Hand", cursive`.trim();
  ctx.textBaseline = "alphabetic";

  const widths = lines.map((l) => ctx.measureText(l).width);
  const maxW = Math.max(...widths, 1);
  const totalW = widths.reduce((a, b) => a + b, 0) || 1;
  const revealW = progress * totalW;

  let tip = [x, y];
  let consumed = 0;
  for (let i = 0; i < lines.length; i++) {
    const w = widths[i];
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    const baseY = y + i * lh;
    const lineReveal = Math.max(0, Math.min(w, revealW - consumed));
    if (lineReveal > 0.001) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(left - 4, baseY - size, lineReveal + 2, size * 1.35);
      ctx.clip();
      ctx.fillStyle = color;
      ctx.fillText(lines[i], left, baseY);
      ctx.restore();
      tip = [left + lineReveal, baseY - size * 0.55];
    } else if (consumed >= revealW && i > 0 && revealW > 0) {
      // nothing yet on this line
    }
    consumed += w;
    if (consumed >= revealW) {
      // pen currently on this line
      const partial = Math.max(0, Math.min(w, revealW - (consumed - w)));
      tip = [left + partial, baseY - size * 0.55];
      break;
    }
  }
  ctx.restore();
  return tip;
}

// Static (fully drawn) text, no reveal — used once a word is "written".
export function drawTextStatic(ctx, action, colors) {
  return drawTextReveal(ctx, action, 1, colors);
}
