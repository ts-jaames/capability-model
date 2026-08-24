#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { parse } from "yaml";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const TYPED = {
  domain: { dir: "domains", schemaId: "https://capability-model.local/schema/domain.json" },
  capability: {
    dir: "capabilities",
    schemaId: "https://capability-model.local/schema/capability.json",
    recursive: true,
  },
  skill: { dir: "skills", schemaId: "https://capability-model.local/schema/skill.json" },
  role: { dir: "roles", schemaId: "https://capability-model.local/schema/role.json" },
};

const LEVELS_SCHEMA = "https://capability-model.local/schema/levels.json";
const LEVEL_IDS = ["L1", "L2", "L3"];
const DOMAIN_NAME_TO_SLUG = {
  Commercial: "commercial",
  Framing: "framing",
  Building: "building",
  Proof: "proof",
  Enablement: "enablement",
  Continuity: "continuity",
};

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
  const names = ["common", "domain", "skill", "capability", "role", "levels"];
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

async function main() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  await loadSchemaFiles(ajv);

  const levelsRec = await readYaml("levels.yaml");
  const byType = {};
  for (const [type, meta] of Object.entries(TYPED)) {
    byType[type] = await readDirYaml(meta.dir, { recursive: Boolean(meta.recursive) });
  }

  if (levelsRec?.data) {
    const validate = ajv.getSchema(LEVELS_SCHEMA);
    if (!validate(levelsRec.data)) {
      for (const err of validate.errors ?? []) {
        add("schema", levelsRec.file, `${err.instancePath || "/"} ${err.message}`);
      }
    } else {
      const ids = (levelsRec.data.execution_levels ?? []).map((level) => level.id);
      const missing = LEVEL_IDS.filter((id) => !ids.includes(id));
      const extra = ids.filter((id) => !LEVEL_IDS.includes(id));
      if (new Set(ids).size !== ids.length) {
        add("constraints", levelsRec.file, "execution_levels ids must be unique");
      }
      if (missing.length) {
        add(
          "constraints",
          levelsRec.file,
          `execution_levels missing ${missing.join(", ")}`,
        );
      }
      if (extra.length) {
        add(
          "constraints",
          levelsRec.file,
          `execution_levels has unexpected ids ${extra.join(", ")}`,
        );
      }
    }
  } else if (levelsRec === null) {
    // parse error already recorded
  } else {
    add("parse", "levels.yaml", "file is empty");
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

  const skillRefs = new Set();

  for (const rec of byType.capability) {
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
  ].join(", ");
  console.log(`OK — ${summary}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
