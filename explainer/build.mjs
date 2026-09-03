import { build } from "esbuild";

await build({
  entryPoints: ["src/scene.js"],
  bundle: true,
  format: "iife",
  outfile: "dist/scene.bundle.js",
  target: ["chrome110"],
  logLevel: "info",
});
console.log("bundled -> dist/scene.bundle.js");
