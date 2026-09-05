#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import {
  DIAL_IDS,
  DOMAIN_NAME_TO_SLUG,
  ENTITY_TYPES,
  LEVEL_IDS,
  REPO_ROOT,
  fileStem,
  loadModel,
} from "./model.mjs";

const SCHEMA_ID = (name) => `https://capability-model.local/schema/${name}.json`;
const SCHEMA_NAMES = [
  "common",
  "domain",
  "skill",
  "capability",
  "role",
  "levels",
  "intensity",
  "risk-shape",
  "seam",
  "definition",
];

const groups = {
  parse: [],
  schema: [],
  duplicates: [],
  refs: [],
  orphans: [],
  constraints: [],
};

function add(group, file, message) {
  groups[group].push({ file, message });
}

async function loadSchemaFiles(ajv) {
  for (const name of SCHEMA_NAMES) {
    const raw = await readFile(join(REPO_ROOT, "schema", `${name}.json`), "utf8");
    ajv.addSchema(JSON.parse(raw));
  }
}

function statusOf(entity) {
  return entity?.status ?? "draft";
}

// Two files claiming the same id inside one root is an error. The same id in a
// later root is an overlay deliberately overriding the base, so it is not.
function reportDuplicates(records, type) {
  const seen = new Map();
  for (const rec of records) {
    if (typeof rec.id !== "string") continue;
    const key = `${rec.rootIndex}\u0000${rec.id}`;
    if (seen.has(key)) {
      add("duplicates", rec.file, `${type} id "${rec.id}" already defined in ${seen.get(key)}`);
      continue;
    }
    seen.set(key, rec.file);
  }
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

function checkLegend(ajv, legend, name, schemaName, check) {
  if (!legend) {
    add("parse", `${name}.yaml`, "file is missing");
    return;
  }
  if (legend.data == null || typeof legend.data !== "object") {
    add("parse", legend.file, "file is empty");
    return;
  }
  const validate = ajv.getSchema(SCHEMA_ID(schemaName));
  if (!validate(legend.data)) {
    for (const err of validate.errors ?? []) {
      add("schema", legend.file, `${err.instancePath || "/"} ${err.message}`);
    }
    return;
  }
  check(legend);
}

async function main() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  await loadSchemaFiles(ajv);

  const loaded = await loadModel();
  for (const problem of loaded.problems) {
    add(problem.group, problem.file, problem.message);
  }

  checkLegend(ajv, loaded.legends.levels, "levels", "levels", (legend) => {
    const ids = (legend.data.execution_levels ?? []).map((level) => level.id);
    const missing = LEVEL_IDS.filter((id) => !ids.includes(id));
    const extra = ids.filter((id) => !LEVEL_IDS.includes(id));
    if (new Set(ids).size !== ids.length) {
      add("constraints", legend.file, "execution_levels ids must be unique");
    }
    if (missing.length) {
      add("constraints", legend.file, `execution_levels missing ${missing.join(", ")}`);
    }
    if (extra.length) {
      add(
        "constraints",
        legend.file,
        `execution_levels has unexpected ids ${extra.join(", ")}`,
      );
    }
  });

  checkLegend(ajv, loaded.legends.intensity, "intensity", "intensity", (legend) => {
    const ids = (legend.data.dials ?? []).map((dial) => dial.id);
    if (new Set(ids).size !== ids.length) {
      add("constraints", legend.file, "dial ids must be unique");
    }
    if (ids.join(",") !== DIAL_IDS.join(",")) {
      add(
        "constraints",
        legend.file,
        `dials must be exactly ${DIAL_IDS.join(", ")} in that order`,
      );
    }
  });

  for (const type of Object.keys(ENTITY_TYPES)) {
    const validate = ajv.getSchema(SCHEMA_ID(type));
    for (const rec of loaded.all[type]) {
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
    reportDuplicates(loaded.all[type], type);
  }

  const domains = loaded.byId.domain;
  const capabilities = loaded.byId.capability;
  const skills = loaded.byId.skill;
  const roles = loaded.byId.role;
  const riskShapes = loaded.byId["risk-shape"];
  const seams = loaded.byId.seam;
  const definitions = loaded.byId.definition;

  const skillRefs = new Set();

  for (const rec of loaded.records.capability) {
    const cap = rec.data;
    if (!cap || typeof cap !== "object") continue;

    enforceCapabilityFloor(rec);

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

    const skillIds = (cap.agent_skills ?? []).map((item) => item?.name).filter(Boolean);
    if (skillIds.length > 10) {
      add("constraints", rec.file, `agent_skills length ${skillIds.length} exceeds 10`);
    }
    uniqueIds(skillIds, rec.file, "agent_skills");
    for (const skillId of skillIds) {
      if (!skills.has(skillId)) {
        add("refs", rec.file, `skill "${skillId}" does not exist`);
      } else {
        skillRefs.add(skillId);
      }
    }

    if (statusOf(cap) === "ratified" && !(cap.l1_guardrails ?? []).length) {
      add(
        "constraints",
        rec.file,
        "status ratified requires a non-empty l1_guardrails list",
      );
    }
  }

  for (const rec of loaded.records.role) {
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
      }
    }
    for (const item of executable) {
      const id = item?.id;
      if (!id) continue;
      if (!capabilities.has(id)) {
        add("refs", rec.file, `executable capability "${id}" does not exist`);
      }
      if (ownedSet.has(id)) {
        add(
          "constraints",
          rec.file,
          `capability "${id}" cannot be both owned and executable`,
        );
      }
    }
  }

  const readingOrders = new Map();
  for (const rec of loaded.records["risk-shape"]) {
    const shape = rec.data;
    if (!shape || typeof shape !== "object") continue;

    const fires = shape.fires ?? [];
    const capIds = fires.map((item) => item?.capability).filter(Boolean);
    uniqueIds(capIds, rec.file, "fires");
    for (const id of capIds) {
      if (!capabilities.has(id)) {
        add("refs", rec.file, `fired capability "${id}" does not exist`);
      }
    }
    for (const item of fires) {
      if (item?.dial === "dormant") {
        add(
          "constraints",
          rec.file,
          `capability "${item.capability}" cannot be fired at dormant — a shape that fires a capability turns it up`,
        );
      }
    }

    const order = shape.reading_order;
    if (typeof order === "number") {
      if (readingOrders.has(order)) {
        add(
          "duplicates",
          rec.file,
          `reading_order ${order} already used by ${readingOrders.get(order)}`,
        );
      } else {
        readingOrders.set(order, rec.file);
      }
    }
  }

  for (const rec of loaded.records.seam) {
    const seam = rec.data;
    if (!seam || typeof seam !== "object") continue;

    for (const side of ["from", "to"]) {
      const ref = seam[side];
      if (!ref || typeof ref !== "object") continue;
      if (ref.domain && !domains.has(ref.domain)) {
        add("refs", rec.file, `${side} domain "${ref.domain}" does not exist`);
      }
      if (ref.capability && !capabilities.has(ref.capability)) {
        add("refs", rec.file, `${side} capability "${ref.capability}" does not exist`);
      }
    }

    const from = JSON.stringify(seam.from ?? null);
    if (from !== "null" && from === JSON.stringify(seam.to ?? null)) {
      add("constraints", rec.file, "a seam must join two different endpoints");
    }
  }

  for (const rec of loaded.records.definition) {
    const definition = rec.data;
    if (!definition || typeof definition !== "object") continue;

    const refs = definition.see_also ?? [];
    uniqueIds(refs, rec.file, "see_also");
    for (const id of refs) {
      if (id === definition.id) {
        add("constraints", rec.file, "see_also must not point at itself");
      } else if (!definitions.has(id)) {
        add("refs", rec.file, `see_also "${id}" does not exist`);
      }
    }
  }

  for (const [id, rec] of skills) {
    if (!skillRefs.has(id)) {
      add("orphans", rec.file, `skill "${id}" is not referenced by any capability`);
    }
  }

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

  const summary = [
    `${domains.size} domains`,
    `${capabilities.size} capabilities`,
    `${skills.size} skills`,
    `${roles.size} roles`,
    `${riskShapes.size} risk shapes`,
    `${seams.size} seams`,
    `${definitions.size} definitions`,
  ].join(", ");
  const overlays = loaded.roots.slice(1);
  const from = overlays.length
    ? ` (base + ${overlays.length} overlay${overlays.length === 1 ? "" : "s"})`
    : "";
  console.log(`OK — ${summary}${from}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
