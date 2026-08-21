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
  return `<span class="badge badge-${esc(label)}">${esc(label)}</span>`;
}

function statusOf(entity) {
  return entity.status ?? "draft";
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

function countsFor(caps) {
  const counts = { draft: 0, reviewed: 0, ratified: 0 };
  for (const cap of caps) counts[statusOf(cap)] += 1;
  return counts;
}

function bar(counts) {
  const total = counts.draft + counts.reviewed + counts.ratified;
  if (!total) {
    return `<div class="bar empty">No capabilities yet</div>`;
  }
  const parts = ["draft", "reviewed", "ratified"]
    .filter((key) => counts[key])
    .map(
      (key) =>
        `<i class="seg-${key}" style="flex:${counts[key]}" title="${counts[key]} ${key}"></i>`,
    )
    .join("");
  return `<div class="bar" role="img" aria-label="${counts.draft} draft, ${counts.reviewed} reviewed, ${counts.ratified} ratified">${parts}</div>`;
}

function levelPills(levels) {
  return (levels ?? [])
    .map((level) => `<span class="pill pill-level">${esc(level)}</span>`)
    .join("");
}

function typePill(type) {
  return `<span class="pill pill-type">${esc(type)}</span>`;
}

function label(text) {
  return `<div class="label">${esc(text)}</div>`;
}

function render(model) {
  const { levels, domains, capabilities, skills } = model;
  const capsByDomain = new Map(domains.map((d) => [d.id, []]));
  for (const cap of capabilities) {
    if (!capsByDomain.has(cap.domain)) capsByDomain.set(cap.domain, []);
    capsByDomain.get(cap.domain).push(cap);
  }
  const skillById = new Map(skills.map((s) => [s.id, s]));
  const capById = new Map(capabilities.map((c) => [c.id, c]));

  const domainSections = domains
    .map((domain) => {
      const caps = (capsByDomain.get(domain.id) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      const counts = countsFor(caps);
      const list = caps.length
        ? `<ul class="plain">${caps
            .map(
              (cap) =>
                `<li><a href="#capability-${esc(cap.id)}">${esc(cap.name)}</a> ${badge(statusOf(cap))}</li>`,
            )
            .join("")}</ul>`
        : `<p class="muted">No capabilities in this domain yet.</p>`;
      return `
        <article class="card" id="domain-${esc(domain.id)}">
          <header class="domain-header">
            <div class="domain-title">
              <h3>${esc(domain.name)}</h3>
              ${badge(statusOf(domain))}
            </div>
            <div class="maturity">
              ${bar(counts)}
              <p class="meta">${caps.length} ${caps.length === 1 ? "capability" : "capabilities"} · ${counts.draft} draft · ${counts.reviewed} reviewed · ${counts.ratified} ratified</p>
            </div>
          </header>
          <div class="prose muted">${paragraphs(domain.description)}</div>
          ${list}
        </article>`;
    })
    .join("");

  const capabilitySections = capabilities
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((cap) => {
      const domain = domains.find((d) => d.id === cap.domain);
      const skillList = (cap.skills ?? [])
        .map((id) => skillById.get(id))
        .filter(Boolean)
        .map(
          (skill) =>
            `<li class="skill-row"><a href="#skill-${esc(skill.id)}">${esc(skill.name)}</a><span class="pills">${levelPills(skill.levels)}</span></li>`,
        )
        .join("");
      const exceptions = (cap.exception_states ?? [])
        .map((state) => {
          const target =
            state.type === "skill" ? skillById.get(state.id) : capById.get(state.id);
          const href =
            state.type === "skill"
              ? `#skill-${esc(state.id)}`
              : `#capability-${esc(state.id)}`;
          const name = target?.name ?? state.id;
          return `<li><span class="pill pill-type">${esc(state.type)}</span> <a href="${href}">${esc(name)}</a><span class="meta"> — ${esc(state.when)}</span></li>`;
        })
        .join("");
      const guardrails = (cap.l1_guardrails ?? [])
        .map((item) => `<li>${esc(item)}</li>`)
        .join("");
      return `
        <article class="card" id="capability-${esc(cap.id)}">
          <header class="card-header">
            <div>
              <h3>${esc(cap.name)}</h3>
              <p class="meta">${esc(domain?.name ?? cap.domain)} · ${esc(cap.owner)} · ${esc(cap.source)} · ${esc(cap.last_updated)}</p>
            </div>
            ${badge(statusOf(cap))}
          </header>
          <div class="cap-grid">
            <div class="cap-main">
              <div class="field">
                ${label("Core promise")}
                <p class="promise">${esc(String(cap.core_promise ?? "").trim())}</p>
              </div>
              <div class="field">
                ${label("Client outcome")}
                ${paragraphs(cap.client_outcome)}
              </div>
              <div class="field">
                ${label("Client how")}
                ${paragraphs(cap.client_how)}
              </div>
            </div>
            <aside class="cap-side">
              <div class="field">
                ${label("L1 guardrails")}
                ${guardrails ? `<ul class="tight">${guardrails}</ul>` : `<p class="muted">None yet — cannot be ratified.</p>`}
              </div>
              <div class="field">
                ${label(`Skills ${(cap.skills ?? []).length}/10`)}
                ${skillList ? `<ul class="plain">${skillList}</ul>` : `<p class="muted">No skills linked.</p>`}
              </div>
              ${
                exceptions
                  ? `<div class="field">${label("Exception states")}<ul class="tight">${exceptions}</ul></div>`
                  : ""
              }
            </aside>
          </div>
          <div class="cap-notes">
            <div class="field">
              ${label("Spark how")}
              ${paragraphs(cap.spark_how)}
            </div>
            <div class="field">
              ${label("Default state")}
              ${paragraphs(cap.default_state)}
            </div>
          </div>
        </article>`;
    })
    .join("");

  const skillRows = skills
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((skill) => {
      const usedBy = capabilities
        .filter((cap) => (cap.skills ?? []).includes(skill.id))
        .map(
          (cap) =>
            `<a href="#capability-${esc(cap.id)}">${esc(cap.name)}</a>`,
        )
        .join(", ");
      return `
        <tr id="skill-${esc(skill.id)}">
          <td>
            <strong>${esc(skill.name)}</strong>
            ${badge(statusOf(skill))}
            <div class="muted">${paragraphs(skill.description)}</div>
          </td>
          <td>${typePill(skill.type)}</td>
          <td>${skill.is_automated ? "Yes" : "No"}</td>
          <td><span class="pills">${levelPills(skill.levels)}</span></td>
          <td>${usedBy}</td>
        </tr>`;
    })
    .join("");

  const ribbonItems = [
    ...(levels.execution_levels ?? []),
    levels.ownership,
  ]
    .filter(Boolean)
    .map(
      (level) => `
        <article class="ribbon-item">
          <div class="ribbon-id">${esc(level.id)}</div>
          <h3>${esc(level.name)}</h3>
          ${paragraphs(level.description)}
        </article>`,
    )
    .join("");

  const generated = new Date().toISOString().slice(0, 10);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Capability taxonomy</title>
  <style>
    :root {
      --bg: #fcfcfc;
      --paper: #ffffff;
      --ink: #111827;
      --muted: #6b7280;
      --line: #eaebed;
      --draft: #92400e;
      --draft-bg: #fef3c7;
      --reviewed: #1e40af;
      --reviewed-bg: #dbeafe;
      --ratified: #065f46;
      --ratified-bg: #d1fae5;
    }
    * { box-sizing: border-box; }
    html {
      scroll-behavior: smooth;
      scroll-padding-top: 5.5rem;
    }
    body {
      margin: 0;
      color: var(--ink);
      background: var(--bg);
      font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    a { color: inherit; text-underline-offset: 2px; }
    header.top {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem 1.25rem;
      align-items: center;
      justify-content: space-between;
      padding: 0.85rem 1.5rem;
      background: var(--paper);
      border-bottom: 1px solid var(--line);
    }
    header.top strong { font-size: 0.95rem; font-weight: 600; color: var(--ink); }
    nav { display: flex; flex-wrap: wrap; gap: 1rem; }
    nav a { color: var(--muted); text-decoration: none; font-size: 0.875rem; }
    nav a:hover { color: var(--ink); }
    main { max-width: 1080px; margin: 0 auto; padding: 2rem 1.5rem 4rem; }
    section { margin: 2.75rem 0; }
    h1 { font-size: 1.75rem; font-weight: 650; letter-spacing: -0.02em; line-height: 1.2; margin: 0 0 0.5rem; color: var(--ink); }
    h2 { font-size: 1.15rem; font-weight: 650; margin: 0 0 1rem; color: var(--ink); }
    h3 { font-size: 1.05rem; font-weight: 600; margin: 0; color: var(--ink); }
    p { margin: 0.35rem 0; }
    .lede { max-width: 44rem; color: var(--muted); }
    .lede + .lede { margin-top: 0.65rem; }
    section[id], article[id], tr[id] { scroll-margin-top: 5.5rem; }
    .label {
      font-size: 12px;
      font-weight: 500;
      color: var(--muted);
      margin: 0 0 0.3rem;
    }
    .card {
      background: var(--paper);
      border: 1px solid var(--line);
      padding: 1.15rem 1.2rem;
      margin-bottom: 0.75rem;
    }
    .card-header, .domain-header {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: flex-start;
      margin-bottom: 0.9rem;
    }
    .domain-header { align-items: center; flex-wrap: wrap; }
    .domain-title { display: flex; align-items: center; gap: 0.5rem; }
    .maturity { min-width: min(280px, 100%); flex: 1; max-width: 360px; }
    .levels-ribbon {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.6rem;
      margin: 0.75rem 0 1.5rem;
    }
    .ribbon-item {
      background: var(--paper);
      border: 1px solid var(--line);
      padding: 0.7rem 0.8rem;
    }
    .ribbon-item h3 { font-size: 0.9rem; font-weight: 600; margin: 0 0 0.25rem; }
    .ribbon-item p { margin: 0; font-size: 0.8rem; line-height: 1.4; color: var(--muted); }
    .ribbon-id {
      font-size: 11px;
      font-weight: 600;
      color: var(--muted);
      margin-bottom: 0.15rem;
    }
    .bar {
      display: flex;
      height: 6px;
      background: #f3f4f6;
      overflow: hidden;
      border-radius: 99px;
    }
    .bar.empty { height: auto; background: transparent; color: var(--muted); font-size: 12px; }
    .seg-draft { background: var(--draft-bg); }
    .seg-reviewed { background: var(--reviewed-bg); }
    .seg-ratified { background: var(--ratified-bg); }
    .badge, .pill {
      display: inline-block;
      padding: 0.12rem 0.5rem;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 500;
      line-height: 1.4;
      vertical-align: middle;
      white-space: nowrap;
    }
    .badge-draft { background: var(--draft-bg); color: var(--draft); }
    .badge-reviewed { background: var(--reviewed-bg); color: var(--reviewed); }
    .badge-ratified { background: var(--ratified-bg); color: var(--ratified); }
    .pill-level { background: #f3f4f6; color: #374151; }
    .pill-type {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      background: #f3f4f6;
      color: #374151;
    }
    .pills { display: inline-flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; }
    .meta, .muted { color: var(--muted); font-size: 0.875rem; }
    .prose.muted p { color: var(--muted); }
    .cap-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.25rem 1.75rem;
    }
    .cap-main .promise {
      font-size: 1.05rem;
      font-weight: 600;
      line-height: 1.45;
      color: var(--ink);
      margin: 0;
    }
    .field { margin-bottom: 0.95rem; }
    .field:last-child { margin-bottom: 0; }
    .cap-side { padding-left: 0; }
    .cap-notes {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1rem;
      margin-top: 1.1rem;
      padding-top: 1rem;
      border-top: 1px solid var(--line);
    }
    .matrix {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1rem;
      margin: 0.25rem 0 1rem;
    }
    .matrix-row, .skill-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
      padding: 0.45rem 0;
      border-bottom: 1px solid var(--line);
    }
    .matrix-row:last-child, .skill-row:last-child { border-bottom: 0; }
    ul.plain, ul.tight { list-style: none; padding: 0; margin: 0; }
    ul.tight li { margin: 0.4rem 0; font-size: 0.9rem; }
    table { width: 100%; border-collapse: collapse; background: var(--paper); border: 1px solid var(--line); }
    th, td { text-align: left; vertical-align: top; padding: 0.8rem 0.85rem; border-bottom: 1px solid var(--line); }
    th { font-size: 12px; font-weight: 500; color: var(--muted); }
    td .muted p { margin: 0.3rem 0 0; }
    footer { margin-top: 3rem; color: var(--muted); font-size: 0.8rem; }
    @media (min-width: 800px) {
      .cap-grid { grid-template-columns: 3fr 2fr; }
      .cap-side { border-left: 1px solid var(--line); padding-left: 1.25rem; }
      .cap-notes { grid-template-columns: 1fr 1fr; }
      .matrix { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 799px) {
      .levels-ribbon { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  <header class="top">
    <strong>Capability taxonomy</strong>
    <nav>
      <a href="#overview">Overview</a>
      <a href="#domains">Domains</a>
      <a href="#capabilities">Capabilities</a>
      <a href="#skills">Skills</a>
    </nav>
  </header>
  <main>
    <section id="overview">
      <h1>Operating model</h1>
      <p class="lede">Domains are types of work. They do not change and they do not have levels. Capabilities are the named outcomes we promise inside a domain.</p>
      <p class="lede">How a capability is executed is a separate scale — L1 guided work against guardrails, L2 independent practice, L3 setting the standard, and Owner as agency-wide accountability for that capability's maturity. That scale lives with capabilities, not with domains.</p>
    </section>
    <section id="domains">
      <h2>Domains</h2>
      ${domainSections}
    </section>
    <section id="capabilities">
      <h2>Capabilities</h2>
      <p class="lede">L1–L3 and Owner describe how a capability is executed. They are not a property of domains.</p>
      <div class="levels-ribbon">${ribbonItems}</div>
      ${capabilitySections || `<p class="muted">None yet.</p>`}
    </section>
    <section id="skills">
      <h2>Skill inventory</h2>
      <div style="overflow:auto">
        <table>
          <thead>
            <tr>
              <th>Skill</th>
              <th>Type</th>
              <th>Automated</th>
              <th>Levels</th>
              <th>Used by</th>
            </tr>
          </thead>
          <tbody>
            ${skillRows || `<tr><td colspan="5" class="muted">None yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
    <footer>Generated ${esc(generated)} from the YAML source of truth. Read-only.</footer>
  </main>
</body>
</html>`;
}

async function build() {
  const levels = parse(await readFile(join(ROOT, "levels.yaml"), "utf8"));
  const domains = sortKnown(await loadDir("domains"));
  const capabilities = await loadDir("capabilities");
  const skills = await loadDir("skills");
  const html = render({ levels, domains, capabilities, skills });
  const outDir = join(ROOT, "site");
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "index.html"), html);
  console.log("Wrote site/index.html");
}

function serve() {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", `http://localhost:${PORT}`).pathname;
    if (path !== "/" && path !== "/index.html") {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    try {
      const html = await readFile(join(ROOT, "site", "index.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
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
