#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT) || 4173;
const DOMAIN_ORDER = [
  "commercial",
  "framing",
  "building",
  "proof",
  "enablement",
  "continuity",
];

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function paragraphs(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${esc(block).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

function badge(status) {
  const label = status ?? "draft";
  if (label === "ratified") return "";
  return `<span class="status"><i class="dot dot-${esc(label)}"></i></span>`;
}

function statusOf(entity) {
  return entity.status ?? "draft";
}

const DOMAIN_NAME_TO_ID = {
  Commercial: "commercial",
  Framing: "framing",
  Building: "building",
  Proof: "proof",
  Enablement: "enablement",
  Continuity: "continuity",
};

const PAGES = [
  { id: "capability-model", title: "Capability Model", file: "index.html" },
  { id: "roles-titles", title: "Roles & Titles", file: "roles-titles.html" },
  { id: "operating-view", title: "Operating View", file: "operating-view.html" },
];

function pageToc(pageId) {
  if (pageId === "capability-model") {
    return `<a href="#overview">Overview</a>
        <a href="#domains">Domains</a>
        <a href="#capabilities">Capabilities</a>
        <a href="#agent-skills">Agent Skills</a>`;
  }
  if (pageId === "roles-titles") {
    return `<a href="#overview">Overview</a>
        <a href="#external-lines">External lines</a>
        <a href="#title-ownership-seat">Title · Ownership · Seat</a>`;
  }
  return `<a href="#overview">Overview</a>`;
}

function renderPageLinks(pageId) {
  return PAGES.map((item) => {
    const active = item.id === pageId;
    const href = active ? "#overview" : item.file;
    const current = active ? ' aria-current="page"' : "";
    return `<a class="uppercase mono page-link"${current} href="${esc(href)}">${esc(item.title)}</a>`;
  }).join("\n        ");
}

async function loadDir(dir) {
  const abs = join(ROOT, dir);
  let names;
  try {
    names = await readdir(abs);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  const out = [];
  for (const name of names.filter((n) => n.endsWith(".yaml")).sort()) {
    const data = parse(await readFile(join(abs, name), "utf8"));
    out.push(data);
  }
  return out;
}

async function loadCapabilities() {
  const root = join(ROOT, "capabilities");
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  const out = [];
  for (const dir of entries
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const names = await readdir(join(root, dir.name));
    for (const name of names.filter((n) => n.endsWith(".yaml")).sort()) {
      const data = parse(await readFile(join(root, dir.name, name), "utf8"));
      out.push({
        ...data,
        id: name.replace(/\.yaml$/, ""),
        name: data.capability,
        domain: DOMAIN_NAME_TO_ID[data.domain] ?? data.domain,
        status: data.status ?? "draft",
      });
    }
  }
  return out;
}

function sortKnown(items) {
  return [...items].sort((a, b) => {
    const ia = DOMAIN_ORDER.indexOf(a.id);
    const ib = DOMAIN_ORDER.indexOf(b.id);
    if (ia !== -1 || ib !== -1) {
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    }
    return a.name.localeCompare(b.name);
  });
}

function kv(title, inner) {
  return `<div class="kv"><div class="label">${esc(title)}</div><div class="kv-body">${inner}</div></div>`;
}

function agentSkillChip(id, href) {
  const chip = `<code class="agent-skill">${esc(id)}</code>`;
  return href ? `<a class="agent-skill-link" href="${esc(href)}">${chip}</a>` : chip;
}

function renderCap(cap, domains) {
  const domain = domains.find((d) => d.id === cap.domain);
  const skillChips = (cap.agent_skills ?? [])
    .map((item) => item?.name)
    .filter(Boolean)
    .map((id) => agentSkillChip(id, `#agent-skill-${id}`))
    .join("");
  const guardrails = (cap.l1_guardrails ?? [])
    .map((item) => `<li>${esc(item)}</li>`)
    .join("");
  return `
    <article class="row" id="capability-${esc(cap.id)}">
      <header class="row-head">
        <h3 class="domain-name">${esc(cap.name)}</h3>
        <div class="row-meta">
          <span class="mono">${esc(domain?.name ?? cap.domain)}</span>
          ${badge(statusOf(cap))}
        </div>
      </header>
      <div class="kvs">
        ${kv("Core promise", `<p>${esc(String(cap.promise ?? "").trim().replace(/\s+/g, " "))}</p>`)}
        ${kv("Client experience", `<p>${esc(String(cap.client_experience ?? "").trim().replace(/\s+/g, " "))}</p>`)}
        ${kv("Sparq How", paragraphs(cap.sparq_how))}
        ${
          guardrails
            ? kv("L1 guardrails", `<ul class="bullets">${guardrails}</ul>`)
            : cap.not_at_l1
              ? kv("Not at L1", `<p>${esc(String(cap.not_at_l1).trim())}</p>`)
              : ""
        }
        ${
          cap.l1_l2_boundary
            ? kv("L1→L2 boundary", `<p>${esc(String(cap.l1_l2_boundary).trim().replace(/\s+/g, " "))}</p>`)
            : ""
        }
        ${kv(
          "Agent Skills",
          skillChips
            ? `<div class="agent-skills">${skillChips}</div>`
            : `<p>None assessed.</p>`,
        )}
      </div>
    </article>`;
}

function renderLine(id, name, intro, fields) {
  const kvs = fields
    .map(([label, body]) => kv(label, `<p>${esc(body)}</p>`))
    .join("");
  return `
    <article class="row" id="${esc(id)}">
      <header class="row-head">
        <h3 class="domain-name">${esc(name)}</h3>
      </header>
      <div class="prose"><p>${esc(intro)}</p></div>
      <div class="kvs">${kvs}</div>
    </article>`;
}

function renderNote(id, name, body) {
  return `
    <article class="row" id="${esc(id)}">
      <header class="row-head">
        <h3 class="domain-name">${esc(name)}</h3>
      </header>
      <div class="prose">${paragraphs(body)}</div>
    </article>`;
}

function renderRolesMain() {
  const lines = [
    renderLine(
      "line-product-architect",
      "Product Architect",
      "Owns whether it's the right thing: framed, priced, and adopted honestly. Leads presales, because shaping a deal is the same judgment as delivering one.",
      [
        [
          "Owns",
          "Commercial, Framing, Enablement, client-side Continuity (operating-model, transition/warranty), and Interface.",
        ],
        [
          "Executes",
          "Frames the ask to one lever; names the hard constraints and collapse risks; makes the go/redirect/stop call; shapes and prices the envelope; aligns blockers; carries adoption and handoff. Ships interface directly on smaller jobs.",
        ],
        [
          "Shape",
          "Barbell: one M-shaped person clears the envelope, or a Framing and an Interface specialist clear it together. Same SOW line either way.",
        ],
      ],
    ),
    renderLine(
      "line-ai-architect",
      "AI Architect",
      "Owns whether a probabilistic system is trustworthy: working on real data, proven before ship, safe once the client runs it.",
      [
        ["Owns", "AI systems engineering; autonomous-system governance."],
        [
          "Executes",
          "Evaluation before architecture; models grounded in the client's corpus; deploy gated on eval evidence, not a demo; controls and stop-rules for post-handoff autonomy.",
        ],
        [
          "Shape",
          "Deep-T: the specialist consultant, narrow coverage, full judgment in the lane.",
        ],
      ],
    ),
    renderLine(
      "line-forward-deployed-engineer",
      "Forward Deployed Engineer",
      "Owns whether a deterministic system is built and proven: durable, ownable, and visibly true.",
      [
        [
          "Owns",
          "Core systems, production hardening, durable delivery, slice building; all of Proof.",
        ],
        [
          "Executes",
          "Instrumented slices to test assumptions early; core systems fit to the client's stack; hardened against real load; a clean codebase the client can extend; proven against criteria set up front.",
        ],
        [
          "Shape",
          "Deep-T to barbell (build + proof, or build + AI). Highest-volume line.",
        ],
      ],
    ),
  ].join("");

  return `
      <section id="overview">
        <h1 class="mono uppercase eyebrow">Core Philosophy</h1>
        <p class="lede">Capabilities are the contract. Roles are the fulfillment. Title tracks coverage.</p>
        <p class="lede">The SOW promises capabilities-at-levels (outcome-priced), never headcount. A role is internal shorthand for a person's capability-and-level profile.</p>
        <p class="lede">An Owner is the atomic internal unit (accountable for one capability cluster's maturity). Owners compose into the external lines below; the external lines are just the common compositions with market-legible names.</p>
        <p class="lede">A pair of single-spike Owners and one M-shaped person can fulfil the same SOW line. The contract doesn't care which.</p>
      </section>
      <section id="external-lines">
        <h2 class="mono uppercase eyebrow">External lines</h2>
        <div class="stack">
        ${lines}
        ${renderNote(
          "how-they-relate",
          "How they relate",
          "They divide by the confidence they earn: right-thing (PA), trustworthy-AI (AI Architect), built-and-proven (FDE). Owners are the atomic unit; a line is a named composition of Owners, met by one broad person or several deep ones.",
        )}
        </div>
      </section>
      <section id="title-ownership-seat">
        <h2 class="mono uppercase eyebrow">Title · Ownership · Seat</h2>
        <p class="lede">A person is described by three separate things at once. Keeping them apart is what lets us sell capabilities instead of people, staff flexibly, and reward maturity instead of billed hours.</p>
        <div class="stack">
        ${renderNote(
          "layer-title",
          "Title",
          "How clients buy.\n\nThe market-facing line on the rate card and SOW (Product Architect, AI Architect, FDE). Coarse by design: clients buy a capability line at a level, not a list of niche roles. Titles are peer categories, not a ladder. Seniority is not carried here.",
        )}
        ${renderNote(
          "layer-ownership",
          "Capability ownership",
          "What you're accountable for.\n\nThe atomic, permanent unit. An Owner keeps a capability cluster fit: authors the guardrails, prompt packs, and templates, and sets the standard others execute against. This is a person's durable identity, and where progression lives. You advance by deepening ownership and building the assets the firm runs on, not by billing more hours.",
        )}
        ${renderNote(
          "layer-seat",
          "Project seat",
          "What you're doing now.\n\nThe role you occupy on a specific squad for a specific slice of work. Seats shift within an engagement as the work changes. The same person may sit Slice Builder one sprint and Governance Lead the next. Because seats are activated by what the work needs, their catalog lives in the operating view, not here.",
        )}
        ${renderNote(
          "layers-how-they-relate",
          "How they relate",
          "A title rolls up many ownerships (one-to-many): one Product Architect line sits above the Commercial, Framing, and Interface owners. A person holds ownership permanently, wears a title externally, and moves through seats over an engagement's life. Seniority lives in the seat's level (L1-L3), not the title. A junior and senior FDE are both \"FDE\" to the client; the level sets the rate. The SOW promises a capability line at a level. How we fulfil it (one broad person or several deep owners, in which seats) is an internal call the client never sees. Example: an AI Architect (title) who is the AI Systems Owner (ownership) sits the Eval Harness Engineer seat in sprint 1 and the Governance Lead seat at handoff.",
        )}
        </div>
      </section>`;
}

function render(model, pageId = "capability-model") {
  const { levels, domains, capabilities, skills } = model;
  const page = PAGES.find((item) => item.id === pageId);
  if (!page) throw new Error(`Unknown page: ${pageId}`);
  const capsByDomain = new Map(domains.map((d) => [d.id, []]));
  for (const cap of capabilities) {
    if (!capsByDomain.has(cap.domain)) capsByDomain.set(cap.domain, []);
    capsByDomain.get(cap.domain).push(cap);
  }
  const domainSections = domains
    .map((domain) => {
      const caps = (capsByDomain.get(domain.id) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      const list = caps.length
        ? `<ul class="plain">${caps
            .map(
              (cap) =>
                `<li class="inline-row"><a href="#capability-${esc(cap.id)}">${esc(cap.name)}</a>${badge(statusOf(cap))}</li>`,
            )
            .join("")}</ul>`
        : `<p class="meta">No capabilities in this domain yet.</p>`;
      return `
        <article class="row" id="domain-${esc(domain.id)}">
          <header class="row-head">
            <h3 class="domain-name">${esc(domain.name)}</h3>
          </header>
          <div class="prose">${paragraphs(domain.description)}</div>
          ${list}
        </article>`;
    })
    .join("");

  const capabilitySections = DOMAIN_ORDER.map((id) => {
    const domain = domains.find((d) => d.id === id);
    const caps = (capsByDomain.get(id) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    if (!domain || !caps.length) return "";
    return caps.map((cap) => renderCap(cap, domains)).join("");
  }).join("");

  const leftover = capabilities.filter((cap) => !DOMAIN_ORDER.includes(cap.domain));
  const extraCaps = leftover.length
    ? leftover
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((cap) => renderCap(cap, domains))
        .join("")
    : "";

  const skillRows = skills
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((skill) => {
      const tip = esc(String(skill.description ?? "").trim().replace(/\s+/g, " "));
      return `
        <tr id="agent-skill-${esc(skill.id)}">
          <td>
            <span class="skill-tip" tabindex="0">
              ${agentSkillChip(skill.id)}
              ${badge(statusOf(skill))}
              <span class="tip">${tip}</span>
            </span>
          </td>
        </tr>`;
    })
    .join("");

  const levelRows = [
    ...(levels.execution_levels ?? []),
    levels.ownership,
  ]
    .filter(Boolean)
    .map((level) => {
      const isOwner = level.id === "Owner";
      const label = isOwner
        ? esc(level.name)
        : `<span class="mono">${esc(level.id)}</span> ${esc(level.name)}`;
      const desc = esc(String(level.description ?? "").trim().replace(/\s+/g, " "));
      return `
            <tr>
              <td class="cap-ex-level">${label}</td>
              <td>${desc}</td>
            </tr>`;
    })
    .join("");

  const generated = new Date().toISOString().slice(0, 10);
  const main =
    pageId === "capability-model"
      ? `
      <section id="overview">
        <h1 class="mono uppercase eyebrow">Core Philosophy</h1>
        <p class="lede">Domains are types of work. They do not change and they do not have levels. Capabilities are the named outcomes we promise inside a domain.</p>
        <p class="lede">How a capability is executed is a separate scale — L1 guided work against guardrails, L2 independent practice, L3 setting the standard, and Owner as agency-wide accountability for that capability's maturity. That scale lives with capabilities, not with domains.</p>
      </section>
      <section id="domains">
        <h2 class="mono uppercase eyebrow">Domains</h2>
        ${domainSections}
      </section>
      <section id="capabilities">
        <h2 class="mono uppercase eyebrow">Capabilities</h2>
        <table class="hairline-table">
          <thead>
            <tr>
              <th style="width:160px;">Level</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            ${levelRows}
          </tbody>
        </table>
        ${capabilitySections}${extraCaps}
        ${!capabilitySections && !extraCaps ? `<p class="meta">None yet.</p>` : ""}
      </section>
      <section id="agent-skills">
        <h2 class="mono eyebrow uppercase">Agent Skills</h2>
        <table class="hairline-table">
          <thead>
            <tr>
              <th>Agent skill</th>
            </tr>
          </thead>
          <tbody>
            ${skillRows || `<tr><td class="meta">None yet.</td></tr>`}
          </tbody>
        </table>
      </section>`
      : pageId === "roles-titles"
        ? renderRolesMain()
        : `
      <section id="overview">
        <h1 class="mono uppercase eyebrow">Core Philosophy</h1>
        <p class="lede">TBD</p>
      </section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(page.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #FCFCFC;
      --ink: #1A1A1A;
      --muted: #6B7280;
      --dim: #9CA3AF;
      --line: #ECECEC;
      --hover: #F5F5F5;
      --accent: #5E6AD2;
      --draft: #FF9800;
    }
    * { box-sizing: border-box; }
    html {
      scroll-behavior: smooth;
      scroll-padding-top: 12px;
    }
    body {
      margin: 0;
      color: var(--ink);
      background: var(--bg);
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 13.5px;
      font-weight: 400;
      line-height: 1.6;
    }
    .hairline-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 48px;
    }
    .hairline-table th, .hairline-table td {
      border: 1px solid #ECECEC;
      border-left: none;
      border-right: none;
      padding: 8px 8px;
      vertical-align: top;
      text-align: left;
    }
    .hairline-table th {
      background: #FAFAFA;
      font-size: 13.5px;
      color: var(--ink);
      text-transform: none;
      letter-spacing: 0;
    }
    .hairline-table .mono {
      font-size: 12.5px;
      font-weight: 400;
      letter-spacing: 0.01em;
      color: var(--ink);
    }
    .hairline-table .cap-ex-level {
      white-space: nowrap;
      vertical-align: middle;
    }
    .skill-tip {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: help;
    }
    .skill-tip .tip {
      visibility: hidden;
      opacity: 0;
      position: absolute;
      left: 0;
      top: calc(100% + 8px);
      z-index: 5;
      width: max-content;
      max-width: 320px;
      padding: 8px 12px;
      background: var(--ink);
      color: var(--bg);
      font-size: 12.5px;
      font-weight: 400;
      line-height: 1.45;
      border-radius: 6px;
      pointer-events: none;
      transition: opacity 150ms ease, visibility 150ms ease;
    }
    .skill-tip:hover .tip,
    .skill-tip:focus-within .tip {
      visibility: visible;
      opacity: 1;
    }
    a {
      color: inherit;
      text-decoration: none;
      font-weight: 400;
      font-synthesis: none;
      transition: color 180ms ease, opacity 180ms ease;
    }
    a:hover { font-weight: 600; }
    .uppercase { text-transform: uppercase; }
    .mono {
      font-family: "Berkeley Mono", "SF Mono", ui-monospace, monospace;
      font-size: 12px;
      font-weight: 400;
      letter-spacing: 0.01em;
    }
    .shell {
      display: grid;
      grid-template-columns: 180px minmax(0, 760px);
      gap: 72px;
      max-width: 1140px;
      min-height: 100vh;
      margin: 0 auto;
      padding: 48px 32px;
    }
    .side {
      position: sticky;
      top: 48px;
      align-self: start;
    }
    .pages {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .page-link {
      color: var(--ink);
      opacity: 0.4;
      transition: opacity 180ms ease;
    }
    .page-link:hover,
    .page-link[aria-current="page"] {
      opacity: 1;
    }
    .page-link:hover { font-weight: 400; }
    .page-link[aria-current="page"] { font-weight: 600; }
    .page-link[aria-current="page"]:hover { font-weight: 600; }
    .side .toc {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--line);
    }
    .side .toc a {
      font-size: 13.5px;
      transition: none;
    }
    .doc { min-width: 0; }
    h1, h2, h3, .domain-name {
      font-weight: 600;
      letter-spacing: -0.01em;
      color: var(--ink);
      line-height: 1.3;
    }
    h1 { font-size: 28px; margin: 0 0 16px; }
    h2 { font-size: 19px; margin: 0 0 16px; }
    h3, .name { font-size: 13.5px; margin: 0; }
    .domain-name { font-size: 13.5px; }
    p { margin: 0 0 8px; }
    p:last-child { margin-bottom: 0; }
    .lede {
      color: var(--ink);
      margin: 0 0 16px;
      max-width: 760px;
    }
    section { margin: 0 0 84px; padding: 0; }
    section[id], article[id], tr[id] { scroll-margin-top: 24px; }
    .label {
      font-size: 13.5px;
      color: var(--ink);
      font-weight: 400;
    }
    .row .kvs .label::after {
      content: " \\2014";
    }
    .row {
      padding: 28px 0;
    }
    .row:first-of-type { padding-top: 0; }
    .stack {
      display: flex;
      flex-direction: column;
    }
    .stack .row {
      padding: 0;
      margin: 0 0 28px;
    }
    .stack .row:last-child {
      margin-bottom: 0;
    }
    .row-head {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      gap: 8px 16px;
      margin-bottom: 4px;
    }
    #capabilities .row-head,
    .stack .row-head {
      margin-bottom: 12px;
    }
    .row-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      color: var(--muted);
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
    }
    .dot {
      width: 6px;
      height: 6px;
      border-radius: 99px;
      background: var(--dim);
      display: inline-block;
    }
    .dot-reviewed { background: var(--accent); }
    .dot-draft { background: var(--draft); }
    .agent-skills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .agent-skill {
      display: inline-block;
      font-family: "Berkeley Mono", "SF Mono", ui-monospace, monospace;
      font-size: 12px;
      font-weight: 400;
      letter-spacing: 0.01em;
      color: #E8952A;
      background: #FFF4E5;
      padding: 2px 6px;
      border-radius: 3px;
      line-height: 1.4;
    }
    a.agent-skill-link { color: inherit; }
    a.agent-skill-link:hover { font-weight: 400; }
    ul.bullets {
      margin: 6px 0;
      padding-left: 16px;
    }
    ul.bullets li {
      padding: 0;
      border: 0;
    }
    ul.bullets li:last-child { margin-bottom: 0; }
    .meta, .dim { color: var(--muted); font-size: 12px; }
    .dim { color: var(--dim); }
    .prose { margin-bottom: 24px; max-width: 700px; }
    .stack .prose { margin-bottom: 8px; }
    .stack .prose:last-child { margin-bottom: 0; }
    .kvs { display: flex; flex-direction: column; gap: 12px; }
    .kv {
      display: flex;
      flex-direction: column;
    }
    .kv-body, .kv-body p { font-size: 13.5px; font-weight: 400; line-height: 1.6; }
    ul.plain { list-style: none; padding: 0; margin: 0; }
    ul.plain li { margin: 0; padding: 8px 0; border-bottom: 1px solid var(--line); }
    ul.plain li:last-child { border-bottom: 0; padding-bottom: 0; }
    ul.plain li:first-child { padding-top: 0; }
    .inline-row {
      display: flex;
      gap: 16px;
    }
    .eyebrow {
      margin-bottom: 32px;
      display: block;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      text-align: left;
      vertical-align: top;
      padding: 16px 8px 16px 0;
      border-bottom: 1px solid var(--line);
    }
    th {
      font-size: 12px;
      font-weight: 400;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
    }
    td .meta p { margin: 8px 0 0; }
    footer {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid var(--line);
      color: var(--dim);
      font-size: 12px;
    }
    footer .mono { color: var(--dim); }
    @media (max-width: 800px) {
      .shell {
        grid-template-columns: 1fr;
        gap: 32px;
        padding: 32px 16px 64px;
      }
      .side { position: static; }
      .side .toc { flex-direction: row; flex-wrap: wrap; gap: 8px 16px; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      * { transition: none !important; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside class="side">
      <nav class="pages" aria-label="Pages">
        ${renderPageLinks(pageId)}
      </nav>
      <nav class="toc" aria-label="On this page">
        ${pageToc(pageId)}
      </nav>
    </aside>
    <div class="doc">
      ${main}
      <footer>Generated <span class="mono">${esc(generated)}</span> from the YAML source of truth. Read-only.</footer>
    </div>
  </div>
</body>
</html>`;
}

async function build() {
  const levels = parse(await readFile(join(ROOT, "levels.yaml"), "utf8"));
  const domains = sortKnown(await loadDir("domains"));
  const capabilities = await loadCapabilities();
  const skills = await loadDir("skills");
  const model = { levels, domains, capabilities, skills };
  const outDir = join(ROOT, "site");
  await mkdir(outDir, { recursive: true });
  for (const page of PAGES) {
    await writeFile(join(outDir, page.file), render(model, page.id));
  }
  console.log(`Wrote ${PAGES.map((page) => `site/${page.file}`).join(", ")}`);
}

function serve() {
  const allowed = new Set(["/", ...PAGES.map((page) => `/${page.file}`)]);
  const server = createServer(async (req, res) => {
    let pathname = new URL(req.url ?? "/", `http://localhost:${PORT}`).pathname;
    if (pathname === "/") pathname = "/index.html";
    if (!allowed.has(pathname)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    try {
      const html = await readFile(join(ROOT, "site", pathname.slice(1)));
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(html);
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Build missing. Run without --serve first.");
    }
  });
  server.listen(PORT, () => {
    console.log(`Preview at http://localhost:${PORT}`);
  });
}

await build();
if (process.argv.includes("--serve")) serve();
