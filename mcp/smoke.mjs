#!/usr/bin/env node
// Boots the MCP server the way a client does — as a subprocess speaking
// JSON-RPC over stdio — and checks the tool contract holds against the real
// YAML. This is what makes the contract a CI gate rather than a hope: an edit
// that breaks what an agent can ask fails here, in the same run as validate.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const SERVER = fileURLToPath(new URL("./stdio.mjs", import.meta.url));

class Client {
  constructor() {
    this.nextId = 1;
    this.pending = new Map();
    this.child = spawn(process.execPath, [SERVER], {
      stdio: ["pipe", "pipe", "inherit"],
    });
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on("line", (line) => {
      const text = line.trim();
      if (!text) return;
      const message = JSON.parse(text);
      const settle = this.pending.get(message.id);
      if (!settle) return;
      this.pending.delete(message.id);
      settle(message);
    });
  }

  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 15000);
      this.pending.set(id, (message) => {
        clearTimeout(timer);
        resolve(message);
      });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  async call(name, args) {
    const message = await this.request("tools/call", { name, arguments: args });
    if (message.error) return { rpcError: message.error };
    const payload = JSON.parse(message.result.content[0].text);
    return { payload, isError: message.result.isError === true, raw: message.result };
  }

  close() {
    this.child.stdin.end();
    this.child.kill();
  }
}

const failures = [];
let checks = 0;

function check(label, condition, detail) {
  checks += 1;
  if (condition) return true;
  failures.push(detail ? `${label} — ${detail}` : label);
  return false;
}

async function main() {
  const client = new Client();

  const init = await client.request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0" },
  });
  check("initialize returns a protocol version", Boolean(init.result?.protocolVersion));
  check(
    "initialize advertises tools",
    Boolean(init.result?.capabilities?.tools),
    JSON.stringify(init.result?.capabilities),
  );

  const listed = await client.request("tools/list");
  const tools = listed.result?.tools ?? [];
  check("tools/list returns tools", tools.length > 0);
  for (const tool of tools) {
    check(
      `tool ${tool.name} has a description and input schema`,
      Boolean(tool.description) && tool.inputSchema?.type === "object",
    );
  }

  // Read-only by construction. A write tool appearing here means the server has
  // stopped being a view of the model.
  const writeish = tools.filter((tool) =>
    /^(create|update|delete|remove|write|set|add|put|patch)_/.test(tool.name),
  );
  check("no write tools are exposed", writeish.length === 0, writeish.map((t) => t.name).join(", "));

  // The headline query the whole server exists to answer.
  const ai = await client.call("capabilities_for_risk_shape", {
    risk_shape: "shape-ai-reliability",
  });
  check("capabilities_for_risk_shape succeeds", !ai.isError && !ai.rpcError);
  const aiFires = ai.payload?.fires ?? [];
  const aiSystems = aiFires.find((item) => item.id === "ai-systems-engineering");
  check("AI reliability fires AI systems engineering", Boolean(aiSystems));
  check("that capability comes back with a dial", Boolean(aiSystems?.dial), aiSystems?.dial);
  check(
    "the dial comes back with its meaning",
    Boolean(aiSystems?.dial_meaning),
    aiSystems?.dial_meaning,
  );
  check(
    "an unreviewed shape says so",
    ai.payload?.dials_reviewed === false && Boolean(ai.payload?.caveat),
  );

  // Every reference an agent can follow has to land.
  const caps = await client.call("list_capabilities");
  const capIds = new Set((caps.payload?.capabilities ?? []).map((cap) => cap.id));
  check("list_capabilities returns capabilities", capIds.size > 0);

  const shapes = await client.call("list_risk_shapes");
  const shapeIds = (shapes.payload?.risk_shapes ?? []).map((shape) => shape.id);
  check("list_risk_shapes returns shapes", shapeIds.length > 0);
  const dials = new Set(
    ((await client.call("get_intensity")).payload?.dials ?? []).map((dial) => dial.id),
  );
  check("get_intensity returns the four dials", dials.size === 4, [...dials].join(", "));

  for (const id of shapeIds) {
    const shape = await client.call("capabilities_for_risk_shape", { risk_shape: id });
    check(`risk shape ${id} resolves`, !shape.isError);
    for (const fired of shape.payload?.fires ?? []) {
      check(`${id} fires a real capability (${fired.id})`, capIds.has(fired.id));
      check(`${id} fires ${fired.id} at a known dial`, dials.has(fired.dial), fired.dial);
      check(`${id} never fires anything at dormant`, fired.dial !== "dormant");
    }
  }

  const seams = await client.call("list_seams");
  const domainIds = new Set(
    ((await client.call("list_domains")).payload?.domains ?? []).map((d) => d.id),
  );
  check("list_seams returns seams", (seams.payload?.seams ?? []).length > 0);
  for (const seam of seams.payload?.seams ?? []) {
    for (const side of [seam.from, seam.to]) {
      const known = side.kind === "capability" ? capIds.has(side.id) : domainIds.has(side.id);
      check(`seam ${seam.id} ${side.kind} endpoint ${side.id} resolves`, known);
    }
    check(`seam ${seam.id} states what crosses`, Boolean(seam.what_crosses));
    check(`seam ${seam.id} states how it is violated`, Boolean(seam.violated_by));
  }

  const definitions = await client.call("list_definitions");
  const definitionIds = new Set(
    (definitions.payload?.definitions ?? []).map((item) => item.id),
  );
  check("list_definitions returns definitions", definitionIds.size > 0);
  for (const id of definitionIds) {
    const found = await client.call("get_definition", { term: id });
    check(`definition ${id} resolves`, !found.isError);
    check(`definition ${id} rules something out`, (found.payload?.not ?? []).length > 0);
    for (const ref of found.payload?.see_also ?? []) {
      check(`definition ${id} see_also ${ref.id} resolves`, definitionIds.has(ref.id));
    }
  }

  // Titles are only useful to a caller if ownership resolves and covers the
  // model, so the coverage invariant is asserted over the wire too.
  const titles = await client.call("list_titles");
  const titleList = titles.payload?.titles ?? [];
  check("list_titles returns titles", titleList.length > 0);
  const ownedOnce = new Map();
  for (const title of titleList) {
    check(`title ${title.id} owns something`, (title.owned_capabilities ?? []).length > 0);
    check(`title ${title.id} says what it executes`, Boolean(title.executes));
    for (const id of title.owned_capabilities ?? []) {
      check(`title ${title.id} owns a real capability (${id})`, capIds.has(id));
      ownedOnce.set(id, (ownedOnce.get(id) ?? 0) + 1);
    }
  }
  for (const id of capIds) {
    check(`capability ${id} is owned by exactly one title`, ownedOnce.get(id) === 1, String(ownedOnce.get(id) ?? 0));
  }

  const doctrines = await client.call("list_doctrine");
  const doctrineIds = (doctrines.payload?.doctrine ?? []).map((item) => item.id);
  check("list_doctrine returns doctrine", doctrineIds.length > 0);
  for (const id of doctrineIds) {
    const found = await client.call("get_doctrine", { doctrine: id });
    if (!check(`doctrine ${id} resolves`, !found.isError)) continue;
    const steps = found.payload?.steps ?? [];
    check(`doctrine ${id} has ordered steps`, steps.length > 1);
    steps.forEach((step, position) => {
      check(`doctrine ${id} step ${position + 1} is in order`, step.position === position + 1);
      check(`doctrine ${id} step "${step.name}" describes itself`, Boolean(step.description));
      for (const cap of step.capabilities ?? []) {
        check(`doctrine ${id} step ${step.position} cites a real capability (${cap.id})`, capIds.has(cap.id));
      }
    });
  }

  // The skill reads its procedure from here, so the shape it depends on is a
  // contract: six moves, in this order, ending on the next slice.
  const change = await client.call("get_doctrine", { doctrine: "change-response" });
  const moves = (change.payload?.steps ?? []).map((step) => step.name);
  check("change-response has six moves", moves.length === 6, String(moves.length));
  check("change-response starts by re-reading the risk", moves[0] === "Re-read the risk", moves[0]);
  check("change-response merges re-price and re-time", moves[4] === "Re-price and re-time", moves[4]);
  check("change-response ends on the next slice", moves[5] === "Name the next slice", moves[5]);
  check("change-response says who decides", /owners decide/i.test(change.payload?.rule ?? ""));

  // Every capability answers, and the levels block stays honest either way.
  for (const id of capIds) {
    const cap = await client.call("get_capability", { capability: id });
    if (!check(`capability ${id} resolves`, !cap.isError)) continue;
    const levels = cap.payload?.levels ?? {};
    check(`capability ${id} states a level floor`, ["L1", "L2"].includes(levels.floor));
    if (levels.floor === "L2") {
      check(`capability ${id} says why it has no L1`, Boolean(levels.L1?.reason));
    } else {
      check(`capability ${id} lists L1 guardrails`, (levels.L1?.guardrails ?? []).length > 0);
      check(`capability ${id} states the L1/L2 boundary`, Boolean(levels.L1?.l1_l2_boundary));
    }
    check(`capability ${id} resolves L2 text`, Boolean(levels.L2?.text));
    check(`capability ${id} resolves L3 text`, Boolean(levels.L3?.text));
  }

  const levels = await client.call("get_levels");
  check(
    "get_levels returns exactly L1, L2, L3",
    (levels.payload?.execution_levels ?? []).map((l) => l.id).join(",") === "L1,L2,L3",
  );
  check("get_levels returns Owner", levels.payload?.ownership?.id === "Owner");

  const found = await client.call("search", { query: "seam", limit: 5 });
  check("search returns results", (found.payload?.results ?? []).length > 0);

  const missing = await client.call("get_capability", { capability: "no-such-capability" });
  check("an unknown id is a tool error, not a crash", missing.isError === true);
  check("an unknown id reports what is known", (missing.payload?.known_ids ?? []).length > 0);

  const badTool = await client.call("not_a_tool");
  check("an unknown tool is a protocol error", badTool.rpcError?.code === -32602);

  client.close();

  if (failures.length) {
    console.error(`\n${failures.length} of ${checks} checks failed:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`MCP smoke OK — ${checks} checks, ${tools.length} tools`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
