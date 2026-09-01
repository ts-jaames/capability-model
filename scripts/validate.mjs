#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { parse } from "yaml";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const UPDATE_BASELINE = process.argv.includes("--update-baseline");
const BASELINE_FILE = "debt-baseline.json";

const TYPED = {
  domain: { dir: "domains", schemaId: "https://capability-model.local/schema/domain.json" },
  capability: {
    dir: "capabilities",
    schemaId: "https://capability-model.local/schema/capability.json",
    recursive: true,
  },
  skill: { dir: "skills", schemaId: "https://capability-model.local/schema/skill.json" },
  role: { dir: "roles", schemaId: "https://capability-model.local/schema/role.json" },
  riskShape: {
    dir: "risk-shapes",
    schemaId: "https://capability-model.local/schema/risk-shape.json",
  },
  review: { dir: "reviews", schemaId: "https://capability-model.local/schema/review.json" },
};

const SINGLETONS = {
  levels: { file: "levels.yaml", schemaId: "https://capability-model.local/schema/levels.json" },
  dials: { file: "dials.yaml", schemaId: "https://capability-model.local/schema/dials.json" },
  deferrals: {
    file: "deferred.yaml",
    schemaId: "https://capability-model.local/schema/deferrals.json",
  },
};

const LEVEL_IDS = ["L1", "L2", "L3"];
const INTENSITY_IDS = ["dormant", "low", "active", "peak"];
const CRITIC_COPIES = [
  ".claude/skills/capability-critic/SKILL.md",
  ".cursor/skills/capability-critic/SKILL.md",
];
const GENERIC_LEVEL_THRESHOLD = 0.85;
const DOMAIN_NAME_TO_SLUG = {
  Commercial: "commercial",
  Framing: "framing",
  Building: "building",
  Proof: "proof",
  Enablement: "enablement",
  Continuity: "continuity",
};

// Debt is a real hole in the model that is not a broken file. It never blocks a
// commit on its own; it is counted, and the count is not allowed to grow. That
// keeps a placeholder from quietly becoming permanent.
const DEBT_CODES = {
  "capability-owner-missing": "capability names no Owner",
  "capability-freshness-missing": "capability has no last_updated, so staleness is invisible",
  "level-undefined-but-should-be-specific":
    "capability is sold at level or risky to delegate, but its levels still repeat the agency ladder",
  "placeholder-l2-floor": "not_at_l1 is a placeholder, so the missing L1 floor has no recorded reason",
  "no-method-recorded": "capability records no agent skills, live or missing",
  "named-method-gap": "capability names a method it does not have yet",
  "unowned-capability": "no role owns this capability",
  "unstaffed-capability": "no role can execute this capability",
  "no-review-record": "capability has never been through the critic loop",
  "dial-weighting-missing": "risk shape pushes a capability without saying how hard",
  "published-but-unmodelled": "readers are told about a concept the source of truth cannot answer",
};

const groups = {
  parse: [],
  schema: [],
  duplicates: [],
  refs: [],
  orphans: [],
  constraints: [],
};
const debt = [];

function add(group, file, message) {
  groups[group].push({ file, message });
}

function addDebt(code, file, message) {
  if (!DEBT_CODES[code]) throw new Error(`unknown debt code "${code}"`);
  debt.push({ code, file, message });
}

async function loadSchemaFiles(ajv) {
  const names = [
    "common",
    "domain",
    "skill",
    "capability",
    "role",
    "levels",
    "dials",
    "risk-shape",
    "review",
    "deferrals",
  ];
  for (const name of names) {
    const raw = await readFile(join(ROOT, "schema", `${name}.json`), "utf8");
    ajv.addSchema(JSON.parse(raw));
  }
}

async function readYaml(rel) {
  const abs = join(ROOT, rel);
  try {
    const raw = await readFile(abs, "utf8");
    return { file: rel, data: parse(raw) };
  } catch (err) {
    add("parse", rel, err.message);
    return null;
  }
}

async function readDirYaml(dir, { recursive = false } = {}) {
  const abs = join(ROOT, dir);
  let entries;
  try {
    entries = await readdir(abs, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return [];
    add("parse", dir, err.message);
    return [];
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const out = [];
  for (const entry of entries) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) out.push(...(await readDirYaml(rel, { recursive: true })));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".yaml") && !entry.name.endsWith(".yml")) continue;
    const loaded = await readYaml(rel);
    if (loaded) out.push(loaded);
  }
  return out;
}

function fileStem(file) {
  return basename(file).replace(/\.(yaml|yml)$/, "");
}

function recordId(type, rec) {
  if (type === "capability") return fileStem(rec.file);
  return rec.data?.id;
}

function statusOf(entity) {
  return entity?.status ?? "draft";
}

function tokens(text) {
  return new Set(
    String(text ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
}

// How much of the legend's wording this level text reuses. 1.0 means the
// capability's level copy says nothing the agency-wide legend did not.
function overlap(text, legend) {
  const a = tokens(text);
  const b = tokens(legend);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of b) if (a.has(token)) shared += 1;
  return shared / b.size;
}

function indexById(records, type) {
  const map = new Map();
  for (const rec of records) {
    const id = recordId(type, rec);
    if (typeof id !== "string") continue;
    if (map.has(id)) {
      add(
        "duplicates",
        rec.file,
        `${type} id "${id}" already defined in ${map.get(id).file}`,
      );
      continue;
    }
    map.set(id, rec);
  }
  return map;
}

function validateFilename(type, rec) {
  const stem = fileStem(rec.file);
  if (type === "capability") {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(stem)) {
      add("constraints", rec.file, `filename stem "${stem}" must be kebab-case`);
    }
    return;
  }
  if (rec.data?.id && stem !== rec.data.id) {
    add(
      "constraints",
      rec.file,
      `filename stem "${stem}" must match id "${rec.data.id}"`,
    );
  }
}

function uniqueIds(items, file, label) {
  const seen = new Set();
  for (const id of items) {
    if (seen.has(id)) {
      add("constraints", file, `${label} contains duplicate id "${id}"`);
    }
    seen.add(id);
  }
}

function enforceCapabilityFloor(rec) {
  const cap = rec.data;
  const levels = cap.levels ?? {};
  const hasL1 = Object.hasOwn(levels, "L1");
  const hasNotAt = Object.hasOwn(cap, "not_at_l1");
  const hasGuardrails = Object.hasOwn(cap, "l1_guardrails");
  const hasBoundary = Object.hasOwn(cap, "l1_l2_boundary");

  if (hasNotAt && (hasGuardrails || hasBoundary)) {
    add(
      "constraints",
      rec.file,
      "L2-floor capabilities omit l1_guardrails and l1_l2_boundary; L1-floor capabilities omit not_at_l1",
    );
  }
  if (hasNotAt) {
    if (hasL1) {
      add("constraints", rec.file, "L2-floor must not have levels.L1");
    }
    if (!levels.L2 || !levels.L3) {
      add("constraints", rec.file, "L2-floor requires levels.L2 and levels.L3");
    }
  } else {
    if (!hasGuardrails) {
      add(
        "constraints",
        rec.file,
        "L1-floor requires l1_guardrails; L2-floor requires not_at_l1",
      );
    }
    if (!hasBoundary) {
      add("constraints", rec.file, "L1-floor requires l1_l2_boundary");
    }
    if (!hasL1 || !levels.L2 || !levels.L3) {
      add("constraints", rec.file, "L1-floor requires levels.L1, L2, and L3");
    }
  }
}

// A capability may only claim reviewed or ratified if the critic loop left a
// record saying so. Without this, status is self-asserted.
function enforcePromotion(rec, reviews) {
  const cap = rec.data;
  const id = fileStem(rec.file);
  const status = statusOf(cap);
  if (status === "draft") return;

  const review = reviews.get(id);
  if (!review) {
    add(
      "constraints",
      rec.file,
      `status ${status} requires a review record at reviews/${id}.yaml`,
    );
    return;
  }
  const data = review.data ?? {};
  if ((data.open_fails ?? 0) > 0) {
    add(
      "constraints",
      rec.file,
      `status ${status} requires zero open critic FAILs (reviews/${id}.yaml reports ${data.open_fails})`,
    );
  }
  const openFlags = (data.flags ?? []).filter((flag) => flag?.state === "open");
  if (status === "ratified") {
    if (openFlags.length) {
      add(
        "constraints",
        rec.file,
        `status ratified requires every critic FLAG closed by the owner (${openFlags.length} open)`,
      );
    }
    if (!data.ratified_by || !data.ratified_on) {
      add(
        "constraints",
        rec.file,
        "status ratified requires ratified_by and ratified_on in the review record",
      );
    }
    if (!(cap.l1_guardrails ?? []).length && !Object.hasOwn(cap, "not_at_l1")) {
      add(
        "constraints",
        rec.file,
        "status ratified requires a non-empty l1_guardrails list or a stated L2 floor",
      );
    }
  }
}

async function checkCriticDrift() {
  const contents = [];
  for (const rel of CRITIC_COPIES) {
    try {
      contents.push(await readFile(join(ROOT, rel), "utf8"));
    } catch {
      add("constraints", rel, "capability-critic copy is missing; the two assistants must see the same skill");
      return;
    }
  }
  if (contents[0] !== contents[1]) {
    add(
      "constraints",
      CRITIC_COPIES[1],
      `capability-critic has drifted from ${CRITIC_COPIES[0]}; the copies must be byte-identical`,
    );
  }
}

async function readBaseline() {
  try {
    const raw = await readFile(join(ROOT, BASELINE_FILE), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function countByCode(items) {
  const counts = {};
  for (const item of items) counts[item.code] = (counts[item.code] ?? 0) + 1;
  return counts;
}

async function main() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  await loadSchemaFiles(ajv);

  const singles = {};
  for (const [key, meta] of Object.entries(SINGLETONS)) {
    const rec = await readYaml(meta.file);
    singles[key] = rec;
    if (!rec) continue;
    if (!rec.data) {
      add("parse", meta.file, "file is empty");
      continue;
    }
    const validate = ajv.getSchema(meta.schemaId);
    if (!validate(rec.data)) {
      for (const err of validate.errors ?? []) {
        add("schema", rec.file, `${err.instancePath || "/"} ${err.message}`);
      }
    }
  }

  const byType = {};
  for (const [type, meta] of Object.entries(TYPED)) {
    byType[type] = await readDirYaml(meta.dir, { recursive: Boolean(meta.recursive) });
  }

  const levelsData = singles.levels?.data;
  if (levelsData) {
    const ids = (levelsData.execution_levels ?? []).map((level) => level.id);
    const missing = LEVEL_IDS.filter((id) => !ids.includes(id));
    const extra = ids.filter((id) => !LEVEL_IDS.includes(id));
    if (new Set(ids).size !== ids.length) {
      add("constraints", singles.levels.file, "execution_levels ids must be unique");
    }
    if (missing.length) {
      add("constraints", singles.levels.file, `execution_levels missing ${missing.join(", ")}`);
    }
    if (extra.length) {
      add("constraints", singles.levels.file, `execution_levels has unexpected ids ${extra.join(", ")}`);
    }
  }

  const dialsData = singles.dials?.data;
  if (dialsData) {
    const ids = (dialsData.intensities ?? []).map((item) => item.id);
    const missing = INTENSITY_IDS.filter((id) => !ids.includes(id));
    const extra = ids.filter((id) => !INTENSITY_IDS.includes(id));
    if (new Set(ids).size !== ids.length) {
      add("constraints", singles.dials.file, "intensities ids must be unique");
    }
    if (missing.length) {
      add("constraints", singles.dials.file, `intensities missing ${missing.join(", ")}`);
    }
    if (extra.length) {
      add("constraints", singles.dials.file, `intensities has unexpected ids ${extra.join(", ")}`);
    }
  }

  for (const [type, meta] of Object.entries(TYPED)) {
    const validate = ajv.getSchema(meta.schemaId);
    for (const rec of byType[type]) {
      if (rec.data == null || typeof rec.data !== "object") {
        add("parse", rec.file, "YAML must be a mapping");
        continue;
      }
      validateFilename(type, rec);
      if (!validate(rec.data)) {
        for (const err of validate.errors ?? []) {
          add("schema", rec.file, `${err.instancePath || "/"} ${err.message}`);
        }
      }
    }
  }

  const domains = indexById(byType.domain, "domain");
  const capabilities = indexById(byType.capability, "capability");
  const skills = indexById(byType.skill, "skill");
  const roles = indexById(byType.role, "role");
  const riskShapes = indexById(byType.riskShape, "riskShape");
  const reviews = indexById(byType.review, "review");

  const skillRefs = new Set();
  const standardLadder = [];
  const specificAuthored = [];
  const legendByLevel = Object.fromEntries(
    (levelsData?.execution_levels ?? []).map((level) => [level.id, level.description]),
  );

  for (const rec of byType.capability) {
    const cap = rec.data;
    if (!cap || typeof cap !== "object") continue;
    const capId = fileStem(rec.file);

    enforceCapabilityFloor(rec);
    enforcePromotion(rec, reviews);

    const domainSlug = DOMAIN_NAME_TO_SLUG[cap.domain];
    if (cap.domain && !domainSlug) {
      add("refs", rec.file, `domain "${cap.domain}" does not exist`);
    } else if (domainSlug && !domains.has(domainSlug)) {
      add("refs", rec.file, `domain "${cap.domain}" does not exist`);
    }

    const parent = basename(dirname(rec.file));
    if (domainSlug && parent !== domainSlug) {
      add(
        "constraints",
        rec.file,
        `parent folder "${parent}" must match domain slug "${domainSlug}"`,
      );
    }

    const entries = cap.agent_skills ?? [];
    const skillIds = entries.map((item) => item?.name).filter(Boolean);
    if (skillIds.length > 10) {
      add("constraints", rec.file, `agent_skills length ${skillIds.length} exceeds 10`);
    }
    uniqueIds(skillIds, rec.file, "agent_skills");
    for (const item of entries) {
      const skillId = item?.name;
      if (!skillId) continue;
      // status gap is how the model names a method it does not have. It must
      // not resolve to a file, and a file must not claim to be a gap.
      if (item.status === "gap") {
        if (skills.has(skillId)) {
          add(
            "constraints",
            rec.file,
            `skill "${skillId}" is marked gap but skills/${skillId}.yaml exists; set status live or building`,
          );
          skillRefs.add(skillId);
        }
        addDebt("named-method-gap", rec.file, `method "${skillId}" is named but not built`);
        continue;
      }
      if (!skills.has(skillId)) {
        add(
          "refs",
          rec.file,
          `skill "${skillId}" does not exist; mark it status: gap if it is not built yet`,
        );
      } else {
        skillRefs.add(skillId);
      }
    }

    if (!entries.length) {
      addDebt("no-method-recorded", rec.file, "agent_skills is empty; no method claimed and no gap named");
    }
    if (!cap.owner) {
      addDebt("capability-owner-missing", rec.file, `no Owner named for "${capId}"`);
    }
    if (!cap.last_updated) {
      addDebt("capability-freshness-missing", rec.file, "no last_updated");
    }
    if (typeof cap.not_at_l1 === "string" && cap.not_at_l1.trim().toUpperCase() === "TBD") {
      addDebt("placeholder-l2-floor", rec.file, "not_at_l1 is still TBD; the L2 floor has no stated reason");
    }
    // Levels either use the agency ladder on purpose, or they are specific to
    // this capability because it is sold at level or risky to delegate. Only
    // the second case, still carrying ladder text, is debt.
    const mode = cap.levels_mode ?? "standard-ladder";
    const ladderLevels = [];
    const authoredLevels = [];
    for (const levelId of LEVEL_IDS) {
      const text = cap.levels?.[levelId];
      const legend = legendByLevel[levelId];
      if (!text || !legend) continue;
      (overlap(text, legend) >= GENERIC_LEVEL_THRESHOLD ? ladderLevels : authoredLevels).push(levelId);
    }
    if (mode === "standard-ladder") {
      if (authoredLevels.length) {
        add(
          "constraints",
          rec.file,
          `levels_mode is standard-ladder but ${authoredLevels.join(", ")} carries capability-specific text; set levels_mode: specific`,
        );
      } else {
        standardLadder.push(capId);
      }
    } else if (ladderLevels.length) {
      addDebt(
        "level-undefined-but-should-be-specific",
        rec.file,
        `${ladderLevels.join(", ")} still repeats the agency ladder on a capability marked specific`,
      );
    } else {
      specificAuthored.push(capId);
    }
    if (!reviews.has(capId)) {
      addDebt("no-review-record", rec.file, `no reviews/${capId}.yaml; capability-critic has never been recorded`);
    }
  }

  const ownedAnywhere = new Set();
  const executableAnywhere = new Set();

  for (const rec of byType.role) {
    const role = rec.data;
    if (!role || typeof role !== "object") continue;

    const owned = role.owned_capabilities ?? [];
    const executable = role.executable_capabilities ?? [];

    if (owned.length > 2) {
      add("constraints", rec.file, `owned_capabilities length ${owned.length} exceeds 2`);
    }
    if (executable.length > 7) {
      add(
        "constraints",
        rec.file,
        `executable_capabilities length ${executable.length} exceeds 7`,
      );
    }

    uniqueIds(owned, rec.file, "owned_capabilities");
    uniqueIds(
      executable.map((item) => item?.id).filter(Boolean),
      rec.file,
      "executable_capabilities",
    );

    const ownedSet = new Set(owned);
    for (const id of owned) {
      if (!capabilities.has(id)) {
        add("refs", rec.file, `owned capability "${id}" does not exist`);
      } else {
        ownedAnywhere.add(id);
      }
    }
    for (const item of executable) {
      const id = item?.id;
      if (!id) continue;
      const target = capabilities.get(id);
      if (!target) {
        add("refs", rec.file, `executable capability "${id}" does not exist`);
      } else {
        executableAnywhere.add(id);
      }
      if (ownedSet.has(id)) {
        add(
          "constraints",
          rec.file,
          `capability "${id}" cannot be both owned and executable`,
        );
      }
      // A role cannot staff a level the capability does not offer. Staffing L1
      // on an L2-floor capability sells a floor that does not exist.
      if (target && item.required_level === "L1" && Object.hasOwn(target.data ?? {}, "not_at_l1")) {
        add(
          "constraints",
          rec.file,
          `capability "${id}" has no L1 floor; required_level L1 is not available`,
        );
      }
    }
  }

  for (const [id, rec] of capabilities) {
    if (!ownedAnywhere.has(id)) {
      addDebt("unowned-capability", rec.file, `no role owns "${id}"`);
    }
    if (!executableAnywhere.has(id)) {
      addDebt("unstaffed-capability", rec.file, `no role can execute "${id}"`);
    }
  }

  const shapeOrders = new Map();
  for (const rec of byType.riskShape) {
    const shape = rec.data;
    if (!shape || typeof shape !== "object") continue;
    if (shape.order !== undefined) {
      if (shapeOrders.has(shape.order)) {
        add(
          "constraints",
          rec.file,
          `order ${shape.order} is already used by ${shapeOrders.get(shape.order)}`,
        );
      }
      shapeOrders.set(shape.order, rec.file);
    }
    const seen = [];
    for (const push of shape.pushes ?? []) {
      const id = push?.capability;
      if (!id) continue;
      seen.push(id);
      if (!capabilities.has(id)) {
        add("refs", rec.file, `pushes capability "${id}" does not exist`);
      }
      if (!push.intensity) {
        addDebt(
          "dial-weighting-missing",
          rec.file,
          `"${id}" has no intensity; engagement-change-runner cannot read a dial that is not set`,
        );
      }
    }
    uniqueIds(seen, rec.file, "pushes");
  }

  for (const rec of byType.review) {
    const review = rec.data;
    if (!review || typeof review !== "object") continue;
    const id = review.id;
    if (review.capability && !capabilities.has(review.capability)) {
      add("refs", rec.file, `review targets capability "${review.capability}" which does not exist`);
    }
    if (id && review.capability && id !== review.capability) {
      add("constraints", rec.file, `review id "${id}" must equal the capability id it reviews`);
    }
    for (const flag of review.flags ?? []) {
      if (flag?.state === "closed" && (!flag.closed_by || !flag.closed_on)) {
        add(
          "constraints",
          rec.file,
          `a closed FLAG requires closed_by and closed_on; only the capability owner may close one`,
        );
      }
    }
  }

  for (const entry of singles.deferrals?.data?.deferred ?? []) {
    if (entry?.published) {
      addDebt(
        "published-but-unmodelled",
        singles.deferrals.file,
        `"${entry.id}" is published to readers but not in the source of truth`,
      );
    }
  }

  for (const [id, rec] of skills) {
    if (!skillRefs.has(id)) {
      add("orphans", rec.file, `skill "${id}" is not referenced by any capability`);
    }
  }

  await checkCriticDrift();

  const titles = {
    parse: "Parse errors",
    schema: "Schema errors",
    duplicates: "Duplicate IDs",
    refs: "Referential integrity",
    orphans: "Orphans",
    constraints: "Constraints",
  };

  let count = 0;
  for (const [key, title] of Object.entries(titles)) {
    const items = groups[key];
    if (!items.length) continue;
    console.error(`\n${title}`);
    const byFile = new Map();
    for (const item of items) {
      if (!byFile.has(item.file)) byFile.set(item.file, []);
      byFile.get(item.file).push(item.message);
      count += 1;
    }
    for (const [file, messages] of byFile) {
      console.error(`  ${file}`);
      for (const message of messages) {
        console.error(`    - ${message}`);
      }
    }
  }

  if (count) {
    console.error(`\n${count} error${count === 1 ? "" : "s"}`);
    process.exit(1);
  }

  const counts = countByCode(debt);
  const codes = Object.keys(counts).sort();

  // Not debt. A recorded decision: these capabilities mean the standard ladder.
  console.log("\nDecisions");
  console.log(
    `  uses-standard-ladder — the agency ladder is the definition, deliberately (${standardLadder.length})`,
  );
  console.log(
    `  levels-authored — capability-specific level text written (${specificAuthored.length})`,
  );

  if (UPDATE_BASELINE) {
    const payload = {
      note: "Known holes in the model. The validator fails if any count grows or a new code appears. Lower these; do not raise them.",
      updated: new Date().toISOString().slice(0, 10),
      counts: Object.fromEntries(codes.map((code) => [code, counts[code]])),
    };
    await writeFile(join(ROOT, BASELINE_FILE), `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`Wrote ${BASELINE_FILE} with ${debt.length} debt items across ${codes.length} codes.`);
  }

  if (debt.length) {
    console.log("\nDebt (not blocking, but ratcheted)");
    for (const code of codes) {
      console.log(`  ${code} — ${DEBT_CODES[code]} (${counts[code]})`);
      for (const item of debt.filter((entry) => entry.code === code)) {
        console.log(`    ${item.file}: ${item.message}`);
      }
    }
  }

  if (!UPDATE_BASELINE) {
    const baseline = await readBaseline();
    if (!baseline) {
      console.error(
        `\nMissing ${BASELINE_FILE}. Run: npm run validate -- --update-baseline`,
      );
      process.exit(1);
    }
    const regressions = [];
    for (const code of codes) {
      const allowed = baseline.counts?.[code];
      if (allowed === undefined) {
        regressions.push(`new debt code "${code}" (${counts[code]}) is not in the baseline`);
      } else if (counts[code] > allowed) {
        regressions.push(`"${code}" grew from ${allowed} to ${counts[code]}`);
      }
    }
    if (regressions.length) {
      console.error("\nDebt ratchet");
      for (const line of regressions) console.error(`  - ${line}`);
      console.error(
        "\nDebt may only go down. Fix the new hole, or record a deliberate decision and run: npm run validate -- --update-baseline",
      );
      process.exit(1);
    }
    const paid = Object.entries(baseline.counts ?? {}).filter(
      ([code, allowed]) => (counts[code] ?? 0) < allowed,
    );
    if (paid.length) {
      console.log("\nDebt paid down since baseline");
      for (const [code, allowed] of paid) {
        console.log(`  - ${code}: ${allowed} → ${counts[code] ?? 0}`);
      }
      console.log("Lock it in: npm run validate -- --update-baseline");
    }
  }

  const summary = [
    `${domains.size} domains`,
    `${capabilities.size} capabilities`,
    `${skills.size} skills`,
    `${roles.size} roles`,
    `${riskShapes.size} risk shapes`,
    `${reviews.size} reviews`,
    `${debt.length} debt`,
  ].join(", ");
  console.log(`\nOK — ${summary}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
