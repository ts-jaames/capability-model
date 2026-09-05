#!/usr/bin/env node
// Local MCP transport: newline-delimited JSON-RPC 2.0 over stdin/stdout.
//
// Hand-rolled rather than built on @modelcontextprotocol/sdk. The SDK brings 91
// packages — two HTTP frameworks, CORS, and a JOSE/OAuth stack — none of which a
// local process reading YAML off disk can use, and this repo deliberately keeps
// its dependencies to what the model itself needs. When a hosted transport lands
// that actually needs HTTP and OAuth, the SDK earns its place there; this file
// stays as the local path.
//
// Read-only by construction: there is no tool here that writes. Nothing about a
// caller reaches mcp/core.mjs except a visibility scope.
import { realpathSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import {
  NotFound,
  capabilitiesForRiskShape,
  getCapability,
  getDefinition,
  getIntensity,
  getLevels,
  getRiskShape,
  getSeam,
  listCapabilities,
  listDefinitions,
  listDomains,
  listRiskShapes,
  listSeams,
  loadIndex,
  readScope,
  search,
} from "./core.mjs";

const SERVER = { name: "capability-model", version: "0.1.0" };
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

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
    name: "get_risk_shape",
    description: "One risk shape with the capabilities it fires and the dial for each.",
    inputSchema: oneArg("risk_shape", "Risk shape id, e.g. shape-ai-reliability."),
    run: (index, args) => getRiskShape(index, args),
  },
  {
    name: "capabilities_for_risk_shape",
    description:
      "Which capabilities does this risk shape fire, and at what dial. Returns each capability with its dial, what that dial means, and whether the dial values have been reviewed by a human.",
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

export function toolDescriptors() {
  return TOOLS.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  }));
}

export async function callTool(name, args, options = {}) {
  const tool = toolByName.get(name);
  if (!tool) throw new NotFound("tool", name, [...toolByName.keys()]);
  const index = await loadIndex(options);
  return tool.run(index, args ?? {});
}

function reply(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function replyError(id, code, message) {
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`,
  );
}

function toolResult(payload, isError = false) {
  const result = {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
  if (!isError && payload && typeof payload === "object" && !Array.isArray(payload)) {
    result.structuredContent = payload;
  }
  return result;
}

async function handle(message, options) {
  const { id, method, params } = message;

  if (method === "initialize") {
    const asked = params?.protocolVersion;
    return reply(id, {
      protocolVersion: SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER,
      instructions:
        "Read-only view of the Sparq operating model. Consult it before asserting what a capability promises, what a level or dial means, what must cross a seam, or what a term means here. It cannot be written to; humans change the model through pull requests.",
    });
  }

  if (method === "ping") return reply(id, {});

  if (method === "tools/list") return reply(id, { tools: toolDescriptors() });

  if (method === "tools/call") {
    const name = params?.name;
    if (!toolByName.has(name)) {
      return replyError(id, -32602, `Unknown tool "${name}".`);
    }
    try {
      return reply(id, toolResult(await callTool(name, params?.arguments, options)));
    } catch (err) {
      if (err instanceof NotFound) {
        return reply(
          id,
          toolResult({ error: err.message, known_ids: err.known }, true),
        );
      }
      return reply(id, toolResult({ error: String(err?.message ?? err) }, true));
    }
  }

  return replyError(id, -32601, `Unknown method "${method}".`);
}

async function main() {
  const scope = readScope();
  const index = await loadIndex({ scope });
  console.error(
    `capability-model MCP: ${index.capabilities.length} capabilities, ${index.riskShapes.length} risk shapes, ${index.seams.length} seams, ${index.definitions.length} definitions`,
  );
  console.error(`  roots: ${index.roots.join(", ")}`);
  console.error(`  scope: ${scope.join(", ")}`);

  const lines = createInterface({ input: process.stdin });
  for await (const line of lines) {
    const text = line.trim();
    if (!text) continue;
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      replyError(null, -32700, "Parse error.");
      continue;
    }
    // Notifications carry no id and take no response.
    if (message.id === undefined || message.id === null) continue;
    try {
      await handle(message, { scope });
    } catch (err) {
      replyError(message.id, -32603, String(err?.message ?? err));
    }
  }
}

const invokedDirectly =
  process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) await main();
