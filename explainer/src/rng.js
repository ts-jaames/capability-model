// Deterministic seeded RNG (mulberry32). Fixed seeds keep the hand-drawn
// wobble identical on every frame, so nothing jitters between frames.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A small helper that yields signed noise in [-1, 1].
export function noiseGen(seed) {
  const r = mulberry32(seed);
  return () => r() * 2 - 1;
}
