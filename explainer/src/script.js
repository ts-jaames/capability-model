// The explainer script as data: 8 beats + close. Each beat lists drawing
// actions in stroke order with a `draw` time (seconds) or a `hold`. Absolute
// timings are computed by buildTimeline(). Narration is the spoken text — it
// drives the subtitle guide track and the timing sheet, and is NOT auto-voiced.

export const CONFIG = {
  fps: 30,
  width: 1920,
  height: 1080,
  gap: 0.18, // hand-travel pause inserted between consecutive strokes
  colors: {
    paper: "#f7f5ef",
    ink: "#26313b",
    accent: "#e4572e",
    caption: "#9aa3ab",
  },
};

// Convenience builders keep the beat data readable.
const box = (x, y, w, h, draw = 1.1) => ({ type: "box", x, y, w, h, draw });
const line = (x1, y1, x2, y2, draw = 0.7, width) => ({ type: "line", x1, y1, x2, y2, draw, width });
const arrow = (x1, y1, x2, y2, draw = 1.0, width) => ({ type: "arrow", x1, y1, x2, y2, draw, width });
const ellipse = (cx, cy, rx, ry, draw = 1.4, sweep) => ({ type: "ellipse", cx, cy, rx, ry, draw, sweep });
const stick = (x, y, scale, draw = 1.6) => ({ type: "stick", x, y, scale, draw });
const check = (x, y, size, draw = 1.0, accent = true) => ({ type: "check", x, y, size, draw, accent });
const text = (x, y, str, size, opts = {}) => ({ type: "text", x, y, text: str, size, draw: opts.draw ?? Math.max(0.8, str.length * 0.09), ...opts });
const hold = (dur) => ({ type: "hold", dur });

const W = CONFIG.width;
const CX = W / 2;

export const BEATS = [
  {
    id: "beat1",
    title: "The old way",
    targetSec: 32,
    clearBefore: true,
    narration:
      "Here's how consulting has always worked. A strategist, a designer, a PM, an engineer. Everybody owns a lane. When a client buys us, they're buying a team of titles \u2014 four people, four boxes. Two problems: the work that matters falls between the boxes, and nobody owns it. And a title doesn't tell you what someone can actually do.",
    actions: [
      box(300, 300, 300, 300, 1.2),
      stick(450, 360, 2.2, 1.5),
      text(450, 660, "Strategist", 34, { align: "center", draw: 1.0 }),
      box(660, 300, 300, 300, 1.2),
      stick(810, 360, 2.2, 1.5),
      text(810, 660, "Designer", 34, { align: "center", draw: 1.0 }),
      box(1020, 300, 300, 300, 1.2),
      stick(1170, 360, 2.2, 1.5),
      text(1170, 660, "PM", 34, { align: "center", draw: 0.7 }),
      box(1380, 300, 300, 300, 1.2),
      stick(1530, 360, 2.2, 1.5),
      text(1530, 660, "Engineer", 34, { align: "center", draw: 1.0 }),
      hold(1.2),
      text(CX + 30, 480, "?", 120, { align: "center", draw: 0.8 }),
      hold(2.5),
    ],
  },
  {
    id: "beat2",
    title: "The flip",
    targetSec: 18,
    clearBefore: false,
    narration:
      "So we flipped it. We stopped starting with who people are. We start with the work itself \u2014 the actual things we deliver for a client. Name the work first. People come second.",
    actions: [
      line(300, 300, 1680, 600, 1.4, 9),
      line(1680, 300, 300, 600, 1.4, 9),
      hold(0.6),
      text(CX, 820, "THE WORK", 130, { align: "center", accent: true, draw: 2.4 }),
      hold(2.4),
    ],
  },
  {
    id: "beat3",
    title: "The spine",
    targetSec: 34,
    clearBefore: true,
    narration:
      "The work is organized in three layers. Domains \u2014 big types of work: framing a problem, building the thing, proving it's true. Those never change. Inside each domain, capabilities \u2014 the specific things we promise. And every capability can be done at three levels. L1, you follow the guardrails. L2, you run it on your own. L3, you set the standard everyone else follows.",
    actions: [
      box(810, 120, 300, 92, 1.0),
      text(CX, 182, "Domains", 52, { align: "center", draw: 1.0 }),
      line(900, 212, 520, 320, 0.6),
      line(960, 212, 960, 320, 0.5),
      line(1020, 212, 1400, 320, 0.6),
      text(520, 360, "Framing", 40, { align: "center", draw: 0.9 }),
      text(960, 360, "Building", 40, { align: "center", draw: 0.9 }),
      text(1400, 360, "Proof", 40, { align: "center", draw: 0.7 }),
      line(960, 388, 960, 452, 0.5),
      text(960, 496, "Capabilities", 46, { align: "center", draw: 1.1 }),
      line(960, 520, 960, 580, 0.5),
      // mini ladder
      line(900, 590, 900, 770, 0.6),
      line(1010, 590, 1010, 770, 0.6),
      line(900, 630, 1010, 630, 0.4),
      text(1050, 645, "L1 guided", 34, { draw: 0.9 }),
      line(900, 690, 1010, 690, 0.4),
      text(1050, 705, "L2 solo", 34, { draw: 0.8 }),
      line(900, 750, 1010, 750, 0.4),
      text(1050, 765, "L3 sets the bar", 34, { draw: 1.2 }),
      hold(2.5),
    ],
  },
  {
    id: "beat4",
    title: "Confidence, not calendar",
    targetSec: 20,
    clearBefore: true,
    narration:
      "And here's what makes it ours. We don't scale work because a date arrived. We scale it because the evidence says we've earned it. Confidence drives commitment \u2014 not the calendar. That's the whole game.",
    actions: [
      text(CX, 250, "CONFIDENCE, not calendar", 64, { align: "center", draw: 2.2 }),
      ellipse(CX, 560, 160, 160, 1.8),
      line(CX, 560, CX - 110, 640, 0.7), // needle low-left
      arrow(CX - 150, 470, CX + 190, 470, 1.4), // sweep toward commit
      text(CX + 210, 485, "commit", 40, { draw: 1.0 }),
      hold(2.6),
    ],
  },
  {
    id: "beat5",
    title: "So where do I go?",
    targetSec: 42,
    clearBefore: true,
    narration:
      "Now the real question everyone asks. I'm a product strategist. I'm a BA. Where does what I do go in all this? Here's the answer, and it's good news. What you do \u2014 framing the problem, separating the real need from the ask \u2014 that's not a lane that got erased. It's a capability. It's called Framing. And it's one of the most important things we sell. Your work didn't disappear. It got a name. And now you can own it.",
    actions: [
      stick(520, 430, 2.7, 1.8),
      text(520, 760, "Strategist / BA", 40, { align: "center", draw: 1.4 }),
      hold(1.0),
      arrow(660, 520, 1080, 520, 2.2, 10),
      box(1120, 430, 400, 180, 1.4),
      text(1320, 545, "FRAMING", 72, { align: "center", accent: true, draw: 2.2 }),
      hold(4.5),
    ],
  },
  {
    id: "beat6",
    title: "The three layers of you",
    targetSec: 31,
    clearBefore: true,
    narration:
      "You get three things now, not one. A title clients recognize. A capability you own \u2014 that's your real identity, and where you grow. And a seat on each project that flexes to what that project needs. Your title used to be the whole story. Now it's just the label on the outside. The thing that's really you is the capability you own.",
    actions: [
      stick(360, 360, 2.4, 1.7),
      text(360, 620, "You", 40, { align: "center", draw: 0.8 }),
      arrow(500, 380, 620, 330, 0.9),
      text(660, 340, "Title", 52, { draw: 1.0 }),
      text(660, 384, "what clients buy", 30, { draw: 1.2 }),
      arrow(500, 430, 620, 470, 0.9),
      text(660, 480, "Ownership", 52, { draw: 1.4 }),
      text(660, 524, "yours, permanent \u2014 where you grow", 30, { draw: 1.8 }),
      arrow(500, 500, 620, 610, 0.9),
      text(660, 620, "Seat", 52, { draw: 0.9 }),
      text(660, 664, "what you do on this project \u2014 changes", 30, { draw: 1.9 }),
      hold(3.0),
    ],
  },
  {
    id: "beat7",
    title: "The growth path",
    targetSec: 26,
    clearBefore: true,
    narration:
      "And because we've written down how each capability is done \u2014 the templates, the guardrails, the tools \u2014 you can pick up a second one. That's the growth path. You're not boxed in by a title anymore. You get deeper, or you get broader. Your call.",
    actions: [
      stick(360, 300, 2.4, 1.7),
      text(360, 560, "You", 40, { align: "center", draw: 0.8 }),
      box(760, 250, 320, 130, 1.1),
      text(920, 330, "Framing", 44, { align: "center", draw: 1.0 }),
      arrow(500, 320, 760, 315, 1.0),
      hold(0.8),
      box(760, 470, 320, 130, 1.1),
      text(920, 550, "+ Interface", 44, { align: "center", draw: 1.3 }),
      arrow(500, 380, 760, 535, 1.2),
      box(760, 680, 320, 130, 1.1),
      text(920, 760, "+ AI", 44, { align: "center", draw: 0.9 }),
      arrow(500, 430, 760, 745, 1.3),
      hold(2.2),
    ],
  },
  {
    id: "close",
    title: "The one line",
    targetSec: 28,
    clearBefore: true,
    narration:
      "So \u2014 bottom line. We stopped selling titles and started naming the work. Nobody's job shrank. What you're good at just became a thing you can own, be recognized for, and build on. Nothing you do disappeared. We finally wrote down where it lives.",
    actions: [
      text(CX, 500, "THE WORK", 130, { align: "center", accent: true, draw: 2.4 }),
      ellipse(CX, 470, 380, 130, 2.0),
      line(600, 600, 1320, 600, 0.9),
      line(610, 628, 1310, 628, 0.9),
      hold(0.6),
      check(1380, 430, 96, 1.1, true),
      hold(4.0),
    ],
  },
];

export function buildTimeline(beats = BEATS, cfg = CONFIG) {
  const flat = [];
  let cursor = 0;
  let era = -1;
  const beatSpans = [];
  for (const beat of beats) {
    if (beat.clearBefore) {
      era += 1;
      if (flat.length) cursor += 0.35; // brief wipe pause
    }
    const beatStart = cursor;
    let seed = flat.length * 101 + 17;
    for (const action of beat.actions) {
      seed += 13;
      if (action.type === "hold") {
        flat.push({ ...action, era, start: cursor, end: cursor + action.dur, seed });
        cursor += action.dur;
        continue;
      }
      const start = cursor;
      const end = start + action.draw;
      flat.push({ ...action, era, start, end, seed });
      cursor = end + cfg.gap;
    }
    // Pad the beat with a trailing hold so its span matches the natural
    // speaking time of the narration (never shrinks below the drawn content).
    if (beat.targetSec) {
      const used = cursor - beatStart;
      if (used < beat.targetSec) {
        const pad = beat.targetSec - used;
        flat.push({ type: "hold", era, start: cursor, end: cursor + pad, seed: seed + 1, dur: pad });
        cursor += pad;
      }
    }
    beatSpans.push({ id: beat.id, title: beat.title, narration: beat.narration, start: beatStart, end: cursor });
  }
  return { flat, beatSpans, duration: cursor };
}
