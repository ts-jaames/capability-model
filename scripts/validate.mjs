#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import {
  DIAL_IDS,
  DOMAIN_NAME_TO_SLUG,
  DOMAIN_ORDER,
  ENTITY_TYPES,
  LEVEL_IDS,
  REPO_ROOT,
  fileStem,
  loadModel,
  overlayRoots,
} from "./model.mjs";
import { parse } from "yaml";

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
  "title",
  "doctrine",
  "capability-profiles",
  "capacity-model",
  "confidence-map",
  "lifecycle",
];

const groups = {
  parse: [],
  schema: [],
  duplicates: [],
  refs: [],
  orphans: [],
  constraints: [],
};

// Printed after a passing run; never fail it.
const warnings = [];

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

// Every marker in the capacity model, with the path it sits on. The walk is
// generic so a marker added to a new part of the file is checked without the
// validator being taught where it lives.
function collectMarkers(node, path = "", found = []) {
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectMarkers(item, `${path}[${index}]`, found));
    return found;
  }
  if (!node || typeof node !== "object") return found;
  for (const [key, value] of Object.entries(node)) {
    if (key === "confidence" && typeof value === "string") {
      found.push({ path: path || "/", marker: value });
      continue;
    }
    collectMarkers(value, `${path}/${key}`, found);
  }
  return found;
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

    // Leverage is how many scope units one person at a level can span. A more
    // senior person spanning fewer than a less senior one would contradict what
    // a level means, so it can hold steady or rise, never fall.
    const leverage = cap.scope_decomposition?.leverage_by_level;
    if (leverage) {
      const steps = ["L1", "L2", "L3", "L4"].map((level) => leverage[level]);
      for (let i = 1; i < steps.length; i += 1) {
        if (Number.isInteger(steps[i]) && Number.isInteger(steps[i - 1]) && steps[i] < steps[i - 1]) {
          add(
            "constraints",
            rec.file,
            `scope_decomposition leverage_by_level falls from L${i} (${steps[i - 1]}) to L${i + 1} (${steps[i]}); it can hold steady or rise, never fall`,
          );
        }
      }
    }

    // A segregation rule is between two capabilities, so both have to say it.
    // One side alone would leave a staffing option open from the other card.
    const capId = rec.id;
    const segregated = (cap.segregated_from ?? []).map((item) => item?.capability).filter(Boolean);
    uniqueIds(segregated, rec.file, "segregated_from");
    for (const otherId of segregated) {
      if (otherId === capId) {
        add("constraints", rec.file, `segregated_from names the capability itself ("${otherId}")`);
      } else if (!capabilities.has(otherId)) {
        add("refs", rec.file, `segregated_from capability "${otherId}" does not exist`);
      } else {
        const back = (capabilities.get(otherId).data?.segregated_from ?? []).map((item) => item?.capability);
        if (!back.includes(capId)) {
          add(
            "constraints",
            rec.file,
            `segregated_from "${otherId}" is not symmetric; "${otherId}" must also list "${capId}"`,
          );
        }
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

  // A title owns capabilities directly or by owning a whole domain. Coverage is
  // the point of the type: exactly one owner per capability, so no title
  // becomes a grab-bag and no capability becomes an orphan.
  const capabilityIdsByDomain = new Map();
  for (const [id, rec] of capabilities) {
    const slug = DOMAIN_NAME_TO_SLUG[rec.data?.domain];
    if (!slug) continue;
    if (!capabilityIdsByDomain.has(slug)) capabilityIdsByDomain.set(slug, []);
    capabilityIdsByDomain.get(slug).push(id);
  }

  const ownedBy = new Map();
  const titleOrders = new Map();
  for (const rec of loaded.records.title) {
    const title = rec.data;
    if (!title || typeof title !== "object") continue;

    const owns = title.owns ?? [];
    const ownedDomains = new Set();
    const seen = new Set();

    for (const ref of owns) {
      const key = ref?.domain ? `domain "${ref.domain}"` : `capability "${ref?.capability}"`;
      if (seen.has(key)) add("constraints", rec.file, `owns lists ${key} twice`);
      seen.add(key);

      let claimed = [];
      if (ref?.domain) {
        if (!domains.has(ref.domain)) {
          add("refs", rec.file, `owned domain "${ref.domain}" does not exist`);
          continue;
        }
        ownedDomains.add(ref.domain);
        claimed = capabilityIdsByDomain.get(ref.domain) ?? [];
      } else if (ref?.capability) {
        if (!capabilities.has(ref.capability)) {
          add("refs", rec.file, `owned capability "${ref.capability}" does not exist`);
          continue;
        }
        claimed = [ref.capability];
      }
      for (const id of claimed) {
        if (!ownedBy.has(id)) ownedBy.set(id, []);
        ownedBy.get(id).push(title.id ?? rec.file);
      }
    }

    // Naming a capability and its whole domain says the same thing twice, and
    // hides which one was meant.
    for (const ref of owns) {
      if (!ref?.capability) continue;
      const slug = DOMAIN_NAME_TO_SLUG[capabilities.get(ref.capability)?.data?.domain];
      if (slug && ownedDomains.has(slug)) {
        add(
          "constraints",
          rec.file,
          `owns capability "${ref.capability}" and its whole domain "${slug}"`,
        );
      }
    }

    const order = title.reading_order;
    if (typeof order === "number") {
      if (titleOrders.has(order)) {
        add(
          "duplicates",
          rec.file,
          `reading_order ${order} already used by ${titleOrders.get(order)}`,
        );
      } else {
        titleOrders.set(order, rec.file);
      }
    }
  }

  if (loaded.records.title.length) {
    for (const [id, rec] of capabilities) {
      const owners = ownedBy.get(id) ?? [];
      if (!owners.length) {
        add("orphans", rec.file, `capability "${id}" is not owned by any title`);
      } else if (owners.length > 1) {
        add(
          "constraints",
          rec.file,
          `capability "${id}" is owned by more than one title: ${owners.join(", ")}`,
        );
      }
    }
  }

  for (const rec of loaded.records.doctrine) {
    const doctrine = rec.data;
    if (!doctrine || typeof doctrine !== "object") continue;

    const steps = doctrine.steps ?? [];
    uniqueIds(steps.map((step) => step?.name).filter(Boolean), rec.file, "steps");
    uniqueIds((doctrine.variants ?? []).map((v) => v?.name).filter(Boolean), rec.file, "variants");

    // A step that names a stage has to point at a lifecycle, and the stage has
    // to exist there. Otherwise the doctrine is naming delivery work in prose.
    const stagedSteps = steps.filter((step) => step?.stage !== undefined);
    if (doctrine.lifecycle && !loaded.byId.lifecycle.has(doctrine.lifecycle)) {
      add("refs", rec.file, `lifecycle "${doctrine.lifecycle}" does not exist`);
    }
    if (stagedSteps.length && !doctrine.lifecycle) {
      add("constraints", rec.file, "steps cite a stage but the doctrine names no lifecycle");
    }
    if (doctrine.lifecycle && loaded.byId.lifecycle.has(doctrine.lifecycle)) {
      const lcData = loaded.byId.lifecycle.get(doctrine.lifecycle);
      const stageNumbers = new Set(((lcData.data ?? lcData).stages ?? []).map((s) => s.number));
      for (const step of stagedSteps) {
        if (!stageNumbers.has(step.stage)) {
          add("refs", rec.file, `step "${step.name}" cites stage ${step.stage} which does not exist in ${doctrine.lifecycle}`);
        }
      }
      // Stages only ever move forward through a procedure.
      const order = stagedSteps.map((step) => step.stage);
      if (order.some((n, i) => i > 0 && n < order[i - 1])) {
        add("constraints", rec.file, "steps cite stages out of order; a procedure moves forward through the lifecycle");
      }
    }
    for (const step of steps) {
      for (const id of step?.capabilities ?? []) {
        if (!capabilities.has(id)) {
          add(
            "refs",
            rec.file,
            `step "${step.name}" cites capability "${id}" which does not exist`,
          );
        }
      }
    }
  }

  for (const rec of loaded.records.lifecycle) {
    const lc = rec.data;
    if (!lc || typeof lc !== "object") continue;

    const stages = lc.stages ?? [];
    const numbers = stages.map((s) => s?.number);
    if (new Set(numbers).size !== numbers.length) {
      add("constraints", rec.file, "stage numbers must be unique");
    }
    for (let i = 0; i < numbers.length; i++) {
      if (numbers[i] !== i) {
        add(
          "constraints",
          rec.file,
          `stage numbers must be sequential from 0; got ${numbers[i]} at position ${i}`,
        );
        break;
      }
    }
    for (const stage of stages) {
      if (stage.primary_domain && !domains.has(stage.primary_domain)) {
        add(
          "refs",
          rec.file,
          `stage ${stage.number} "${stage.name}" cites primary_domain "${stage.primary_domain}" which does not exist`,
        );
      }
      if (stage.secondary_domain && !domains.has(stage.secondary_domain)) {
        add(
          "refs",
          rec.file,
          `stage ${stage.number} "${stage.name}" cites secondary_domain "${stage.secondary_domain}" which does not exist`,
        );
      }
      for (const shapeId of stage.risk_shapes_hot ?? []) {
        if (!riskShapes.has(shapeId)) {
          add(
            "refs",
            rec.file,
            `stage ${stage.number} "${stage.name}" cites risk shape "${shapeId}" which does not exist`,
          );
        }
      }
    }
    for (const dn of lc.domain_notes ?? []) {
      if (dn.domain && !domains.has(dn.domain)) {
        add("refs", rec.file, `domain_notes cites domain "${dn.domain}" which does not exist`);
      }
    }

    // Agentic mode is one pipeline with a fork, not a second lifecycle. The mode
    // block carries what is true of the whole mode; each stage's `agentic`
    // overlay carries only what changes at that stage. The overlay may not
    // repeat a procedure the stage already has, so nothing is authored twice.
    const mode = lc.agentic_mode;
    const overlaid = stages.filter((stage) => stage?.agentic);
    if (overlaid.length && !mode) {
      add("constraints", rec.file, "stages carry an agentic overlay but the lifecycle has no agentic_mode");
    }
    if (mode) {
      const stageNumbers = new Set(numbers);
      for (const field of ["asked_at", "decided_at"]) {
        if (!stageNumbers.has(mode[field])) {
          add("refs", rec.file, `agentic_mode.${field} cites stage ${mode[field]} which does not exist`);
        }
      }
      if (
        stageNumbers.has(mode.asked_at) &&
        stageNumbers.has(mode.decided_at) &&
        mode.asked_at > mode.decided_at
      ) {
        add("constraints", rec.file, "agentic_mode.asked_at cannot come after decided_at");
      }
      for (const dn of mode.domain_notes ?? []) {
        if (dn.domain && !domains.has(dn.domain)) {
          add("refs", rec.file, `agentic_mode.domain_notes cites domain "${dn.domain}" which does not exist`);
        }
      }
      // A principle is either true of the whole pipeline or new in agentic mode.
      // Filing it in both is how a mode starts to read like a second lifecycle.
      const pipelineWide = (lc.principles ?? []).map((p) => p.name);
      const added = (mode.added_principles ?? []).map((p) => p.name);
      uniqueIds(pipelineWide, rec.file, "principles");
      uniqueIds(added, rec.file, "agentic_mode.added_principles");
      for (const name of added) {
        if (pipelineWide.includes(name)) {
          add("constraints", rec.file, `principle "${name}" is listed as both pipeline-wide and added in agentic mode; pick one`);
        }
      }
      if (!overlaid.some((stage) => stage.agentic.divergence === "fork")) {
        add("constraints", rec.file, "agentic_mode names no stage where the modes fork; at least one stage must set divergence: fork");
      }
    }
    for (const stage of overlaid) {
      const overlay = stage.agentic;
      const where = `stage ${stage.number} "${stage.name}" agentic overlay`;
      for (const shapeId of overlay.risk_shapes_hot ?? []) {
        if (!riskShapes.has(shapeId)) {
          add("refs", rec.file, `${where} cites risk shape "${shapeId}" which does not exist`);
        }
        if ((stage.risk_shapes_hot ?? []).includes(shapeId)) {
          add("constraints", rec.file, `${where} repeats risk shape "${shapeId}" the stage already has; list only the ones it adds`);
        }
      }
      // "Additive" has to mean something checkable: the artifact may be added to
      // but never replaced. An overlay that swaps the artifact out is a fork.
      if (
        overlay.divergence === "additive" &&
        overlay.artifact &&
        stage.artifact &&
        !overlay.artifact.startsWith(stage.artifact)
      ) {
        add(
          "constraints",
          rec.file,
          `${where} is additive but its artifact "${overlay.artifact}" does not extend the stage artifact "${stage.artifact}"; extend it or mark the stage a fork`,
        );
      }
      const baseNames = new Set((stage.procedures ?? []).map((p) => p.name));
      const overlayNames = (overlay.procedures ?? []).map((p) => p.name);
      uniqueIds(overlayNames, rec.file, `${where} procedures`);
      for (const name of overlayNames) {
        if (baseNames.has(name)) {
          add("constraints", rec.file, `${where} repeats procedure "${name}" the stage already has`);
        }
      }
    }

    const numberSet = new Set(numbers);
    for (const entry of lc.raci ?? []) {
      if (!numberSet.has(entry.stage)) {
        add("refs", rec.file, `raci cites stage ${entry.stage} which does not exist`);
      }
      for (const a of entry.assignments ?? []) {
        if (!loaded.byId.title.has(a.title)) {
          add("refs", rec.file, `raci stage ${entry.stage} cites title "${a.title}" which does not exist`);
        }
      }
    }
  }

  checkLegend(
    ajv,
    loaded.legends.profiles,
    "capability-profiles",
    "capability-profiles",
    (legend) => {
      for (const person of legend.data.people ?? []) {
        const ids = (person.certifications ?? [])
          .map((item) => item?.capability)
          .filter(Boolean);
        uniqueIds(ids, legend.file, `certifications for "${person.person}"`);
        for (const id of ids) {
          if (!capabilities.has(id)) {
            add("refs", legend.file, `certified capability "${id}" does not exist`);
          }
        }
      }
    },
  );

  // The capacity model divides load by capacity, so its two scales have to be
  // the model's own scales rather than lookalikes: the domains it counts in
  // must be the six that exist, and the level axis must point at the firm
  // execution scale instead of restating L1-L3. The marker rule is the honesty
  // check — while the file is unreviewed, nothing in it may claim to be
  // measured.
  checkLegend(
    ajv,
    loaded.legends.capacityModel,
    "capacity-model",
    "capacity-model",
    (legend) => {
      const model = legend.data;

      const unitDomains = (model.surface_area?.units_by_domain ?? []).map(
        (item) => item?.domain,
      );
      for (const slug of unitDomains) {
        if (slug && !domains.has(slug)) {
          add("refs", legend.file, `units_by_domain domain "${slug}" does not exist`);
        }
      }
      uniqueIds(unitDomains.filter(Boolean), legend.file, "units_by_domain");
      if (unitDomains.join(",") !== DOMAIN_ORDER.join(",")) {
        add(
          "constraints",
          legend.file,
          `units_by_domain must cover every domain in reading order: ${DOMAIN_ORDER.join(", ")}`,
        );
      }

      const scaleId = loaded.legends.levels?.data?.id;
      for (const axis of ["demanded_level", "operator_caliber"]) {
        const ref = model.axes?.[axis]?.scale_ref;
        if (ref && scaleId && ref !== scaleId) {
          add(
            "refs",
            legend.file,
            `axes.${axis}.scale_ref "${ref}" is not the execution scale "${scaleId}" in levels.yaml`,
          );
        }
      }

      const capacityLevels = (model.nominal_capacity?.by_demanded_level ?? []).map(
        (row) => row?.demanded_level,
      );
      if (capacityLevels.join(",") !== LEVEL_IDS.join(",")) {
        add(
          "constraints",
          legend.file,
          `nominal_capacity must cover exactly ${LEVEL_IDS.join(", ")} in that order`,
        );
      }

      const ceiling = model.nominal_capacity?.hard_ceiling?.units;
      const peakNominal = Math.max(
        0,
        ...(model.nominal_capacity?.by_demanded_level ?? []).map((row) =>
          typeof row?.units === "number" ? row.units : 0,
        ),
      );
      if (typeof ceiling === "number" && ceiling < peakNominal) {
        add(
          "constraints",
          legend.file,
          `hard_ceiling ${ceiling} is below nominal capacity ${peakNominal}, so the cap would bite a matched operator`,
        );
      }

      const table = model.caliber_gap_rule?.multiplier_by_gap ?? [];
      table.forEach((row, index) => {
        if (row?.gap !== index) {
          add(
            "constraints",
            legend.file,
            `multiplier_by_gap must run from gap 0 upward with no holes; found gap ${row?.gap} at position ${index}`,
          );
        }
        const previous = table[index - 1]?.multiplier;
        if (typeof previous === "number" && row?.multiplier < previous) {
          add(
            "constraints",
            legend.file,
            `multiplier_by_gap gap ${row?.gap} multiplier ${row?.multiplier} is below gap ${index - 1}`,
          );
        }
      });
      if (table.length && table[0]?.multiplier !== 1) {
        add(
          "constraints",
          legend.file,
          "multiplier_by_gap gap 0 must be 1 — a matched operator holds nominal capacity, unmodified",
        );
      }

      const doctrineId = model.count_derivation?.change_event_doctrine;
      if (doctrineId && !loaded.byId.doctrine.has(doctrineId)) {
        add("refs", legend.file, `change_event_doctrine "${doctrineId}" does not exist`);
      }

      if (model.values_reviewed !== true) {
        for (const { path, marker } of collectMarkers(model)) {
          if (marker === "[VALIDATED]") {
            add(
              "constraints",
              legend.file,
              `${path} is marked [VALIDATED] while values_reviewed is false — no human has reviewed these figures`,
            );
          }
        }
      }
    },
  );

  // The confidence map is a human's judgment about how tested each part of the
  // model is, so the validator does not try to judge positions. It only makes
  // sure the shape is honest: three fixed columns in order, no part named
  // twice, and every stage it names actually exists in the lifecycle it cites.
  checkLegend(
    ajv,
    loaded.legends.confidenceMap,
    "confidence-map",
    "confidence-map",
    (legend) => {
      const map = legend.data;
      const COLUMN_IDS = ["thinking", "mapping", "pilot"];

      const columnIds = (map.columns ?? []).map((column) => column.id);
      if (columnIds.join(",") !== COLUMN_IDS.join(",")) {
        add(
          "constraints",
          legend.file,
          `columns must be exactly ${COLUMN_IDS.join(", ")} in that order`,
        );
      }

      // The note's clock runs from this stamp, so it has to be a real moment
      // that has already happened. Five minutes of slack covers clock skew.
      if (map.today) {
        const stamp = Date.parse(map.today.updated);
        if (Number.isNaN(stamp)) {
          add("constraints", legend.file, `today.updated "${map.today.updated}" is not a real date and time`);
        } else if (stamp > Date.now() + 5 * 60 * 1000) {
          add("constraints", legend.file, `today.updated "${map.today.updated}" is in the future`);
        }
      }

      const rows = map.rows ?? [];
      uniqueIds(
        rows.map((row) => row.id),
        legend.file,
        "rows",
      );

      for (const row of rows) {
        const where = `row "${row.id}"`;
        const items = row.items ?? [];

        if (row.lifecycle && !loaded.byId.lifecycle.has(row.lifecycle)) {
          add("refs", legend.file, `${where} cites lifecycle "${row.lifecycle}" which does not exist`);
        }

        const names = items.filter((item) => item.name).map((item) => item.name);
        uniqueIds(names, legend.file, `${where} part names`);
        const stages = items
          .filter((item) => item.stage !== undefined)
          .map((item) => String(item.stage));
        uniqueIds(stages, legend.file, `${where} stages`);

        if (stages.length) {
          if (!row.lifecycle) {
            add(
              "constraints",
              legend.file,
              `${where} names stages but cites no lifecycle to take their names from`,
            );
            continue;
          }
          const lifecycle = loaded.byId.lifecycle.get(row.lifecycle)?.data;
          const numbers = new Set((lifecycle?.stages ?? []).map((stage) => stage.number));
          for (const stage of stages) {
            if (!numbers.has(Number(stage))) {
              add(
                "refs",
                legend.file,
                `${where} cites stage ${stage} which does not exist in lifecycle "${row.lifecycle}"`,
              );
            }
          }
        }
      }

      checkReadiness(map, legend.file);
    },
  );

  await checkDenylist(loaded);

  const sections = {
    parse: "Parse errors",
    schema: "Schema errors",
    duplicates: "Duplicate IDs",
    refs: "Referential integrity",
    orphans: "Orphans",
    constraints: "Constraints",
  };

  let count = 0;
  for (const [key, title] of Object.entries(sections)) {
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
    `${loaded.byId.title.size} titles`,
    `${loaded.byId.doctrine.size} doctrine`,
    `${loaded.byId.lifecycle.size} ${loaded.byId.lifecycle.size === 1 ? "lifecycle" : "lifecycles"}`,
  ].join(", ");
  const overlays = loaded.roots.slice(1);
  const from = overlays.length
    ? ` (base + ${overlays.length} overlay${overlays.length === 1 ? "" : "s"})`
    : "";
  console.log(`OK — ${summary}${from}`);
  for (const warning of warnings) console.warn(`warning: ${warning}`);
}

// Readiness fields on the confidence map. Windows are estimates, so these
// checks only keep them coherent; they never judge whether a date is right.
function checkReadiness(map, file) {
  const COLUMN_IDS = ["thinking", "mapping", "pilot"];
  const rows = map.rows ?? [];
  const today = new Date().toISOString().slice(0, 10);

  const pair = (label, range) => {
    if (range && range.earliest > range.latest) {
      add("constraints", file, `${label} earliest ${range.earliest} is after latest ${range.latest}`);
    }
  };
  const minMax = (label, value) => {
    if (value && value.min > value.max) {
      add("constraints", file, `${label} min ${value.min} is above max ${value.max}`);
    }
  };

  minMax("mapping_engagements_target", map.mapping_engagements_target);
  minMax("coverage_to_advance", map.coverage_to_advance);
  for (const entry of map.next ?? []) minMax(`next "${entry.item}" estimate`, entry.estimate);

  // Every id an edge can point at: rows, parts that carry an id, loop nodes.
  const loopNodes = map.loop_nodes ?? [];
  const ids = [
    ...rows.flatMap((row) => [row.id, ...(row.items ?? []).map((item) => item.id).filter(Boolean)]),
    ...loopNodes.map((node) => node.id),
  ];
  uniqueIds(ids, file, "part and loop node ids");
  const known = new Set(ids);

  const edges = [];
  const checkEdges = (owner, list) => {
    const seen = new Set();
    for (const edge of list ?? []) {
      if (edge.id === owner) add("constraints", file, `"${owner}" depends on itself`);
      if (seen.has(edge.id)) add("duplicates", file, `"${owner}" lists depends_on "${edge.id}" twice`);
      seen.add(edge.id);
      if (!known.has(edge.id)) add("refs", file, `"${owner}" depends_on "${edge.id}" which does not exist`);
      edges.push([owner, edge.id]);
    }
  };

  for (const row of rows) {
    const where = `row "${row.id}"`;
    const items = row.items ?? [];
    checkEdges(row.id, row.depends_on);
    for (const item of items) if (item.depends_on) {
      if (!item.id) add("constraints", file, `${where} has a part with depends_on but no id`);
      else checkEdges(item.id, item.depends_on);
    }

    for (const entry of [row, ...items]) {
      if (entry.last_moved && entry.last_moved > today) {
        add("constraints", file, `${where} last_moved ${entry.last_moved} is in the future; it is history`);
      }
    }

    // A group's column is its least tested part, never typed.
    const column = items.length
      ? COLUMN_IDS[Math.min(...items.map((item) => COLUMN_IDS.indexOf(item.position)))]
      : row.position;
    const index = COLUMN_IDS.indexOf(column);

    if (column === "pilot" && !row.note) {
      add("constraints", file, `${where} sits in pilot, so it needs a note on the real work it ran against`);
    }
    for (const item of items) {
      if (item.position === "pilot" && !item.note) {
        add("constraints", file, `${where} part "${item.name ?? item.stage}" sits in pilot without a note`);
      }
    }

    const w = row.windows;
    if (!w) continue;
    pair(`${where} thinking_end`, w.thinking_end);
    pair(`${where} mapping_end`, w.mapping_end);
    pair(`${where} pilot window`, w.pilot?.window);
    if (w.pilot?.mode === "silo" && !w.pilot.silo_scope) {
      add("constraints", file, `${where} pilots in silo mode, so it needs silo_scope`);
    }
    if (w.thinking_end && index > 0) {
      add("constraints", file, `${where} is past thinking, so it cannot carry thinking_end`);
    }
    if (w.mapping_end && index > 1) {
      add("constraints", file, `${where} is in pilot, so it cannot carry mapping_end`);
    }
    const order = [
      ["thinking_end", w.thinking_end?.earliest],
      ["mapping_end", w.mapping_end?.earliest],
      ["pilot", w.pilot?.window?.earliest],
    ].filter(([, date]) => date);
    for (let i = 1; i < order.length; i += 1) {
      if (order[i - 1][1] > order[i][1]) {
        add(
          "constraints",
          file,
          `${where} ${order[i - 1][0]} earliest ${order[i - 1][1]} is after ${order[i][0]} earliest ${order[i][1]}`,
        );
      }
    }
  }

  for (const node of loopNodes) checkEdges(node.id, node.depends_on);

  // The loop draws every edge, so both ends of each edge must have a place.
  const ring = map.loop?.ring ?? [];
  const center = map.loop?.center ?? [];
  uniqueIds([...ring, ...center], file, "loop ring and center");
  for (const id of [...ring, ...center]) {
    if (!known.has(id)) add("refs", file, `loop places "${id}" which does not exist`);
  }
  if (map.loop) {
    const placed = new Set([...ring, ...center]);
    for (const [from, to] of edges) {
      for (const id of [from, to]) {
        if (known.has(id) && !placed.has(id)) {
          add("constraints", file, `"${from}" depends on "${to}", so "${id}" needs a place in loop.ring or loop.center`);
        }
      }
    }
  }
}

// Client names must never reach this public repo. The list of names to look
// for lives only in the private overlay, so it cannot leak them itself. Until
// the private layer exists this only warns.
async function readDenylist() {
  const terms = [];
  for (const root of overlayRoots()) {
    try {
      const data = parse(await readFile(join(root, "client-denylist.yaml"), "utf8"));
      terms.push(...(data?.terms ?? []).map((term) => String(term).trim()).filter(Boolean));
    } catch (err) {
      if (err.code !== "ENOENT") warnings.push(`could not read ${join(root, "client-denylist.yaml")}: ${err.message}`);
    }
  }
  return terms;
}

async function checkDenylist(loaded) {
  const terms = await readDenylist();
  if (!terms.length) {
    warnings.push("no client-name denylist loaded; add client-denylist.yaml to the private overlay");
    return;
  }
  const records = [
    ...Object.values(loaded.all).flat(),
    ...Object.values(loaded.legends).filter(Boolean),
  ].filter((rec) => rec.rootIndex === 0);
  for (const rec of records) {
    const text = JSON.stringify(rec.data).toLowerCase();
    for (const term of terms) {
      if (text.includes(term.toLowerCase())) {
        warnings.push(`${rec.file} contains a denylisted client name`);
        break;
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
