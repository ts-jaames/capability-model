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
  return `<span class="status"><i class="dot dot-${esc(label)}"></i><span class="mono">${esc(label)}</span></span>`;
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

function levelPills(levels) {
  return (levels ?? [])
    .map((level) => `<span class="mono pill">${esc(level)}</span>`)
    .join("");
}

function typePill(type) {
  return `<span class="mono pill">${esc(type)}</span>`;
}

function kv(title, inner) {
  return `<div class="kv"><div class="label">${esc(title)}</div><div class="kv-body">${inner}</div></div>`;
}

function renderCap(cap, domains, skillById, capById) {
  const domain = domains.find((d) => d.id === cap.domain);
  const skillList = (cap.skills ?? [])
    .map((id) => skillById.get(id))
    .filter(Boolean)
    .map(
      (skill) =>
        `<li class="inline-row"><a href="#skill-${esc(skill.id)}">${esc(skill.name)}</a><span class="pills">${levelPills(skill.levels)}</span></li>`,
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
      return `<li><span class="mono pill">${esc(state.type)}</span> <a href="${href}">${esc(name)}</a> <span class="meta">— ${esc(state.when)}</span></li>`;
    })
    .join("");
  const guardrails = (cap.l1_guardrails ?? [])
    .map((item) => `<li>${esc(item)}</li>`)
    .join("");
  return `
    <article class="row" id="capability-${esc(cap.id)}">
      <header class="row-head">
        <h3>${esc(cap.name)}</h3>
        <div class="row-meta">
          <span class="mono">${esc(domain?.name ?? cap.domain)}</span>
          ${badge(statusOf(cap))}
          <span class="mono dim">${esc(cap.last_updated)}</span>
        </div>
      </header>
      <div class="kvs">
        ${kv("Core promise", `<p>${esc(String(cap.core_promise ?? "").trim())}</p>`)}
        ${kv("Client outcome", paragraphs(cap.client_outcome))}
        ${kv("Client how", paragraphs(cap.client_how))}
        ${kv("Spark how", paragraphs(cap.spark_how))}
        ${kv("Default state", paragraphs(cap.default_state))}
        ${kv(
          "L1 guardrails",
          guardrails
            ? `<ul class="plain">${guardrails}</ul>`
            : `<p class="meta">None yet — cannot be ratified.</p>`,
        )}
        ${kv(
          `Skills ${(cap.skills ?? []).length}/10`,
          skillList ? `<ul class="plain">${skillList}</ul>` : `<p class="meta">No skills linked.</p>`,
        )}
        ${
          exceptions
            ? kv("Exception states", `<ul class="plain">${exceptions}</ul>`)
            : ""
        }
      </div>
    </article>`;
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

  const sideDomains = domains
    .map(
      (domain) =>
        `<a href="#domain-${esc(domain.id)}">${esc(domain.name)}</a>`,
    )
    .join("");

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
            ${badge(statusOf(domain))}
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
    return `<p class="group-label">${esc(domain.name)}</p>${caps
      .map((cap) => renderCap(cap, domains, skillById, capById))
      .join("")}`;
  }).join("");

  const leftover = capabilities.filter((cap) => !DOMAIN_ORDER.includes(cap.domain));
  const extraCaps = leftover.length
    ? leftover
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((cap) => renderCap(cap, domains, skillById, capById))
        .join("")
    : "";

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
            <span class="name">${esc(skill.name)}</span>
            ${badge(statusOf(skill))}
            <div class="meta">${paragraphs(skill.description)}</div>
          </td>
          <td>${typePill(skill.type)}</td>
          <td class="mono">${skill.is_automated ? "yes" : "no"}</td>
          <td><span class="pills">${levelPills(skill.levels)}</span></td>
          <td>${usedBy}</td>
        </tr>`;
    })
    .join("");

  const levelRows = [
    ...(levels.execution_levels ?? []),
    levels.ownership,
  ]
    .filter(Boolean)
    .map(
      (level) => `
        <div class="kv">
          <div class="label"><span class="mono">${esc(level.id)}</span> ${esc(level.name)}</div>
          <div class="kv-body">${paragraphs(level.description)}</div>
        </div>`,
    )
    .join("");

  const generated = new Date().toISOString().slice(0, 10);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Capability taxonomy</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #FCFCFC;
      --ink: #1A1A1A;
      --muted: #6B7280;
      --dim: #9CA3AF;
      --line: #ECECEC;
      --hover: #F5F5F5;
      --accent: #5E6AD2;
    }
    * { box-sizing: border-box; }
    html {
      scroll-behavior: smooth;
      scroll-padding-top: 24px;
    }
    body {
      margin: 0;
      color: var(--ink);
      background: var(--bg);
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
      font-weight: 400;
      line-height: 1.6;
    }
    a {
      color: inherit;
      text-decoration: none;
      transition: color 200ms ease;
    }
    a:hover { color: var(--accent); }
    .mono {
      font-family: "Berkeley Mono", "SF Mono", ui-monospace, monospace;
      font-size: 12px;
      font-weight: 400;
      letter-spacing: 0.01em;
    }
    .shell {
      display: grid;
      grid-template-columns: 180px minmax(0, 760px);
      gap: 48px;
      max-width: 988px;
      margin: 0 auto;
      padding: 48px 32px 96px;
    }
    .side {
      position: sticky;
      top: 32px;
      align-self: start;
    }
    .brand {
      display: block;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: -0.01em;
      margin: 0 0 24px;
      color: var(--ink);
    }
    .side nav {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .side nav a {
      color: var(--muted);
      font-size: 14px;
      padding: 8px 0;
    }
    .side nav a:hover { color: var(--ink); }
    .side .group {
      margin-top: 24px;
    }
    .side .label { margin-bottom: 8px; }
    .side .domains {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .side .domains a {
      font-size: 12px;
      color: var(--muted);
    }
    .doc { min-width: 0; }
    h1, h2, h3, .name, .domain-name {
      font-weight: 600;
      letter-spacing: -0.01em;
      color: var(--ink);
      line-height: 1.3;
    }
    h1 { font-size: 28px; margin: 0 0 16px; }
    h2 { font-size: 19px; margin: 0 0 16px; }
    h3, .name { font-size: 15px; margin: 0; }
    .domain-name { font-size: 19px; }
    p { margin: 0 0 8px; }
    p:last-child { margin-bottom: 0; }
    .lede {
      color: var(--muted);
      margin: 0 0 16px;
      max-width: 760px;
    }
    section { margin: 0 0 48px; padding: 0; }
    section[id], article[id], tr[id] { scroll-margin-top: 24px; }
    .label {
      font-size: 12px;
      font-weight: 400;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .group-label {
      font-size: 12px;
      font-weight: 400;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--dim);
      margin: 32px 0 0;
      padding: 16px 0 8px;
    }
    .group-label:first-child { margin-top: 0; }
    .row {
      padding: 24px 0;
      border-bottom: 1px solid var(--line);
    }
    .row:hover { background: var(--hover); }
    .row-head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px 16px;
      margin-bottom: 16px;
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
    .dot-ratified { background: var(--ink); }
    .pill {
      display: inline-block;
      padding: 0 8px;
      background: var(--hover);
      color: var(--muted);
      line-height: 24px;
    }
    .pills { display: inline-flex; flex-wrap: wrap; gap: 8px; }
    .meta, .dim { color: var(--muted); font-size: 12px; }
    .dim { color: var(--dim); }
    .prose { margin-bottom: 16px; }
    .kvs { display: flex; flex-direction: column; gap: 16px; }
    .kvs.levels { margin: 24px 0 32px; }
    .kv {
      display: grid;
      grid-template-columns: 148px minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }
    .kv-body, .kv-body p { font-size: 14px; font-weight: 400; line-height: 1.6; }
    ul.plain { list-style: none; padding: 0; margin: 0; }
    ul.plain li { margin: 0; padding: 8px 0; border-bottom: 1px solid var(--line); }
    ul.plain li:last-child { border-bottom: 0; padding-bottom: 0; }
    ul.plain li:first-child { padding-top: 0; }
    .inline-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 16px;
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
      .side nav, .side .domains { flex-direction: row; flex-wrap: wrap; gap: 8px 16px; }
      .kv { grid-template-columns: 1fr; gap: 8px; }
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
      <a class="brand" href="#overview">Capability taxonomy</a>
      <nav>
        <a href="#overview">Overview</a>
        <a href="#domains">Domains</a>
        <a href="#capabilities">Capabilities</a>
        <a href="#skills">Skills</a>
      </nav>
      <div class="group">
        <div class="label">Domains</div>
        <div class="domains">${sideDomains}</div>
      </div>
    </aside>
    <div class="doc">
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
        <div class="kvs levels">${levelRows}</div>
        ${capabilitySections}${extraCaps}
        ${!capabilitySections && !extraCaps ? `<p class="meta">None yet.</p>` : ""}
      </section>
      <section id="skills">
        <h2>Skill inventory</h2>
        <div style="overflow: auto;">
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
              ${skillRows || `<tr><td colspan="5" class="meta">None yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
      <footer>Generated <span class="mono">${esc(generated)}</span> from the YAML source of truth. Read-only.</footer>
    </div>
  </div>
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
