import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { mkdir, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const DRAFT = args.includes("--draft");
const GUIDE = args.includes("--guide");

// Captions/subtitles: on for draft + guide, off for the clean master.
// Overridable with --captions / --no-captions.
let captions = DRAFT || GUIDE;
if (args.includes("--captions")) captions = true;
if (args.includes("--no-captions")) captions = false;

// Optional: --beat=beat5 renders only that beat's time span (for quick tests).
const beatArg = args.find((a) => a.startsWith("--beat="));
const onlyBeat = beatArg ? beatArg.split("=")[1] : null;

const CHROME = process.env.CHROME_PATH || "/usr/local/bin/google-chrome";

function run(cmd, cmdArgs) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, cmdArgs, { stdio: "inherit" });
    p.on("close", (code) => (code === 0 ? res() : rej(new Error(`${cmd} exited ${code}`))));
  });
}

async function main() {
  const fps = 30;
  // draft = 960x540, guide = 1280x720, master = 1920x1080
  const scale = DRAFT ? 0.5 : GUIDE ? 2 / 3 : 1;
  const width = Math.round(1920 * scale);
  const height = Math.round(1080 * scale);

  const framesDir = join(ROOT, "frames");
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });
  await mkdir(join(ROOT, "out"), { recursive: true });

  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--force-color-profile=srgb"] });
  const page = await browser.newPage({ viewport: { width: Math.max(width, 640), height: Math.max(height, 360) }, deviceScaleFactor: 1 });
  page.on("console", (m) => m.type() === "error" && console.log("PAGE ERROR:", m.text()));
  page.on("pageerror", (e) => console.log("PAGE EXCEPTION:", e.message));

  await page.goto(pathToFileURL(join(ROOT, "render.html")).href);
  await page.waitForFunction(() => window.Explainer && window.Explainer.ready);
  await page.evaluate(() => window.Explainer.ready());
  await page.evaluate((c) => window.Explainer.setCaptions(c), captions);
  // Resize the canvas and pre-scale the context so frames are captured at the
  // target resolution (element screenshots use the canvas's intrinsic size).
  await page.evaluate((s) => {
    const c = document.getElementById("board");
    c.width = Math.round(1920 * s);
    c.height = Math.round(1080 * s);
    const ctx = c.getContext("2d");
    ctx.setTransform(s, 0, 0, s, 0, 0);
    window.__ctx = ctx;
  }, scale);

  const info = await page.evaluate(() => ({
    duration: window.Explainer.duration,
    beats: window.Explainer.beatSpans,
  }));

  let tStart = 0;
  let tEnd = info.duration;
  if (onlyBeat) {
    const b = info.beats.find((x) => x.id === onlyBeat);
    if (b) {
      tStart = b.start;
      tEnd = b.end + 0.3;
    }
  }

  const totalFrames = Math.ceil((tEnd - tStart) * fps);
  console.log(`Rendering ${totalFrames} frames @ ${width}x${height} (${DRAFT ? "draft" : "full"}), duration ${(tEnd - tStart).toFixed(1)}s`);

  const board = page.locator("#board");
  const t0 = Date.now();
  for (let i = 0; i < totalFrames; i++) {
    const t = tStart + i / fps;
    await page.evaluate((tt) => window.__renderAt(tt), t);
    const n = String(i).padStart(5, "0");
    await board.screenshot({ path: join(framesDir, `frame_${n}.png`) });
    if (i % 60 === 0) {
      const pct = ((i / totalFrames) * 100).toFixed(0);
      const el = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`  frame ${i}/${totalFrames} (${pct}%) ${el}s`);
    }
  }
  await browser.close();

  const outName = onlyBeat
    ? `beat-${onlyBeat}${DRAFT ? "-draft" : ""}.mp4`
    : DRAFT
      ? "explainer-draft.mp4"
      : GUIDE
        ? "explainer-guide.mp4"
        : "explainer-silent.mp4";
  const outPath = join(ROOT, "out", outName);
  console.log("Encoding", outPath);
  await run("ffmpeg", [
    "-y",
    "-framerate",
    String(fps),
    "-i",
    join(framesDir, "frame_%05d.png"),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    DRAFT ? "24" : "18",
    "-movflags",
    "+faststart",
    outPath,
  ]);
  console.log("Done:", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
