// Reports how old the Confidence Map "What's happening today" note is, and what
// has moved in the repo since. Read-only: it never writes the YAML. The rule in
// CLAUDE.md says what to do when this prints STALE.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";

const REFRESH_AFTER_HOURS = 4;

const map = parse(await readFile(new URL("../confidence-map.yaml", import.meta.url), "utf8"));
const updated = new Date(map.today?.updated ?? NaN);
const now = new Date();

// The stamp is local time with an offset, written the way the YAML wants it.
function localStamp(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const zone = `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${zone}`
  );
}

function git(...args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

console.log(`now:      ${localStamp(now)}`);

if (Number.isNaN(updated.getTime())) {
  console.log("note:     no valid today.updated stamp. STALE");
  process.exit(0);
}

const minutes = Math.floor((now - updated) / 60000);
const age = `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
const stale = minutes >= REFRESH_AFTER_HOURS * 60;
console.log(`note:     stamped ${map.today.updated}, ${age} ago`);
console.log(`status:   ${stale ? `STALE (older than ${REFRESH_AFTER_HOURS}h, refresh it)` : `fresh (refreshes after ${REFRESH_AFTER_HOURS}h)`}`);

if (stale) {
  const commits = git("log", `--since=${updated.toISOString()}`, "--pretty=format:  %h %s");
  const changed = git("status", "--short");
  console.log("\ncommits since the stamp:");
  console.log(commits || "  none");
  console.log("\nuncommitted changes:");
  console.log(changed ? changed.replace(/^/gm, "  ") : "  none");
}
