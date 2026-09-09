// Pure queries over the model. No transport, no request, no session, no user.
//
// The only thing that narrows a result here is a visibility scope: the set of
// tiers a caller may see. A transport that knows an identity is responsible for
// turning that identity into a scope before calling in. If a query in this file
// ever needs to know *who* is asking rather than *what tier* they may see, the
// server has stopped being a read of the model and the design needs revisiting.
import {
  PUBLIC_SCOPE,
  domainRank,
  loadModel,
  modelView,
  oneLine,
  scopeView,
} from "../scripts/model.mjs";

export const DEFAULT_SCOPE = PUBLIC_SCOPE;

export function readScope(env = process.env) {
  const raw = String(env.CAPABILITY_MODEL_SCOPE ?? "").trim();
  if (!raw) return DEFAULT_SCOPE;
  return raw
    .split(",")
    .map((tier) => tier.trim())
    .filter(Boolean);
}

function byId(items) {
  return new Map(items.map((item) => [item.id, item]));
}

// Sorting and grouping happen once, here, because the transport loads the model
// at boot and reuses this index for every call.
export function indexModel(view, roots = []) {
  const capabilities = [...view.capabilities].sort((a, b) => a.id.localeCompare(b.id));
  const capabilityIdsByDomain = new Map();
  for (const cap of capabilities) {
    const list = capabilityIdsByDomain.get(cap.domain);
    if (list) list.push(cap.id);
    else capabilityIdsByDomain.set(cap.domain, [cap.id]);
  }

  const riskShapes = [...view.riskShapes].sort(
    (a, b) => (a.reading_order ?? 99) - (b.reading_order ?? 99),
  );

  // Which shapes fire a given capability, built in one pass over the shapes
  // rather than rescanning every shape on each capability lookup. Walking them
  // in reading order keeps each capability's list deterministic.
  const firedBy = new Map();
  for (const shape of riskShapes) {
    for (const item of shape.fires ?? []) {
      const entry = {
        risk_shape: shape.id,
        dial: item.dial,
        dials_reviewed: shape.dials_reviewed === true,
      };
      const list = firedBy.get(item.capability);
      if (list) list.push(entry);
      else firedBy.set(item.capability, [entry]);
    }
  }

  return {
    roots,
    view,
    capabilities,
    capabilityIdsByDomain,
    firedBy,
    riskShapes,
    domains: [...view.domains].sort((a, b) => domainRank(a.id) - domainRank(b.id)),
    skills: view.skills,
    seams: view.seams,
    definitions: [...view.definitions].sort((a, b) => a.id.localeCompare(b.id)),
    titles: [...view.titles].sort(
      (a, b) => (a.reading_order ?? 99) - (b.reading_order ?? 99) || a.id.localeCompare(b.id),
    ),
    doctrine: [...view.doctrine].sort((a, b) => a.id.localeCompare(b.id)),
    levels: view.levels,
    intensity: view.intensity,
    domainById: byId(view.domains),
    capabilityById: byId(view.capabilities),
    skillById: byId(view.skills),
    shapeById: byId(view.riskShapes),
    seamById: byId(view.seams),
    definitionById: byId(view.definitions),
    titleById: byId(view.titles),
    doctrineById: byId(view.doctrine),
    dialById: byId(view.intensity?.dials ?? []),
    ladderById: byId(view.levels?.execution_levels ?? []),
  };
}

export async function loadIndex({ roots, scope = DEFAULT_SCOPE } = {}) {
  const loaded = await loadModel(roots ? { roots } : {});
  return indexModel(scopeView(modelView(loaded), scope), loaded.roots);
}

export class NotFound extends Error {
  constructor(kind, id, known) {
    super(`No ${kind} with id "${id}".`);
    this.kind = kind;
    this.id = id;
    this.known = known;
  }
}

function must(map, kind, id) {
  const found = map.get(id);
  if (!found) throw new NotFound(kind, id, [...map.keys()]);
  return found;
}

// A capability is L1-floor unless it says why it cannot be done at L1.
export function levelFloor(cap) {
  return Object.hasOwn(cap ?? {}, "not_at_l1") ? "L2" : "L1";
}

export function capabilitySummary(cap) {
  return {
    id: cap.id,
    name: cap.name,
    domain: cap.domain,
    domain_name: cap.domain_name,
    promise: oneLine(cap.promise),
    level_floor: levelFloor(cap),
  };
}

// Mirrors the render rule the site follows, so an agent and a reader are told
// the same thing: authored level copy is the real thing, and a standard-ladder
// capability inherits the firm ladder rather than having its own definition.
function levelsFor(cap, index) {
  const mode = cap.levels_mode === "specific" ? "specific" : "standard-ladder";
  const authored = cap.levels ?? {};
  const rung = (id) =>
    mode === "specific"
      ? { source: "capability", text: oneLine(authored[id]) }
      : {
          source: "standard-ladder",
          text: oneLine(index.ladderById.get(id)?.description),
          ladder_name: index.ladderById.get(id)?.name,
        };

  const l1 =
    levelFloor(cap) === "L2"
      ? { present: false, reason: oneLine(cap.not_at_l1) }
      : {
          present: true,
          guardrails: cap.l1_guardrails ?? [],
          l1_l2_boundary: oneLine(cap.l1_l2_boundary),
          ...rung("L1"),
        };

  return { mode, floor: levelFloor(cap), L1: l1, L2: rung("L2"), L3: rung("L3") };
}

export function listDomains(index) {
  return {
    domains: index.domains.map((domain) => ({
      id: domain.id,
      name: domain.name,
      description: oneLine(domain.description),
      capabilities: index.capabilityIdsByDomain.get(domain.id) ?? [],
    })),
  };
}

export function listCapabilities(index, { domain, level_floor } = {}) {
  let found = index.capabilities;
  if (domain) found = found.filter((cap) => cap.domain === domain);
  if (level_floor) found = found.filter((cap) => levelFloor(cap) === level_floor);
  return { count: found.length, capabilities: found.map(capabilitySummary) };
}

export function getCapability(index, { capability } = {}) {
  const cap = must(index.capabilityById, "capability", capability);
  return {
    ...capabilitySummary(cap),
    client_experience: oneLine(cap.client_experience),
    sparq_how: oneLine(cap.sparq_how),
    levels: levelsFor(cap, index),
    agent_skills: (cap.agent_skills ?? []).map((item) => ({
      ...item,
      description: oneLine(index.skillById.get(item.name)?.description),
    })),
    fired_by: index.firedBy.get(cap.id) ?? [],
  };
}

export function getLevels(index) {
  if (!index.levels) return { execution_levels: [], ownership: null };
  return {
    id: index.levels.id,
    name: index.levels.name,
    description: oneLine(index.levels.description),
    execution_levels: (index.levels.execution_levels ?? []).map((level) => ({
      ...level,
      description: oneLine(level.description),
    })),
    ownership: index.levels.ownership
      ? { ...index.levels.ownership, description: oneLine(index.levels.ownership.description) }
      : null,
  };
}

export function getIntensity(index) {
  if (!index.intensity) return { dials: [] };
  return {
    id: index.intensity.id,
    name: index.intensity.name,
    description: oneLine(index.intensity.description),
    dials: (index.intensity.dials ?? []).map((dial) => ({
      ...dial,
      description: oneLine(dial.description),
    })),
    floor_note: oneLine(index.intensity.floor_note),
  };
}

function shapeSummary(shape) {
  return {
    id: shape.id,
    name: shape.name,
    question: oneLine(shape.question),
    output: oneLine(shape.output),
    fires_count: (shape.fires ?? []).length,
    dials_reviewed: shape.dials_reviewed === true,
  };
}

export function listRiskShapes(index) {
  return {
    count: index.riskShapes.length,
    note: "Shapes co-occur, recur, and persist. The order they fire in is not fixed.",
    risk_shapes: index.riskShapes.map(shapeSummary),
  };
}

// The headline query: which capabilities does this risk shape fire, at what
// dial. This is also the full record for a shape — there is deliberately no
// second tool returning the same answer under another name.
export function capabilitiesForRiskShape(index, { risk_shape } = {}) {
  const shape = must(index.shapeById, "risk shape", risk_shape);
  const reviewed = shape.dials_reviewed === true;
  return {
    ...shapeSummary(shape),
    ...(reviewed
      ? {}
      : {
          caveat:
            "Dial values on this shape are authored drafts. No human has reviewed them, and nothing recorded them before they were written down here. Treat the set of capabilities as firmer than the dial on each one.",
        }),
    fires: (shape.fires ?? []).map((item) => {
      const cap = index.capabilityById.get(item.capability);
      return {
        ...(cap ? capabilitySummary(cap) : { id: item.capability }),
        dial: item.dial,
        dial_meaning: oneLine(index.dialById.get(item.dial)?.description),
        ...(item.note ? { note: oneLine(item.note) } : {}),
      };
    }),
  };
}

function seamEndpoint(ref, index) {
  if (ref?.capability) {
    const cap = index.capabilityById.get(ref.capability);
    return { kind: "capability", id: ref.capability, name: cap?.name ?? ref.capability };
  }
  const domain = index.domainById.get(ref?.domain);
  return { kind: "domain", id: ref?.domain, name: domain?.name ?? ref?.domain };
}

function seamDetail(seam, index) {
  const from = seamEndpoint(seam.from, index);
  const to = seamEndpoint(seam.to, index);
  const arrow = seam.direction === "two-way" ? "↔" : "→";
  return {
    id: seam.id,
    name: `${from.name} ${arrow} ${to.name}`,
    from,
    to,
    direction: seam.direction,
    what_crosses: oneLine(seam.what_crosses),
    not: oneLine(seam.not),
    violated_by: oneLine(seam.violated_by),
  };
}

export function listSeams(index) {
  return {
    count: index.seams.length,
    note: "A seam is the floor for a valid handoff — the minimum that must cross, in what form.",
    seams: index.seams.map((seam) => seamDetail(seam, index)),
  };
}

export function getSeam(index, { seam } = {}) {
  return seamDetail(must(index.seamById, "seam", seam), index);
}

export function listDefinitions(index) {
  return {
    count: index.definitions.length,
    definitions: index.definitions.map((item) => ({
      id: item.id,
      term: item.term,
      definition: oneLine(item.definition),
    })),
  };
}

export function getDefinition(index, { term } = {}) {
  const item = must(index.definitionById, "definition", term);
  return {
    id: item.id,
    term: item.term,
    definition: oneLine(item.definition),
    not: item.not ?? [],
    see_also: (item.see_also ?? []).map((id) => ({
      id,
      term: index.definitionById.get(id)?.term,
    })),
  };
}

// Ownership is expanded here rather than left as refs: a caller asking which
// title owns a capability should not have to resolve domains itself.
function ownedCapabilityIds(title, index) {
  const ids = [];
  for (const ref of title.owns ?? []) {
    if (ref?.capability) ids.push(ref.capability);
    else if (ref?.domain) ids.push(...(index.capabilityIdsByDomain.get(ref.domain) ?? []));
  }
  return ids;
}

export function listTitles(index) {
  return {
    count: index.titles.length,
    titles: index.titles.map((title) => ({
      id: title.id,
      name: title.name,
      description: oneLine(title.description),
      owns: title.owns ?? [],
      owned_capabilities: ownedCapabilityIds(title, index),
      executes: oneLine(title.executes),
      shape: oneLine(title.shape),
      note: title.note ? oneLine(title.note) : undefined,
    })),
  };
}

export function listDoctrine(index) {
  return {
    count: index.doctrine.length,
    doctrine: index.doctrine.map((item) => ({
      id: item.id,
      name: item.name,
      summary: oneLine(item.summary),
      steps: (item.steps ?? []).length,
    })),
  };
}

export function getDoctrine(index, { doctrine } = {}) {
  const item = must(index.doctrineById, "doctrine", doctrine);
  return {
    id: item.id,
    name: item.name,
    summary: oneLine(item.summary),
    rule: item.rule ? oneLine(item.rule) : undefined,
    steps: (item.steps ?? []).map((step, position) => ({
      position: position + 1,
      name: step.name,
      description: oneLine(step.description),
      never: step.never ? oneLine(step.never) : undefined,
      capabilities: (step.capabilities ?? []).map((id) => ({
        id,
        name: index.capabilityById.get(id)?.name,
      })),
    })),
    closing_note: item.closing_note ? oneLine(item.closing_note) : undefined,
  };
}

const SEARCHABLE = [
  ["capability", "capabilities", (cap) => [cap.name, cap.promise, cap.client_experience, cap.sparq_how]],
  ["risk-shape", "riskShapes", (shape) => [shape.name, shape.question, shape.output]],
  ["seam", "seams", (seam) => [seam.what_crosses, seam.not, seam.violated_by]],
  ["definition", "definitions", (item) => [item.term, item.definition, ...(item.not ?? [])]],
  ["skill", "skills", (skill) => [skill.name, skill.description]],
  ["title", "titles", (title) => [title.name, title.description, title.executes]],
  [
    "doctrine",
    "doctrine",
    (item) => [item.name, item.summary, ...(item.steps ?? []).map((step) => step.name)],
  ],
];

// Stops at the first field that matches rather than normalising every field of
// every entity on every search.
function firstMatch(values, needle) {
  for (const value of values) {
    const text = oneLine(value);
    if (text.toLowerCase().includes(needle)) return text;
  }
  return null;
}

export function search(index, { query, types, limit = 20 } = {}) {
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return { query: "", count: 0, results: [] };
  const wanted = types?.length ? new Set(types) : null;

  const results = [];
  for (const [type, key, fields] of SEARCHABLE) {
    if (wanted && !wanted.has(type)) continue;
    for (const entity of index[key] ?? []) {
      const hit = firstMatch(fields(entity), needle);
      if (!hit) continue;
      results.push({
        type,
        id: entity.id,
        name: entity.name ?? entity.term ?? entity.id,
        match: hit,
      });
    }
  }
  return { query, count: results.length, results: results.slice(0, limit) };
}
