# Capability explainer — whiteboard hand-draw video

An isolated, reproducible pipeline that renders the ~4-minute "name the work"
explainer as a hand-drawn whiteboard video: rough, self-drawing marker strokes
(Excalidraw/RoughJS look) with a top-down hand that follows the pen. It renders
**silent** at the scripted pace so you record your own voiceover to picture.

This project is deliberately self-contained. It has its own `package.json` and
does **not** touch the capability-model SSOT tooling (`schema/`, root
`package.json`, `scripts/validate.mjs`, `scripts/build-site.mjs`).

## How it works

- `src/script.js` — the whole video as data: 8 beats + close, each a list of
  drawing actions (in stroke order) with a `draw` time, plus the narration text
  and a per-beat `targetSec` so each beat lasts as long as its line takes to say.
- `src/geometry.js` — deterministic "wobbly" primitives (box, line, arrow,
  ellipse, stick figure, check) built from seeded jitter, so the sketch looks
  hand-drawn but never jitters between frames.
- `src/draw.js` — reveals each stroke progressively and writes text on
  left-to-right; returns the current pen tip.
- `src/scene.js` — composes everything, places the hand PNG at the pen tip, and
  exposes `window.Explainer.renderFrame(ctx, t)`.
- `render.mjs` — drives headless Chrome (Playwright) frame by frame at a fixed
  clock (fully deterministic), screenshots each frame, and encodes with ffmpeg.
- `timing.mjs` — writes `out/timing.md`, the per-beat timecodes + lines.

The stack is permissively licensed (roughjs MIT, perfect-freehand MIT, esbuild
MIT, Playwright Apache-2.0). Remotion was avoided on purpose: it needs a paid
company licence for commercial use.

## Setup

```bash
cd explainer
npm install
# Uses system Chrome at /usr/local/bin/google-chrome (override with CHROME_PATH).
```

## Build & render

```bash
npm run bundle    # esbuild -> dist/scene.bundle.js  (run after editing src/)
npm run timing    # writes out/timing.md and prints total runtime

npm run draft     # fast 640x360 proof (captions on) -> out/explainer-draft.mp4
npm run render -- --guide   # 1280x720 with beat captions + subtitles -> out/explainer-guide.mp4
npm run render              # 1920x1080 clean master (no captions) -> out/explainer-silent.mp4

# Render just one beat while iterating:
node render.mjs --draft --beat=beat5
```

Outputs land in `out/`. `explainer-silent.mp4` is the clean master you publish;
`explainer-guide.mp4` is the same timing with on-screen beat labels + subtitles
to watch while you record.

## Recording your voiceover

1. Open `out/timing.md` — it lists each beat's start/end timecode and the exact
   lines. Talk, don't read: get the beat in your head, then say it.
2. Play `out/explainer-guide.mp4` and record your voice to picture (any recorder,
   e.g. QuickTime, Audacity, or your editor). The drawing is paced to the timing
   sheet, so speak naturally and you'll land each beat.
3. Mux your recording onto the clean master with ffmpeg:

```bash
ffmpeg -i out/explainer-silent.mp4 -i my-voice.wav \
  -c:v copy -c:a aac -shortest out/explainer-final.mp4
```

If your take drifts from the pace, tune the numbers in `src/script.js`:
each beat's `targetSec` sets how long it holds, and each action's `draw` sets how
long that stroke takes. Re-run `npm run bundle && npm run timing`, re-render, and
re-record. Same input always produces the same video.

## Tuning the look

- Colours (marker ink, the single accent, paper) live in `CONFIG.colors` in
  `src/script.js`. The accent is used only for payoff words (THE WORK, FRAMING,
  the check).
- The hand asset is `assets/hand.png` (generated, background removed to
  transparent). If you swap it, update the `HAND` tip offset/scale in
  `src/scene.js` so the marker tip lands on the stroke.

## Assets & licences

- `assets/PatrickHand-Regular.ttf` — Patrick Hand, SIL Open Font License
  (see `assets/OFL.txt`).
- `assets/hand.png` — generated illustration, background keyed to transparent;
  free to use for this project.
