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

function bar(counts) {
  const total = counts.draft + counts.reviewed + counts.ratified;
  if (!total) {
    return `<div class="bar empty"><span>No capabilities yet</span></div>`;
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

function render(model) {
  const { levels, domains, capabilities, skills, roles } = model;
  const capsByDomain = new Map(domains.map((d) => [d.id, []]));
  for (const cap of capabilities) {
    if (!capsByDomain.has(cap.domain)) capsByDomain.set(cap.domain, []);
    capsByDomain.get(cap.domain).push(cap);
  }
  const skillById = new Map(skills.map((s) => [s.id, s]));
  const capById = new Map(capabilities.map((c) => [c.id, c]));

  const dashboard = domains
    .map((domain) => {
      const caps = capsByDomain.get(domain.id) ?? [];
      const counts = { draft: 0, reviewed: 0, ratified: 0 };
      for (const cap of caps) counts[statusOf(cap)] += 1;
      return `
        <article class="dash-card">
          <header>
            <a href="#domain-${esc(domain.id)}">${esc(domain.name)}</a>
            ${badge(statusOf(domain))}
          </header>
          ${bar(counts)}
          <p class="meta">${caps.length} ${caps.length === 1 ? "capability" : "capabilities"} · ${counts.draft} draft · ${counts.reviewed} reviewed · ${counts.ratified} ratified</p>
        </article>`;
    })
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
                `<li><a href="#capability-${esc(cap.id)}">${esc(cap.name)}</a> ${badge(statusOf(cap))}</li>`,
            )
            .join("")}</ul>`
        : `<p class="muted">No capabilities in this domain yet.</p>`;
      return `
        <article class="block" id="domain-${esc(domain.id)}">
          <header>
            <h3>${esc(domain.name)}</h3>
            ${badge(statusOf(domain))}
          </header>
          ${paragraphs(domain.description)}
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
            `<li><a href="#skill-${esc(skill.id)}">${esc(skill.name)}</a> ${badge(statusOf(skill))} <span class="meta">${esc((skill.levels ?? []).join(" · "))}</span></li>`,
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
          const label = target?.name ?? state.id;
          return `<li><span class="meta">${esc(state.type)}</span> <a href="${href}">${esc(label)}</a> — ${esc(state.when)}</li>`;
        })
        .join("");
      const guardrails = (cap.l1_guardrails ?? [])
        .map((item) => `<li>${esc(item)}</li>`)
        .join("");
      return `
        <article class="block" id="capability-${esc(cap.id)}">
          <header>
            <h3>${esc(cap.name)}</h3>
            ${badge(statusOf(cap))}
          </header>
          <p class="meta">${esc(domain?.name ?? cap.domain)} · ${esc(cap.owner)} · ${esc(cap.source)} · ${esc(cap.last_updated)}</p>
          <h4>Client promise</h4>
          ${paragraphs(cap.core_promise)}
          <div class="split">
            <div>
              <h4>Client outcome</h4>
              ${paragraphs(cap.client_outcome)}
            </div>
            <div>
              <h4>How the client experiences it</h4>
              ${paragraphs(cap.client_how)}
            </div>
          </div>
          <h4>How we deliver it</h4>
          ${paragraphs(cap.spark_how)}
          <h4>Default state</h4>
          ${paragraphs(cap.default_state)}
          <h4>L1 guardrails</h4>
          ${guardrails ? `<ul>${guardrails}</ul>` : `<p class="muted">None yet — cannot be ratified.</p>`}
          <h4>Skills (${(cap.skills ?? []).length}/10)</h4>
          ${skillList ? `<ul class="plain">${skillList}</ul>` : `<p class="muted">No skills linked.</p>`}
          ${exceptions ? `<h4>Exception states</h4><ul>${exceptions}</ul>` : ""}
        </article>`;
    })
    .join("");

  const roleSections = roles
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((role) => {
      const owned = (role.owned_capabilities ?? [])
        .map((id) => capById.get(id))
        .filter(Boolean)
        .map(
          (cap) =>
            `<li><a href="#capability-${esc(cap.id)}">${esc(cap.name)}</a> ${badge(statusOf(cap))} <span class="meta">Owner</span></li>`,
        )
        .join("");
      const executable = (role.executable_capabilities ?? [])
        .map((item) => ({ ...item, cap: capById.get(item.id) }))
        .map((item) => {
          const name = item.cap?.name ?? item.id;
          return `<li><a href="#capability-${esc(item.id)}">${esc(name)}</a> ${item.cap ? badge(statusOf(item.cap)) : ""} <span class="meta">${esc(item.required_level)}</span></li>`;
        })
        .join("");
      return `
        <article class="block" id="role-${esc(role.id)}">
          <header>
            <h3>${esc(role.name)}</h3>
            ${badge(statusOf(role))}
          </header>
          ${paragraphs(role.description)}
          <div class="split">
            <div>
              <h4>Owned (${(role.owned_capabilities ?? []).length}/2)</h4>
              ${owned ? `<ul class="plain">${owned}</ul>` : `<p class="muted">None</p>`}
            </div>
            <div>
              <h4>Executable (${(role.executable_capabilities ?? []).length}/7)</h4>
              ${executable ? `<ul class="plain">${executable}</ul>` : `<p class="muted">None</p>`}
            </div>
          </div>
          <h4>Demand literacy</h4>
          ${paragraphs(role.demand_literacy)}
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
          <td>${esc(skill.type.replace("_", " "))}</td>
          <td>${skill.is_automated ? "Yes" : "No"}</td>
          <td>${esc((skill.levels ?? []).join(", "))}</td>
          <td>${usedBy}</td>
        </tr>`;
    })
    .join("");

  const levelCards = (levels.execution_levels ?? [])
    .map(
      (level) => `
        <article class="level">
          <h3>${esc(level.id)} · ${esc(level.name)}</h3>
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
      --bg: #f4f1ea;
      --paper: #fffcf6;
      --ink: #161616;
      --muted: #5e5a53;
      --line: #d9d3c7;
      --draft: #7a5b00;
      --draft-bg: #ffe08a;
      --reviewed: #0a4b86;
      --reviewed-bg: #c5def6;
      --ratified: #0b5a32;
      --ratified-bg: #bfe8c9;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      color: var(--ink);
      background: var(--bg);
      font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    a { color: inherit; }
    header.top {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem 1.25rem;
      align-items: center;
      justify-content: space-between;
      padding: 0.85rem 1.25rem;
      background: var(--ink);
      color: #f7f4ee;
    }
    header.top strong { font-size: 0.95rem; letter-spacing: 0.02em; }
    nav { display: flex; flex-wrap: wrap; gap: 0.9rem; }
    nav a { color: #f7f4ee; text-decoration: none; font-size: 0.9rem; }
    nav a:hover { text-decoration: underline; }
    main { max-width: 1100px; margin: 0 auto; padding: 1.5rem 1.25rem 4rem; }
    section { margin: 2.5rem 0; }
    h1 { font-size: 2rem; line-height: 1.2; margin: 0 0 0.5rem; }
    h2 { font-size: 1.35rem; margin: 0 0 1rem; padding-bottom: 0.4rem; border-bottom: 1px solid var(--line); }
    h3 { font-size: 1.1rem; margin: 0; }
    h4 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; margin: 1.1rem 0 0.35rem; color: var(--muted); }
    p { margin: 0.4rem 0; }
    .lede { max-width: 42rem; color: var(--muted); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0.9rem; }
    .dash-card, .block, .level {
      background: var(--paper);
      border: 1px solid var(--line);
      padding: 1rem 1.1rem;
    }
    .dash-card header, .block header {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      align-items: baseline;
      margin-bottom: 0.6rem;
    }
    .bar {
      display: flex;
      height: 10px;
      background: #ece7dc;
      overflow: hidden;
    }
    .bar.empty { align-items: center; height: auto; background: transparent; color: var(--muted); font-size: 0.85rem; }
    .seg-draft { background: var(--draft-bg); }
    .seg-reviewed { background: var(--reviewed-bg); }
    .seg-ratified { background: var(--ratified-bg); }
    .badge {
      display: inline-block;
      padding: 0.1rem 0.45rem;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      vertical-align: middle;
    }
    .badge-draft { background: var(--draft-bg); color: var(--draft); }
    .badge-reviewed { background: var(--reviewed-bg); color: var(--reviewed); }
    .badge-ratified { background: var(--ratified-bg); color: var(--ratified); }
    .meta, .muted { color: var(--muted); font-size: 0.9rem; }
    .split { display: grid; grid-template-columns: 1fr; gap: 0.8rem; }
    @media (min-width: 720px) { .split { grid-template-columns: 1fr 1fr; } }
    ul.plain { list-style: none; padding: 0; margin: 0; }
    ul.plain li, ul li { margin: 0.35rem 0; }
    table { width: 100%; border-collapse: collapse; background: var(--paper); }
    th, td { text-align: left; vertical-align: top; padding: 0.75rem 0.7rem; border-bottom: 1px solid var(--line); }
    th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
    td .muted p { margin: 0.3rem 0 0; }
    footer { margin-top: 3rem; color: var(--muted); font-size: 0.85rem; }
  </style>
</head>
<body>
  <header class="top">
    <strong>Capability taxonomy</strong>
    <nav>
      <a href="#overview">Overview</a>
      <a href="#domains">Domains</a>
      <a href="#capabilities">Capabilities</a>
      <a href="#roles">Roles</a>
      <a href="#skills">Skills</a>
    </nav>
  </header>
  <main>
    <section id="overview">
      <h1>Operating model</h1>
      <p class="lede">${esc(levels.description)}</p>
      <div class="grid" style="margin-top:1.25rem">${levelCards}
        <article class="level">
          <h3>${esc(levels.ownership.id)} · ${esc(levels.ownership.name)}</h3>
          ${paragraphs(levels.ownership.description)}
        </article>
      </div>
      <h2 style="margin-top:2rem">Maturity by domain</h2>
      <div class="grid">${dashboard}</div>
    </section>
    <section id="domains">
      <h2>Domains</h2>
      ${domainSections}
    </section>
    <section id="capabilities">
      <h2>Capabilities</h2>
      ${capabilitySections || `<p class="muted">None yet.</p>`}
    </section>
    <section id="roles">
      <h2>Roles</h2>
      ${roleSections || `<p class="muted">None yet.</p>`}
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
  const roles = await loadDir("roles");
  const html = render({ levels, domains, capabilities, skills, roles });
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
