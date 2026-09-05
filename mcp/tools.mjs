// The MCP tool surface: names, descriptions, argument schemas, and dispatch
// into the queries in core.mjs.
//
// Separate from both core.mjs and stdio.mjs on purpose. The queries below are
// what an agent can ask, independent of how it connected; a hosted HTTP
// transport would serve exactly this list. Keeping the registry here means the
// second transport imports it rather than restating it, so the two can never
// drift into offering different tools.
import {
  NotFound,
  capabilitiesForRiskShape,
  getCapability,
  getDefinition,
  getIntensity,
  getLevels,
  getSeam,
  listCapabilities,
  listDefinitions,
  listDomains,
  listRiskShapes,
  listSeams,
  search,
} from "./core.mjs";

const noArgs = { type: "object", properties: {}, additionalProperties: false };
const oneArg = (name, description) => ({
  type: "object",
  properties: { [name]: { type: "string", description } },
  required: [name],
  additionalProperties: false,
});

export const TOOLS = [
  {
    name: "list_domains",
    description:
      "List the six domains — the closed set of types of work — with the capabilities inside each.",
    inputSchema: noArgs,
    run: (index) => listDomains(index),
  },
  {
    name: "list_capabilities",
    description:
      "List capabilities, the named client outcomes the firm promises. Optionally filter by domain slug or by level floor (L1 means it can be run at L1 against guardrails; L2 means it cannot).",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Domain slug, e.g. framing, building, proof.",
        },
        level_floor: { type: "string", enum: ["L1", "L2"] },
      },
      additionalProperties: false,
    },
    run: (index, args) => listCapabilities(index, args),
  },
  {
    name: "get_capability",
    description:
      "Full record for one capability: promise, client experience, method, agent skills, the risk shapes that fire it, and its levels — including whether the level copy is authored for this capability or inherited from the firm ladder.",
    inputSchema: oneArg("capability", "Capability id, e.g. risk-framing."),
    run: (index, args) => getCapability(index, args),
  },
  {
    name: "get_levels",
    description:
      "The agency-wide execution ladder: L1, L2, L3, plus Owner. How deeply a capability is executed. Not seniority, and not an intensity dial.",
    inputSchema: noArgs,
    run: (index) => getLevels(index),
  },
  {
    name: "get_intensity",
    description:
      "The four-step intensity dial — dormant, low, active, peak — and what each step means. How hot a capability is running right now, as opposed to how deeply it is executed.",
    inputSchema: noArgs,
    run: (index) => getIntensity(index),
  },
  {
    name: "list_risk_shapes",
    description:
      "List the recurring kinds of riskiest unknown. Each names an unknown, fires a set of capabilities, and produces an output.",
    inputSchema: noArgs,
    run: (index) => listRiskShapes(index),
  },
  {
    name: "capabilities_for_risk_shape",
    description:
      "The full record for one risk shape: which capabilities it fires, at what dial, what that dial means, and whether the dial values have been reviewed by a human.",
    inputSchema: oneArg("risk_shape", "Risk shape id, e.g. shape-ai-reliability."),
    run: (index, args) => capabilitiesForRiskShape(index, args),
  },
  {
    name: "list_seams",
    description:
      "List the load-bearing handoffs between capabilities and domains: what must cross, and in what form.",
    inputSchema: noArgs,
    run: (index) => listSeams(index),
  },
  {
    name: "get_seam",
    description:
      "One seam: what crosses, what does not count as crossing, and how the handoff is violated.",
    inputSchema: oneArg("seam", "Seam id, e.g. seam-building-proof."),
    run: (index, args) => getSeam(index, args),
  },
  {
    name: "list_definitions",
    description: "List the canonical terms in the model.",
    inputSchema: noArgs,
    run: (index) => listDefinitions(index),
  },
  {
    name: "get_definition",
    description:
      "The canonical definition of a term, plus the confusions it exists to rule out. Use this before asserting what a word means in this model.",
    inputSchema: oneArg("term", "Definition id, e.g. seat, level, intensity-dial."),
    run: (index, args) => getDefinition(index, args),
  },
  {
    name: "search",
    description:
      "Free-text search across capabilities, risk shapes, seams, definitions, and skills.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        types: {
          type: "array",
          items: {
            type: "string",
            enum: ["capability", "risk-shape", "seam", "definition", "skill"],
          },
        },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      required: ["query"],
      additionalProperties: false,
    },
    run: (index, args) => search(index, args),
  },
];

const toolByName = new Map(TOOLS.map((tool) => [tool.name, tool]));

export function hasTool(name) {
  return toolByName.has(name);
}

// The MCP wire shape: everything except the run function.
export function toolDescriptors() {
  return TOOLS.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  }));
}

// The index is passed in rather than loaded here: the transport owns the model
// lifecycle, so a long-lived server reads the YAML once at boot instead of once
// per call.
export function callTool(index, name, args) {
  const tool = toolByName.get(name);
  if (!tool) throw new NotFound("tool", name, [...toolByName.keys()]);
  return tool.run(index, args ?? {});
}
