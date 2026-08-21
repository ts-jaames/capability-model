#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { parse } from "yaml";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const TYPED = {
  domain: { dir: "domains", schemaId: "https://capability-model.local/schema/domain.json" },
  capability: {
    dir: "capabilities",
    schemaId: "https://capability-model.local/schema/capability.json",
  },
  skill: { dir: "skills", schemaId: "https://capability-model.local/schema/skill.json" },
  role: { dir: "roles", schemaId: "https://capability-model.local/schema/role.json" },
};

const LEVELS_SCHEMA = "https://capability-model.local/schema/levels.json";
const LEVEL_IDS = ["L1", "L2", "L3"];

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

async function readDirYaml(dir) {
  const abs = join(ROOT, dir);
  let names;
  try {
    names = await readdir(abs);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    add("parse", dir, err.message);
    return [];
  }
  const files = names.filter((n) => n.endsWith(".yaml") || n.endsWith(".yml")).sort();
  const out = [];
  for (const name of files) {
    const loaded = await readYaml(join(dir, name));
    if (loaded) out.push(loaded);
  }
  return out;
}

function statusOf(entity) {
  return entity?.status ?? "draft";
}

function indexById(records, type) {
  const map = new Map();
  for (const rec of records) {
    const id = rec.data?.id;
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

function validateFilename(rec) {
  const stem = basename(rec.file).replace(/\.(yaml|yml)$/, "");
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

async function main() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  await loadSchemaFiles(ajv);

  const levelsRec = await readYaml("levels.yaml");
  const byType = {};
  for (const [type, meta] of Object.entries(TYPED)) {
    byType[type] = await readDirYaml(meta.dir);
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
      validateFilename(rec);
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

    if (cap.domain && !domains.has(cap.domain)) {
      add("refs", rec.file, `domain "${cap.domain}" does not exist`);
    }

    const skillIds = cap.skills ?? [];
    if (skillIds.length > 10) {
      add("constraints", rec.file, `skills length ${skillIds.length} exceeds 10`);
    }
    uniqueIds(skillIds, rec.file, "skills");
    for (const skillId of skillIds) {
      if (!skills.has(skillId)) {
        add("refs", rec.file, `skill "${skillId}" does not exist`);
      } else {
        skillRefs.add(skillId);
      }
    }

    for (const [i, state] of (cap.exception_states ?? []).entries()) {
      if (!state || typeof state !== "object") continue;
      if (state.type === "skill" && state.id && !skills.has(state.id)) {
        add(
          "refs",
          rec.file,
          `exception_states[${i}] skill "${state.id}" does not exist`,
        );
      }
      if (state.type === "internal_capability" && state.id && !capabilities.has(state.id)) {
        add(
          "refs",
          rec.file,
          `exception_states[${i}] capability "${state.id}" does not exist`,
        );
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
