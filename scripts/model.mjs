// The one place the model is read off disk. The validator, the site build, and
// the MCP server all load through here so they can never disagree about what
// the model says.
//
// Roots are a list, not a single directory. A later root extends or overrides
// an earlier one by id, which is how a private overlay of entries that cannot
// be published will layer on top of this public base without either side
// knowing about the other. No overlay exists yet; the list is just length one.
import { readdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

export const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(
  /\/+$/,
  "",
);

export const ENTITY_TYPES = {
  domain: { dir: "domains" },
  capability: { dir: "capabilities", recursive: true, idFromFilename: true },
  skill: { dir: "skills" },
  role: { dir: "roles" },
  "risk-shape": { dir: "risk-shapes" },
  seam: { dir: "seams" },
  definition: { dir: "definitions" },
};

export const LEGEND_FILES = {
  levels: "levels.yaml",
  intensity: "intensity.yaml",
};

export const DOMAIN_ORDER = [
  "commercial",
  "framing",
  "building",
  "proof",
  "enablement",
  "continuity",
];

export const DOMAIN_NAME_TO_SLUG = {
  Commercial: "commercial",
  Framing: "framing",
  Building: "building",
  Proof: "proof",
  Enablement: "enablement",
  Continuity: "continuity",
};

export const LEVEL_IDS = ["L1", "L2", "L3"];
export const DIAL_IDS = ["dormant", "low", "active", "peak"];

export function overlayRoots(env = process.env) {
  return String(env.CAPABILITY_MODEL_OVERLAY ?? "")
    .split(":")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => resolve(entry).replace(/\/+$/, ""));
}

export function modelRoots(env = process.env) {
  return [REPO_ROOT, ...overlayRoots(env)];
}

function fileStem(file) {
  return basename(file).replace(/\.(yaml|yml)$/, "");
}

function isYaml(name) {
  return name.endsWith(".yaml") || name.endsWith(".yml");
}

async function readRecord(root, rootIndex, rel, problems) {
  const display = rootIndex === 0 ? rel : join(root, rel);
  try {
    const data = parse(await readFile(join(root, rel), "utf8"));
    return { file: display, path: join(root, rel), root, rootIndex, data };
  } catch (err) {
    problems.push({ group: "parse", file: display, message: err.message });
    return null;
  }
}

async function readTree(root, rootIndex, dir, recursive, problems) {
  let entries;
  try {
    entries = await readdir(join(root, dir), { withFileTypes: true });
  } catch (err) {
    if (err.code !== "ENOENT") {
      problems.push({ group: "parse", file: dir, message: err.message });
    }
    return [];
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const out = [];
  for (const entry of entries) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) out.push(...(await readTree(root, rootIndex, rel, true, problems)));
      continue;
    }
    if (!entry.isFile() || !isYaml(entry.name)) continue;
    const record = await readRecord(root, rootIndex, rel, problems);
    if (record) out.push(record);
  }
  return out;
}

// Loads every root in order and returns both the full list (`all`, including
// entries an overlay shadows) and the winning entry per id (`byId`/`records`).
// The validator needs the full list to catch duplicates inside one root.
export async function loadModel({ roots = modelRoots() } = {}) {
  const problems = [];
  const all = {};
  const byId = {};
  const records = {};

  for (const [type, meta] of Object.entries(ENTITY_TYPES)) {
    const found = [];
    for (const [rootIndex, root] of roots.entries()) {
      const tree = await readTree(root, rootIndex, meta.dir, Boolean(meta.recursive), problems);
      for (const record of tree) {
        const id = meta.idFromFilename ? fileStem(record.file) : record.data?.id;
        found.push({ ...record, type, id: typeof id === "string" ? id : undefined });
      }
    }
    all[type] = found;

    const winners = new Map();
    for (const record of found) {
      if (record.id === undefined) continue;
      winners.set(record.id, record);
    }
    byId[type] = winners;
    records[type] = [...winners.values()];
  }

  const legends = {};
  for (const [name, file] of Object.entries(LEGEND_FILES)) {
    let legend = null;
    for (const [rootIndex, root] of roots.entries()) {
      let raw;
      try {
        raw = await readFile(join(root, file), "utf8");
      } catch (err) {
        if (err.code === "ENOENT") continue;
        problems.push({ group: "parse", file, message: err.message });
        continue;
      }
      const display = rootIndex === 0 ? file : join(root, file);
      try {
        legend = { file: display, path: join(root, file), root, rootIndex, data: parse(raw) };
      } catch (err) {
        problems.push({ group: "parse", file: display, message: err.message });
      }
    }
    legends[name] = legend;
  }

  return { roots, problems, all, byId, records, legends };
}

// The shape the site build and the MCP server read: plain entities, with the
// capability's file stem promoted to `id` and its domain resolved to a slug.
export function capabilityView(record) {
  return {
    ...record.data,
    id: record.id,
    name: record.data?.capability,
    domain: DOMAIN_NAME_TO_SLUG[record.data?.domain] ?? record.data?.domain,
    domain_name: record.data?.domain,
    status: record.data?.status ?? "draft",
  };
}

export function modelView(loaded) {
  const plain = (type) => loaded.records[type].map((record) => record.data);
  return {
    levels: loaded.legends.levels?.data ?? null,
    intensity: loaded.legends.intensity?.data ?? null,
    domains: plain("domain"),
    capabilities: loaded.records.capability.map(capabilityView),
    skills: plain("skill"),
    roles: plain("role"),
    riskShapes: plain("risk-shape"),
    seams: plain("seam"),
    definitions: plain("definition"),
  };
}
