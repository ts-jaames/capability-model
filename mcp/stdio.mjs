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
// This file is only framing. What the tools are lives in tools.mjs and what
// they answer lives in core.mjs, so neither knows it was reached over a pipe.
// Read-only by construction: nothing here writes, and nothing about a caller
// reaches core.mjs except a visibility scope.
import { realpathSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { NotFound, loadIndex, readScope } from "./core.mjs";
import { callTool, hasTool, toolDescriptors } from "./tools.mjs";

const SERVER = { name: "capability-model", version: "0.1.0" };
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

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

function handle(message, index) {
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
    if (!hasTool(name)) return replyError(id, -32602, `Unknown tool "${name}".`);
    try {
      return reply(id, toolResult(callTool(index, name, params?.arguments)));
    } catch (err) {
      // A bad id is the caller's mistake to fix, not a protocol failure, so it
      // comes back as tool content listing what does exist.
      if (err instanceof NotFound) {
        return reply(id, toolResult({ error: err.message, known_ids: err.known }, true));
      }
      return reply(id, toolResult({ error: String(err?.message ?? err) }, true));
    }
  }

  return replyError(id, -32601, `Unknown method "${method}".`);
}

async function main() {
  const scope = readScope();
  // Read once at boot. The model is a git artifact, so edits arrive by restart.
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
      handle(message, index);
    } catch (err) {
      replyError(message.id, -32603, String(err?.message ?? err));
    }
  }
}

const invokedDirectly =
  process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) await main();
