import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BEATS, CONFIG, buildTimeline } from "./src/script.js";

const ROOT = dirname(fileURLToPath(import.meta.url));

function tc(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

const { beatSpans, duration } = buildTimeline(BEATS, CONFIG);

let md = `# Explainer timing sheet\n\n`;
md += `Total runtime: **${tc(duration)}** (${duration.toFixed(1)}s) at ${CONFIG.fps} fps.\n\n`;
md += `Watch \`out/explainer-silent.mp4\` and read each beat's lines in the window below. `;
md += `The drawing is paced to these spans; speak naturally to picture.\n\n`;
md += `| # | Beat | Start | End | Length | Narration |\n`;
md += `|---|------|-------|-----|--------|-----------|\n`;
beatSpans.forEach((b, i) => {
  const len = b.end - b.start;
  const line = b.narration.replace(/\|/g, "\\|");
  md += `| ${i + 1} | ${b.title} | ${tc(b.start)} | ${tc(b.end)} | ${len.toFixed(1)}s | ${line} |\n`;
});
md += `\n## Full narration by beat\n\n`;
beatSpans.forEach((b, i) => {
  md += `### ${i + 1}. ${b.title}  (${tc(b.start)}–${tc(b.end)})\n\n${b.narration}\n\n`;
});

await mkdir(join(ROOT, "out"), { recursive: true });
await writeFile(join(ROOT, "out", "timing.md"), md);
console.log("Wrote out/timing.md — total", tc(duration));
