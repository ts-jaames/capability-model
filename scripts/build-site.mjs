#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import {
  PUBLIC_SCOPE,
  REPO_ROOT,
  domainRank,
  loadModel,
  modelView,
  oneLine,
  pilotWindow,
  scopeView,
} from "./model.mjs";

const ROOT = REPO_ROOT;
const PORT = Number(process.env.PORT) || 4173;

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// A blank line in a YAML folded scalar arrives here as a single newline, so
// splitting on one is what lets an author get a paragraph break by leaving a
// blank line. the thing they would expect to work.
function paragraphs(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text
    .split(/\n+/)
    .map((block) => `<p>${esc(block)}</p>`)
    .join("");
}

function badge(status) {
  const label = status ?? "draft";
  // The whole model is draft; suppress the draft (orange) status dot so the
  // page isn't peppered with it. Only non-draft, non-ratified states show a dot.
  if (label === "ratified" || label === "draft") return "";
  return `<span class="status"><i class="dot dot-${esc(label)}"></i></span>`;
}

// One list of pages, each carrying the renderer for its body, so a page is
// added in a single place. The render functions are hoisted declarations.
const PAGES = [
  {
    id: "core-philosophy",
    title: "Core Philosophy",
    file: "index.html",
    main: renderCorePhilosophyMain,
  },
  {
    id: "capability-model",
    title: "Capability Model",
    file: "capability-model.html",
    main: renderCapabilityModelMain,
  },
  {
    id: "roles-titles",
    title: "Roles & Titles",
    file: "roles-titles.html",
    main: renderRolesMain,
  },
  {
    id: "operating-view",
    title: "Operating View",
    file: "operating-view.html",
    main: renderOperatingMain,
  },
  // One SDLC. The strategy page is the what and why, the tactical page is the
  // how. The agentic mode (ADLC) lives inside both rather than beside them.
  {
    id: "ai-sdlc",
    title: "AI-Native SDLC",
    file: "ai-sdlc.html",
    main: renderAiSdlcMain,
  },
  {
    id: "tactical-playbook",
    title: "AI-Native SDLC Tactical",
    file: "tactical-playbook.html",
    main: renderTacticalPlaybookMain,
  },
  {
    id: "new-discovery",
    title: "New Discovery",
    file: "new-discovery.html",
    main: renderNewDiscoveryMain,
  },
  // Standalone pages sit apart from the model: no sidebar, no page list, one
  // link back. They are reached from a single link pinned at the foot of the
  // sidebar rather than from the page list above it.
  {
    id: "confidence-map",
    title: "Status & Pilot Readiness",
    file: "confidence-map.html",
    main: renderConfidenceMapMain,
    footerNote: (model) => model.confidenceMap?.durations_note,
    standalone: true,
  },
];

// Every renderable page, for build output, render lookup, and TOC.
const ALL_PAGES = PAGES;

// Pages that used to exist. The ADLC was folded into the AI-Native SDLC as its
// agentic mode, so the old addresses forward to where that content now lives
// instead of going dead for anyone who bookmarked or linked them.
const REDIRECTS = {
  "adlc.html": "ai-sdlc.html#agentic-mode",
  "adlc-tactical.html": "tactical-playbook.html#agentic-mode",
};

function pagesBase() {
  return String(process.env.PAGES_BASE ?? "").replace(/\/+$/, "");
}

function sitePath(rel) {
  const path = String(rel).replace(/^\/+/, "");
  const base = pagesBase();
  return base ? `${base}/${path}` : path;
}

const TOC_LINK_ICON = `<svg class="link-icon" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6.5 9.5a3.5 3.5 0 0 0 5.28.38l2.12-2.12a3.5 3.5 0 0 0-4.95-4.95L7.8 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M9.5 6.5a3.5 3.5 0 0 0-5.28-.38L2.1 8.24a3.5 3.5 0 0 0 4.95 4.95L8.2 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

function tocLink(href, label) {
  return `<a href="${esc(href)}">${TOC_LINK_ICON}${esc(label)}</a>`;
}

const PAGE_TOC = {
  "core-philosophy": [
    ["#overview", "What this is"],
    ["#principles", "Four principles"],
    ["#where-it-lives", "Where it lives"],
    ["#confidence", "How settled this is"],
  ],
  "capability-model": [
    ["#overview", "Overview"],
    ["#domains", "Domains"],
    ["#capabilities", "Capabilities"],
    ["#scope-leverage", "Scope & Leverage"],
    ["#agent-skills", "Agent Skills"],
  ],
  "roles-titles": [
    ["#overview", "Overview"],
    ["#traditional-mapping", "Traditional to AI-Native"],
    ["#titles", "The 5 titles"],
    ["#sensible-defaults", "Sensible defaults"],
    ["#commercial-stack", "The SOW"],
    ["#how-seats-get-filled", "Filling seats"],
    ["#key-definitions", "Key definitions"],
  ],
  "operating-view": [
    ["#overview", "Overview"],
    ["#intensity", "Intensity"],
    ["#risk-shapes", "Risk shapes"],
    ["#seams", "Seams"],
    ["#change-response", "When work changes"],
  ],
  "ai-sdlc": [
    ["#overview", "Overview"],
    ["#agentic-mode", "One pipeline, one fork"],
    ["#pipeline", "Pipeline"],
    ["#how-stages-and-risk-work", "Stages vs risk shapes"],
    ["#principles", "Principles, both modes"],
    ["#stage-0", "0 · Intent Framing"],
    ["#stage-1", "1 · Evidence Gate"],
    ["#stage-2", "2 · Design"],
    ["#stage-3", "3 · Build"],
    ["#stage-4", "4 · Test"],
    ["#stage-5", "5 · Deploy"],
    ["#stage-6", "6 · Maintain"],
    ["#agentic-alignment", "Agentic · Added principles"],
    ["#agentic-shifts", "Agentic · Core shifts"],
    ["#agentic-commercial", "Agentic · Commercial model"],
    ["#domains-across", "Domains across stages"],
    ["#gaps", "Known gaps"],
  ],
  "tactical-playbook": [
    ["#overview", "Overview"],
    ["#agentic-mode", "Agentic mode"],
    ["#anthropic-mapping", "Anthropic mapping"],
    ["#tactical-0", "0 · Intent Framing"],
    ["#tactical-1", "1 · Evidence Gate"],
    ["#tactical-2", "2 · Design"],
    ["#tactical-3", "3 · Build"],
    ["#tactical-4", "4 · Test"],
    ["#tactical-5", "5 · Deploy"],
    ["#tactical-6", "6 · Maintain"],
    ["#agentic-tooling", "Agentic · Tooling layers"],
    ["#agentic-repo", "Agentic · Repo structure"],
    ["#agentic-principles", "Agentic · Operating principles"],
    ["#reconciliation", "Reconciliation log"],
    ["#open-gaps", "Open gaps"],
  ],
  "new-discovery": [
    ["#overview", "Overview"],
    ["#process", "The default process"],
    ["#variants", "What can change"],
    ["#delivers", "What discovery delivers"],
  ],
};

function pageToc(pageId) {
  const links = PAGE_TOC[pageId] ?? [["#overview", "Overview"]];
  return links.map(([href, label]) => tocLink(href, label)).join("\n        ");
}

// The links pinned at the foot of the sidebar: pages that live apart from the
// model rather than inside it.
function renderFootLinks() {
  return PAGES.filter((item) => item.standalone)
    .map((item) => `<a class="page-link" href="${esc(item.file)}">${esc(item.title)}</a>`)
    .join("\n        ");
}

function renderPageLinks(pageId) {
  return PAGES.filter((item) => !item.standalone)
    .map((item) => {
      const active = item.id === pageId;
      const href = active ? "#overview" : item.file;
      const current = active ? ' aria-current="page"' : "";
      return `<a class="page-link"${current} href="${esc(href)}">${esc(item.title)}</a>`;
    })
    .join("\n        ");
}

function sortDomains(items) {
  return [...items].sort(
    (a, b) => domainRank(a.id) - domainRank(b.id) || a.name.localeCompare(b.name),
  );
}

function kv(title, inner) {
  return `<div class="kv"><div class="label">${esc(title)}</div><div class="kv-body">${inner}</div></div>`;
}

function agentSkillChip(id, href) {
  const chip = `<code class="agent-skill">${esc(id)}</code>`;
  return href ? `<a class="agent-skill-link" href="${esc(href)}">${chip}</a>` : chip;
}

function levelLegendMap(levels) {
  const map = new Map();
  for (const level of levels?.execution_levels ?? []) {
    if (level?.id) map.set(level.id, level);
  }
  return map;
}

function levelRow(tag, body, cls = "") {
  return `<div class="lvl-row${cls ? ` ${cls}` : ""}"><span class="lvl-tag mono">${esc(tag)}</span><div class="lvl-content">${body}</div></div>`;
}

// The Levels block. Level prose comes from YAML only: authored copy for
// `specific` capabilities, and the single firm ladder (levels.yaml) for
// `standard-ladder` ones. never hardcoded per-capability prose here.
function renderLevelsBlock(cap, legend) {
  const mode = cap.levels_mode === "specific" ? "specific" : "standard-ladder";
  const badgeText = mode === "specific" ? "capability-specific" : "standard ladder";
  const isL2Floor = Object.hasOwn(cap, "not_at_l1");
  const capLevels = cap.levels ?? {};

  let l1Row;
  if (isL2Floor) {
    const reason = esc(oneLine(cap.not_at_l1));
    l1Row = levelRow(
      "L1",
      `<p class="lvl-no-l1"><span class="lvl-no-l1-tag">No L1</span>${reason}</p>`,
      "is-reason",
    );
  } else {
    const chips = (cap.l1_guardrails ?? [])
      .map((item) => `<code class="guardrail-chip">${esc(item)}</code>`)
      .join("");
    const boundary = cap.l1_l2_boundary
      ? `<p class="lvl-boundary">${esc(oneLine(cap.l1_l2_boundary))}</p>`
      : "";
    l1Row = levelRow(
      "L1",
      `${chips ? `<div class="guardrail-chips">${chips}</div>` : ""}${boundary}`,
    );
  }

  const specificRow = (tag) =>
    levelRow(tag, `<p>${esc(oneLine(capLevels[tag]))}</p>`);

  const ladderRow = (tag) => {
    const name = esc(legend.get(tag)?.name ?? "");
    return levelRow(
      tag,
      `<a class="lvl-ladder" href="#capabilities">${name}</a><span class="lvl-ladder-note"> · standard ladder</span>`,
      "is-ladder",
    );
  };

  const l2Row = mode === "specific" ? specificRow("L2") : ladderRow("L2");
  const l3Row = mode === "specific" ? specificRow("L3") : ladderRow("L3");

  return kv(
    "Levels",
    `<div class="levels-block" data-mode="${mode}">
          <div class="levels-block-head"><span class="lvl-mode lvl-mode-${mode}">${esc(badgeText)}</span></div>
          <div class="lvl-rows">${l1Row}${l2Row}${l3Row}</div>
        </div>`,
  );
}

// The Scope & Leverage block. Like Levels, it reads YAML only. Every field is
// optional and an absent one is simply not yet defined, so the card shows each
// part's own state: a capability can be half reasoned through, and the page
// should say which half. With nothing defined at all, the whole block is the
// gap, on purpose: "no indication of size" should be impossible to miss.
const SCOPE_CLAIMS = ["unit_definition", "scales_with_scope", "leverage_by_level", "concurrency"];
const CONCURRENCY_MEANING = {
  concurrent: "All units must be active at the same time. The timeline gives no relief.",
  sequenceable:
    "Units can take turns. The same people can cover more of them, and the calendar gets longer.",
};
const GAP = `<span class="lvl-no-l1-tag">not yet defined</span>`;

function hasScopeClaims(cap) {
  const block = cap.scope_decomposition;
  return Boolean(block && SCOPE_CLAIMS.some((key) => block[key] !== undefined));
}

function renderScopeBlock(cap) {
  const block = cap.scope_decomposition;
  const question = block?.open_question
    ? `<p class="line-note">Open question: ${esc(oneLine(block.open_question))}</p>`
    : "";
  if (!hasScopeClaims(cap)) {
    return kv(
      "Scope & Leverage",
      `<div class="levels-block" data-mode="undefined">
          <div class="levels-block-head"><span class="lvl-mode lvl-mode-standard-ladder">not yet defined</span></div>
          <p>This capability has not had a scope pass yet. Sizing defaults to word of mouth. <a href="#scope-leverage">How scope is counted</a></p>
          ${question}
        </div>`,
    );
  }

  const unit = block.unit_definition ? esc(oneLine(block.unit_definition)) : GAP;
  const scales =
    block.scales_with_scope === false
      ? `<p class="line-note">Does not grow with scope: one per engagement regardless of size.</p>`
      : "";
  const leverage = block.leverage_by_level
    ? `<div class="lvl-rows">${["L1", "L2", "L3", "L4"]
        .map((tag) => {
          const n = block.leverage_by_level[tag];
          return levelRow(tag, `<p>${n} ${n === 1 ? "unit" : "units"}</p>`);
        })
        .join("")}</div>`
    : `<p>${GAP}</p>`;
  const concurrency = block.concurrency
    ? `<p><span class="mono">${esc(block.concurrency)}</span>. ${esc(CONCURRENCY_MEANING[block.concurrency] ?? "")}</p>`
    : `<p>${GAP}</p>`;
  const prompts = block.intake_prompts ?? {};
  const asked = [
    ["Units", prompts.scope_units],
    ["Concurrency", prompts.concurrency],
  ]
    .filter(([, text]) => text)
    .map(([label, text]) => `<p><strong>${label}.</strong> ${esc(oneLine(text))}</p>`)
    .join("");
  const notes = block.notes ? `<p class="line-note">${esc(oneLine(block.notes))}</p>` : "";
  return kv(
    "Scope & Leverage",
    `<div class="levels-block" data-mode="defined">
          <div class="levels-block-head"><span class="lvl-mode lvl-mode-specific">${esc(block.confidence ?? "")}</span><a href="#scope-leverage">How scope is counted</a></div>
          <p><strong>Unit.</strong> ${unit}</p>
          ${scales}
          <p><strong>Leverage by level.</strong></p>
          ${leverage}
          <p><strong>Concurrency.</strong></p>
          ${concurrency}
          ${asked ? `<p><strong>Intake questions</strong></p>${asked}` : ""}
          ${notes}
          ${question}
        </div>`,
  );
}

// A seat rule between two capabilities, shown on both cards. The rule is a
// policy gate: it overrides any sequencing or allocation, so the card says so
// rather than leaving a staffing option open that the policy already forbids.
function renderSeatRule(cap, capsById) {
  const rules = cap.segregated_from ?? [];
  if (!rules.length) return "";
  const body = rules
    .map(
      (rule) =>
        `<p>Cannot share a seat with ${capLink(rule.capability, capsById)}. ${esc(oneLine(rule.reason))}</p>`,
    )
    .join("");
  return kv("Seat rule", body);
}

function renderCap(cap, domains, legend, capsById) {
  const domain = domains.find((d) => d.id === cap.domain);
  const skillChips = (cap.agent_skills ?? [])
    .map((item) => item?.name)
    .filter(Boolean)
    .map((id) => agentSkillChip(id, `#agent-skill-${id}`))
    .join("");
  return `
    <article class="row" id="capability-${esc(cap.id)}">
      <header class="row-head">
        <h3 class="domain-name">${esc(cap.name)}</h3>
        <div class="row-meta">
          <span class="mono">${esc(domain?.name ?? cap.domain)}</span>
          ${badge(cap.status)}
        </div>
      </header>
      <div class="kvs">
        ${kv("Core promise", `<p>${esc(oneLine(cap.promise))}</p>`)}
        ${kv("Client experience", `<p>${esc(oneLine(cap.client_experience))}</p>`)}
        ${kv("Sparq How", paragraphs(cap.sparq_how))}
        ${renderLevelsBlock(cap, legend)}
        ${renderScopeBlock(cap)}
        ${renderSeatRule(cap, capsById)}
        ${kv(
          "Agent Skills",
          skillChips
            ? `<div class="agent-skills">${skillChips}</div>`
            : `<p>None assessed.</p>`,
        )}
      </div>
    </article>`;
}

function capLink(id, capsById) {
  const cap = capsById.get(id);
  const label = esc(cap?.name ?? id);
  return cap ? `<a href="capability-model.html#capability-${esc(id)}">${label}</a>` : label;
}

function ownsLink(ref, capsById, domainsById) {
  if (!ref?.domain) return capLink(ref?.capability, capsById);
  const domain = domainsById.get(ref.domain);
  const label = esc(domain?.name ?? ref.domain);
  const link = domain
    ? `<a href="capability-model.html#domain-${esc(ref.domain)}">${label}</a>`
    : label;
  return `${link} <span class="dim">(whole domain)</span>`;
}

function renderTitle(title, capsById, domainsById) {
  const owns = (title.owns ?? [])
    .map((ref) => ownsLink(ref, capsById, domainsById))
    .join(", ");
  return `
    <article class="row" id="title-${esc(title.id)}">
      <header class="row-head">
        <h3 class="domain-name">${esc(title.name)}</h3>
      </header>
      <div class="prose"><p>${esc(oneLine(title.description))}</p></div>
      <div class="kvs">
        ${kv("Owns", `<p>${owns}</p>`)}
        ${kv("Executes", `<p>${esc(oneLine(title.executes))}</p>`)}
      </div>
      ${title.note ? `<p class="line-note">${esc(oneLine(title.note))}</p>` : ""}
    </article>`;
}

// The Title · Ownership · Seat layers are the definition store rendered, not a
// second copy of it, so the page cannot drift from `definitions/`.
function renderLayer(definition) {
  const nots = (definition.not ?? [])
    .map((item) => `<li>${esc(oneLine(item))}</li>`)
    .join("");
  return `
    <article class="row" id="layer-${esc(definition.id)}">
      <header class="row-head">
        <h3 class="domain-name">${esc(definition.term)}</h3>
      </header>
      <div class="prose">${paragraphs(definition.definition)}</div>
      ${nots ? `<div class="kvs">${kv("Not", `<ul class="bullets">${nots}</ul>`)}</div>` : ""}
    </article>`;
}

// `plain` is for pages meant to be read straight through: file names get the
// orange file-ref styling, and the Never / Invokes lines stay in ink rather
// than the dim grey the model pages use for secondary detail.
function renderDoctrineStep(step, index, capsById, { plain = false } = {}) {
  const text = (value) => (plain ? fileRefs(esc(oneLine(value))) : esc(oneLine(value)));
  const side = plain ? "line-note" : "dim";
  const never = step.never
    ? `<p class="${side}">Never: ${text(step.never)}</p>`
    : "";
  const caps = (step.capabilities ?? []).length
    ? `<p class="${side}">Invokes: ${step.capabilities.map((id) => capLink(id, capsById)).join(", ")}</p>`
    : "";
  return kv(
    `${index + 1} · ${oneLine(step.name)}`,
    `<p>${text(step.description)}</p>${never}${caps}`,
  );
}

function renderDoctrine(doctrine, capsById, { heading = false } = {}) {
  const steps = (doctrine.steps ?? [])
    .map((step, index) => renderDoctrineStep(step, index, capsById))
    .join("");
  const notes = [doctrine.rule, doctrine.closing_note]
    .filter(Boolean)
    .map((note) => `<p class="line-note">${esc(oneLine(note))}</p>`)
    .join("");
  return `
    <article class="row" id="doctrine-${esc(doctrine.id)}">
      ${heading ? `<header class="row-head"><h3 class="domain-name">${esc(doctrine.name)}</h3></header>` : ""}
      <div class="prose"><p>${esc(oneLine(doctrine.summary))}</p></div>
      <div class="kvs">${steps}</div>
      ${notes}
    </article>`;
}

function byId(items, key = "id") {
  return new Map(items.map((item) => [item[key], item]));
}

function requireDoctrine(model, id) {
  const found = model.doctrine.find((item) => item.id === id);
  if (!found) throw new Error(`Missing doctrine: ${id}`);
  return found;
}

function dialChip(dialId, dials) {
  const legend = dials.find((item) => item.id === dialId);
  return `<span class="dial dial-${esc(dialId)}" title="${esc(oneLine(legend?.description))}">${esc(legend?.name ?? dialId)}</span>`;
}

function renderShape(shape, capsById, dials) {
  const rows = (shape.fires ?? [])
    .map((item) => {
      const cap = capsById.get(item.capability);
      const label = esc(cap?.name ?? item.capability);
      const link = cap
        ? `<a href="capability-model.html#capability-${esc(item.capability)}">${label}</a>`
        : label;
      const note = item.note ? ` <span class="dim">(${esc(oneLine(item.note))})</span>` : "";
      return `<li><span class="fires-cap">${link}${note}</span>${dialChip(item.dial, dials)}</li>`;
    })
    .join("");
  return `
    <article class="row" id="${esc(shape.id)}">
      <header class="row-head">
        <h3 class="domain-name">${esc(shape.name)}</h3>
      </header>
      <div class="prose"><p><em>${esc(oneLine(shape.question))}</em></p></div>
      <div class="kvs">
        ${kv("Activates", `<ul class="fires">${rows}</ul>`)}
        ${kv("Produces", `<p>${esc(oneLine(shape.output))}</p>`)}
      </div>
    </article>`;
}

function refLabel(ref, capsById, domainsById) {
  if (ref?.capability) return capsById.get(ref.capability)?.name ?? ref.capability;
  if (ref?.domain) return domainsById.get(ref.domain)?.name ?? ref.domain;
  return "";
}

// Seams read in loop order (Commercial → Framing → Building → Proof → Commercial),
// derived from where each end sits in DOMAIN_ORDER rather than an authored rank.
function refDomainIndex(ref, capsById) {
  return domainRank(ref?.domain ?? capsById.get(ref?.capability ?? "")?.domain);
}

function renderSeam(seam, capsById, domainsById) {
  const arrow = seam.direction === "two-way" ? "↔" : "→";
  const name = `${refLabel(seam.from, capsById, domainsById)} ${arrow} ${refLabel(seam.to, capsById, domainsById)}`;
  return `
    <article class="row" id="${esc(seam.id)}">
      <header class="row-head">
        <h3 class="domain-name">${esc(name)}</h3>
      </header>
      <div class="kvs">
        ${kv("Crosses", `<p>${esc(oneLine(seam.what_crosses))}</p>`)}
        ${kv("Not", `<p>${esc(oneLine(seam.not))}</p>`)}
        ${kv("Violated by", `<p>${esc(oneLine(seam.violated_by))}</p>`)}
      </div>
    </article>`;
}

function renderRolesMain(model) {
  const { titles, capabilities, domains, definitions, lifecycles } = model;
  const capsById = byId(capabilities);
  const domainsById = byId(domains);
  const definitionsById = byId(definitions);

  // Traditional-to-AI-Native mapping table
  const mappingRows = [...titles]
    .sort((a, b) => (a.reading_order ?? 99) - (b.reading_order ?? 99))
    .flatMap((title) =>
      (title.replaces ?? []).map((trad) =>
        `<tr><td>${esc(trad)}</td><td><strong>${esc(title.name)}</strong></td></tr>`,
      ),
    )
    .join("");

  // Title cards
  const titleCards = [...titles]
    .sort((a, b) => (a.reading_order ?? 99) - (b.reading_order ?? 99))
    .map((title) => {
      const owns = (title.owns ?? [])
        .map((ref) => ownsLink(ref, capsById, domainsById))
        .join(", ");
      const replaces = (title.replaces ?? []).length
        ? `<p class="lede">${esc("Replaces: " + title.replaces.join(", "))}</p>`
        : "";
      const defaults = (title.default_executes ?? [])
        .map((d) => {
          const cap = capsById.get(d.capability);
          const label = cap ? cap.name : d.capability;
          return `<li>${esc(label)} @ ${esc(d.level)}</li>`;
        })
        .join("");
      // A title that owns or executes by default both sides of a seat rule
      // suggests a staffing the rule forbids. Name it; resolving it is a
      // decision about the title, not something the page quietly drops.
      const covered = new Set([
        ...(title.owns ?? []).flatMap((ref) =>
          ref?.domain
            ? [...capsById.values()].filter((cap) => cap.domain === ref.domain).map((cap) => cap.id)
            : [ref?.capability],
        ),
        ...(title.default_executes ?? []).map((d) => d.capability),
      ]);
      const clashes = [];
      for (const id of covered) {
        for (const rule of capsById.get(id)?.segregated_from ?? []) {
          if (covered.has(rule.capability) && id < rule.capability) clashes.push([id, rule.capability]);
        }
      }
      const seatRuleFlag = clashes.length
        ? `<p class="line-note">Seat rule: these defaults cover both sides of a segregated pair (${clashes
            .map(([a, b]) => `${capLink(a, capsById)} and ${capLink(b, capsById)}`)
            .join("; ")}). One person cannot hold both on the same engagement, so the defaults need resolving.</p>`
        : "";
      return `
    <article class="row" id="title-${esc(title.id)}">
      <header class="row-head">
        <h3 class="domain-name">${esc(title.name)}</h3>
      </header>
      ${title.why ? `<div class="prose"><p>${esc(oneLine(title.why))}</p></div>` : ""}
      ${replaces}
      <div class="kvs">
        ${kv("Typically owns", `<p>${owns}</p>`)}
        ${defaults ? kv("Also executes by default", `<ul class="bullets">${defaults}</ul>`) : ""}
      </div>
      ${seatRuleFlag}
    </article>`;
    })
    .join("");

  // RACI matrix from SDLC lifecycle
  const sdlc = (lifecycles ?? []).find((lc) => lc.id === "ai-native-sdlc");
  const titlesById = byId(titles);
  const raciTable = sdlc?.raci
    ? (() => {
        const titleOrder = [...titles].sort(
          (a, b) => (a.reading_order ?? 99) - (b.reading_order ?? 99),
        );
        const stages = sdlc.stages ?? [];
        const headerCells = titleOrder
          .map((t) => `<th>${esc(t.name)}</th>`)
          .join("");
        const rows = (sdlc.raci ?? [])
          .map((entry) => {
            const stage = stages.find((s) => s.number === entry.stage);
            const stageName = stage ? `${stage.number} · ${stage.name}` : String(entry.stage);
            const cells = titleOrder
              .map((t) => {
                const a = (entry.assignments ?? []).find((x) => x.title === t.id);
                return `<td>${a ? esc(a.designation) : ""}</td>`;
              })
              .join("");
            return `<tr><td><strong>${esc(stageName)}</strong></td>${cells}</tr>`;
          })
          .join("");
        return `
        <div class="scroll-x">
        <table class="hairline-table">
          <thead><tr><th>Stage</th>${headerCells}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
        </div>`;
      })()
    : "";

  // Key definitions
  const stack = requireDoctrine(model, "commercial-stack");
  const fulfilment = requireDoctrine(model, "seat-fulfilment");

  const layer = (id) => {
    const definition = definitionsById.get(id);
    if (!definition) throw new Error(`Missing definition: ${id}`);
    return renderLayer(definition);
  };

  const defLayers = [
    layer("level"),
    layer("seat"),
    layer("consultant-band"),
  ].join("");

  return `
      <section id="overview">
        <h1 class="mono uppercase eyebrow">Roles & Titles</h1>
        <p class="lede">Capabilities are the contract. Seats are the fulfillment. Titles are internal coverage.</p>
        <p class="lede">The SOW sells an outcome, priced from the capabilities-at-levels underneath it, never headcount and never a title. A title is internal shorthand for a kind of practitioner: the person who typically owns a coherent bundle of capabilities. It groups coverage; it is not a thing a client buys.</p>
      </section>

      <section id="traditional-mapping">
        <h2 class="mono uppercase eyebrow">Traditional to AI-Native</h2>
        <p class="lede">14 traditional titles compress into 5. Language and platform distinctions collapse in AI-native delivery; what matters is the capability, not the stack.</p>
        <table class="hairline-table">
          <thead><tr><th>Traditional title</th><th>AI-Native title</th></tr></thead>
          <tbody>${mappingRows}</tbody>
        </table>
        <p class="lede">Solution Consultants and Delivery Partners remain as pre-engagement commercial roles, working alongside the Product Architect on the commercial envelope.</p>
        <p class="lede">* <strong>Data Visualization</strong> is not yet mapped. Its current project footprint and capability alignment need to be assessed before assigning it to a title.</p>
      </section>

      <section id="titles">
        <h2 class="mono uppercase eyebrow">The 5 titles</h2>
        <p class="lede">Each title is a kind of practitioner, defined by a bundle of capabilities one person can own together. Two people with the same title are not interchangeable. Every capability sits under exactly one title.</p>
        <div class="stack">
        ${titleCards}
        </div>
      </section>

      <section id="sensible-defaults">
        <h2 class="mono uppercase eyebrow">Sensible defaults by stage</h2>
        <p class="lede">Each column is the person holding that title. The matrix shows where they typically lead, contribute, or are informed, derived from which capabilities are primary at each stage. These are sensible defaults, not fixed assignments. On a given engagement, the named L4 owner of a capability that fires in a stage can override the default for that capability.</p>
        <p class="lede">R: typically drives and produces. A: typically signs off. C: typically contributes context. I: typically informed on output.</p>
        ${raciTable}
      </section>

      <section id="commercial-stack">
        <h2 class="mono uppercase eyebrow">${esc(stack.name)}</h2>
        <div class="stack">
        ${renderDoctrine(stack, capsById)}
        </div>
      </section>

      <section id="how-seats-get-filled">
        <h2 class="mono uppercase eyebrow">How seats get filled</h2>
        <p class="lede">Seats are read off the contract as capabilities at levels. How many seats of one capability a level needs depends on how big the work is, which is counted in scope units. Build and QA are segregated: one person cannot hold Product & interface building and Validation & testing on the same engagement, whatever the scheduling says.</p>
        ${to("capability-model.html#scope-leverage", "Scope & Leverage")}
        <div class="stack">
        ${renderDoctrine(fulfilment, capsById)}
        </div>
      </section>

      <section id="key-definitions">
        <h2 class="mono uppercase eyebrow">Key definitions</h2>
        <div class="stack">
        ${defLayers}
        </div>
      </section>`;
}

function renderOperatingMain(model) {
  const { intensity, riskShapes, seams: seamRecords, capabilities, domains } = model;
  const dials = intensity?.dials ?? [];
  const capsById = new Map(capabilities.map((cap) => [cap.id, cap]));
  const domainsById = new Map(domains.map((domain) => [domain.id, domain]));

  const shapes = [...riskShapes]
    .sort((a, b) => (a.reading_order ?? 99) - (b.reading_order ?? 99))
    .map((shape) => renderShape(shape, capsById, dials))
    .join("");

  const seams = [...seamRecords]
    .sort(
      (a, b) =>
        refDomainIndex(a.from, capsById) - refDomainIndex(b.from, capsById) ||
        refDomainIndex(a.to, capsById) - refDomainIndex(b.to, capsById) ||
        a.id.localeCompare(b.id),
    )
    .map((seam) => renderSeam(seam, capsById, domainsById))
    .join("");

  const dialRows = dials
    .map(
      (dial) =>
        `<tr>
              <td><strong>${esc(dial.name)}</strong></td>
              <td>${esc(oneLine(dial.description))}</td>
            </tr>`,
    )
    .join("");

  const dialsDraft = riskShapes.some((shape) => shape.dials_reviewed !== true);

  const questionRows = (intensity?.risk_questions ?? [])
    .map(
      (item) =>
        `<tr>
              <td><strong>${esc(oneLine(item.question))}</strong></td>
              <td>${esc(item.answers_to === "level" ? "Level" : "Intensity")}</td>
              <td>${esc(oneLine(item.behaviour))}</td>
            </tr>`,
    )
    .join("");

  const change = requireDoctrine(model, "change-response");

  return `
      <section id="overview">
        <h1 class="mono uppercase eyebrow">Operating View</h1>
        <p class="lede">Risk decides which capabilities run and how hot. Contracts decide how their work flows on. This page defines both.</p>
      </section>
      <section id="intensity">
        <h2 class="mono uppercase eyebrow">Intensity</h2>
        <p class="lede">Every capability sits on a four-step dial at all times. The live risk mix moves the dials.</p>
        <p class="lede">A risk is two questions, and they answer to different scales. Conflating them is what makes a risk register unreadable.</p>
        <table class="hairline-table">
          <thead>
            <tr>
              <th>Question</th>
              <th>Answers to</th>
              <th>Behaviour</th>
            </tr>
          </thead>
          <tbody>
            ${questionRows}
          </tbody>
        </table>
        <p class="lede">${esc(oneLine(intensity?.dial_placement))}</p>
        <table class="hairline-table">
          <thead>
            <tr>
              <th>Step</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            ${dialRows}
          </tbody>
        </table>
        <p class="lede">${esc(oneLine(intensity?.floor_note))}</p>
      </section>
      <section id="risk-shapes">
        <h2 class="mono uppercase eyebrow">Risk shapes</h2>
        <p class="lede">The recurring kinds of "riskiest unknown." Each names an unknown, activates a set of capabilities at a dial, and produces an output that becomes available as input to whatever fires next. Shapes co-occur, recur, and persist; the order they fire in is not fixed.</p>
        ${dialsDraft ? `<p class="line-note">Dial values are authored drafts. They have not been reviewed, and no page or document recorded them before now.</p>` : ""}
        <div class="stack">
        ${shapes}
        </div>
      </section>
      <section id="seams">
        <h2 class="mono uppercase eyebrow">Seams</h2>
        <p class="lede">The load-bearing handoffs between capabilities. A seam is the interface between two capabilities: what must cross, in what form. This is the floor, the minimum for a valid handoff. It holds regardless of tool; AI carries the artifact across, judgment decides whether what crossed is right.</p>
        <div class="stack">
        ${seams}
        </div>
      </section>
      <section id="change-response">
        <h2 class="mono uppercase eyebrow">${esc(change.name)}</h2>
        <div class="stack">
        ${renderDoctrine(change, capsById)}
        </div>
      </section>`;
}

function to(href, label) {
  return `<p class="to"><a href="${esc(href)}">${esc(label)} →</a></p>`;
}


function requireLifecycle(model, id) {
  const found = (model.lifecycles ?? []).find((lc) => lc.id === id);
  if (!found) throw new Error(`Missing lifecycle: ${id}`);
  return found;
}

// Wrap file references like intent.md, spec.md, plan.md in styled spans.
// One Output card, used everywhere an output is shown, so the label, width and
// file chip cannot drift apart between pages. `file` and `text` arrive as HTML.
// With no file there is no chip, only the text.
function outputCard({ file = "", text = "" }) {
  return `<div class="stage-output"><span class="callout-label">Output</span><div class="stage-output-body">${file ? `<span class="stage-output-file">${file}</span>` : ""}<span>${text}</span></div></div>`;
}

// What an agentic overlay adds to the stage's own artifact. The stage already
// shows its artifact in its own Output card, so the callout names only what is
// new and never repeats a file the reader has just seen. Items are compared
// without a "raw " prefix or a trailing "(...)" qualifier.
function artifactKey(item) {
  return item.replace(/\s*\(.*\)\s*$/, "").replace(/^raw\s+/i, "").trim().toLowerCase();
}
function addedArtifacts(base, agentic) {
  if (!agentic) return "";
  const have = new Set(String(base ?? "").split(" + ").map(artifactKey));
  return String(agentic)
    .split(" + ")
    .filter((item) => !have.has(artifactKey(item)))
    .join(" + ");
}

function fileRefs(html) {
  return html.replace(
    /\b((?:raw |cleared )?intent\.md|spec\.md|plan\.md|bands\.yaml|REVIEW\.md|CLAUDE\.md)\b/g,
    '<span class="file-ref">$1</span>',
  );
}

function renderStage(stage, ctx = {}) {
  const framingLabel = stage.framing
    ? `<p class="lede"><strong>The artifact: ${fileRefs(esc(stage.artifact))}</strong></p>`
    : "";
  const framingParas = stage.framing
    ? String(stage.framing)
        .trim()
        .split(/\n{2,}/)
        .map((block) => `<p class="lede">${fileRefs(esc(block.replace(/\n/g, " ").trim()))}</p>`)
        .join("")
    : "";
  const framingBullets = (stage.framing_benefits ?? []).length
    ? `<ul class="bullets">${(stage.framing_benefits).map((b) => `<li>${fileRefs(esc(oneLine(b)))}</li>`).join("")}</ul>`
    : "";
  const framingCoda = stage.framing_coda
    ? `<p class="lede">${fileRefs(esc(oneLine(stage.framing_coda)))}</p>`
    : "";
  const entryRoutes = (stage.entry_routes ?? [])
    .map((r) => kv(r.name, `<p>${fileRefs(esc(oneLine(r.description)))}</p>`))
    .join("");
  const infra = stage.infrastructure
    ? kv("Infrastructure", `<p>${fileRefs(esc(oneLine(stage.infrastructure)))}</p>`)
    : "";
  const procedures = (stage.procedures ?? [])
    .map((p) => kv(p.name, `<p>${fileRefs(esc(oneLine(p.description)))}</p>`))
    .join("");
  const practices = (stage.practices ?? [])
    .map((p) => kv(p.name, `<p>${fileRefs(esc(oneLine(p.description)))}</p>`))
    .join("");
  const noteTag = stage.note
    ? `<span class="stage-tag">${esc(oneLine(stage.note))}</span>`
    : "";
  const outputBlock = stage.output
    ? outputCard({ file: fileRefs(esc(stage.artifact)), text: fileRefs(esc(oneLine(stage.output))) })
    : "";
  return `
      <section id="stage-${stage.number}">
        <h2 class="mono uppercase eyebrow">Stage ${stage.number} · ${esc(stage.name)}${noteTag}</h2>
        <p class="lede">${fileRefs(esc(oneLine(stage.objective)))}</p>
        ${framingLabel}
        ${framingParas}
        ${framingBullets}
        ${framingCoda}
        ${entryRoutes ? `<div class="kvs">${entryRoutes}</div>` : ""}
        ${infra || procedures ? `<div class="kvs">${infra}${procedures}</div>` : ""}
        ${practices ? `<div class="kvs">${practices}</div>` : ""}
        ${outputBlock}
        ${renderAgenticOverlay(stage, ctx)}
      </section>`;
}

function renderStageWithTactical(stage) {
  const procedures = (stage.procedures ?? [])
    .map((p) => kv(p.name, `<p>${fileRefs(esc(oneLine(p.description)))}</p>`))
    .join("");
  const tooling = (stage.tooling ?? []).length
    ? kv("Tooling", `<p>${esc(stage.tooling.join("; "))}.</p>`)
    : "";
  const agents = (stage.agents_and_hooks ?? [])
    .map(
      (a) =>
        `<li><strong>${esc(a.name)}</strong>: ${fileRefs(esc(oneLine(a.description)))}</li>`,
    )
    .join("");
  const agentsBlock = agents
    ? kv("Agents & hooks", `<ul class="bullets">${agents}</ul>`)
    : "";
  const noteTag = stage.note
    ? `<span class="stage-tag">${esc(oneLine(stage.note))}</span>`
    : "";
  const outputBlock = stage.output
    ? outputCard({ file: fileRefs(esc(stage.artifact)), text: fileRefs(esc(oneLine(stage.output))) })
    : "";
  return `
      <section id="stage-${stage.number}">
        <h2 class="mono uppercase eyebrow">Stage ${stage.number} · ${esc(stage.name)}${noteTag}</h2>
        <p class="lede">${fileRefs(esc(oneLine(stage.objective)))}</p>
        ${procedures ? `<div class="kvs">${procedures}</div>` : ""}
        ${tooling || agentsBlock ? `<div class="kvs">${tooling}${agentsBlock}</div>` : ""}
        ${outputBlock}
      </section>`;
}

// Splits a YAML folded block into paragraphs. A blank line arrives as a single
// newline, so that is the separator (see paragraphs() above).
function ledeParagraphs(value) {
  return String(value ?? "")
    .trim()
    .split(/\n+/)
    .filter(Boolean)
    .map((block) => `<p class="lede">${fileRefs(esc(oneLine(block)))}</p>`)
    .join("");
}

// What kind of change an agentic overlay is, read off the data. A fork changes
// the stage's shape. Otherwise the stage is additive, and it either adds only
// checks or also adds to its artifact.
function agenticKind(overlay) {
  if (overlay.divergence === "fork") return "fork";
  return overlay.artifact ? "extends" : "adds";
}

// What changes at one stage when the deliverable is itself agentic. It sits
// inside the stage, under the standard content, so the two modes read as one
// pipeline. A fork (Design, Test) is marked and given an orange rule so it
// cannot be skimmed past as a footnote on a shared stage.
function renderAgenticOverlay(stage, ctx = {}) {
  const a = stage.agentic;
  if (!a) return "";
  const fork = a.divergence === "fork";
  const shapeNames = ctx.riskShapeNames ?? new Map();

  const label = `<p class="callout-label agentic-label">Agentic mode${a.name && a.name !== stage.name ? `<span class="agentic-name">${esc(a.name)}</span>` : ""}${
    fork
      ? `<span class="stage-tag">Where the modes fork</span>`
      : agenticKind(a) === "extends"
        ? `<span class="stage-tag">Adds to the artifact</span>`
        : ""
  }</p>`;

  const objective = a.objective ? `<p class="lede">${fileRefs(esc(oneLine(a.objective)))}</p>` : "";
  const framing = a.framing ? ledeParagraphs(a.framing) : "";

  const facts = [
    a.gate ? `<strong>Gate:</strong> ${esc(a.gate)}` : "",
    (a.risk_shapes_hot ?? []).length
      ? `<strong>Adds risk shape:</strong> ${esc(a.risk_shapes_hot.map((id) => shapeNames.get(id) ?? id).join(", "))}`
      : "",
  ].filter(Boolean);
  const factsLine = facts.length
    ? `<p class="agentic-facts">${facts.join(" &nbsp;·&nbsp; ")}</p>`
    : "";

  const procedures = (a.procedures ?? [])
    .map((p) => kv(p.name, `<p>${fileRefs(esc(oneLine(p.description)))}</p>`))
    .join("");

  // Only what the agentic mode adds to the artifact; the stage's own Output
  // card above already names the rest.
  const added = addedArtifacts(stage.artifact, a.artifact);
  const outputBlock =
    a.output || added
      ? outputCard({
          file: added ? fileRefs(esc(added)) : "",
          text: a.output ? fileRefs(esc(oneLine(a.output))) : "",
        })
      : "";

  return `
        <div class="agentic${fork ? " agentic-fork" : ""}">
          ${label}
          ${objective}
          ${framing}
          ${factsLine}
          ${procedures ? `<div class="kvs">${procedures}</div>` : ""}
          ${outputBlock}
        </div>`;
}

function renderAiSdlcMain(model) {
  const lc = requireLifecycle(model, "ai-native-sdlc");
  const mode = lc.agentic_mode;
  const stages = lc.stages ?? [];
  const riskShapeNames = new Map(
    (model.riskShapes ?? []).map((s) => [s.id, s.name]),
  );
  const domainNames = new Map((model.domains ?? []).map((d) => [d.id, d.name]));
  const stageName = (n) => stages.find((s) => s.number === n)?.name ?? String(n);

  // How each stage reads in agentic mode, in one cell. The kind is derived from
  // the overlay, so a stage that adds to its artifact cannot be labeled as
  // "adds checks" alone: forks, adds checks and artifact, or adds checks.
  const agenticCell = (s) => {
    const a = s.agentic;
    if (!a) return "";
    const kind = agenticKind(a);
    const label = kind === "fork" ? "<strong>Forks.</strong>" : kind === "extends" ? "Adds checks and artifact." : "Adds checks.";
    const parts = [label, `${esc(oneLine(a.summary))}`];
    parts.push(a.gate ? `Gate: ${esc(a.gate)}.` : "Same gate.");
    if (a.artifact) parts.push(`Artifact: ${fileRefs(esc(a.artifact))}.`);
    return parts.join(" ");
  };

  const pipelineRows = stages
    .map(
      (s) =>
        `<tr><td><strong>${s.number} · ${esc(s.name)}</strong></td><td>${esc(s.artifact)}</td><td>${esc(s.gate)}</td><td>${agenticCell(s)}</td></tr>`,
    )
    .join("");

  const domainRows = stages
    .map((s) => {
      const primary = domainNames.get(s.primary_domain) ?? "—";
      const secondary = s.secondary_domain
        ? domainNames.get(s.secondary_domain) ?? "—"
        : "—";
      const shapes = (s.risk_shapes_hot ?? [])
        .map((id) => riskShapeNames.get(id) ?? id)
        .join(", ");
      const added = (s.agentic?.risk_shapes_hot ?? [])
        .map((id) => riskShapeNames.get(id) ?? id)
        .join(", ");
      return `<tr><td>${s.number} · ${esc(s.name)}</td><td>${esc(primary)}</td><td>${esc(secondary)}</td><td>${esc(shapes)}</td><td>${esc(added || "—")}</td></tr>`;
    })
    .join("");

  const domainNote = (dn, prefix = "") =>
    `<p class="lede"><strong>${prefix}${esc(domainNames.get(dn.domain) ?? dn.domain)}</strong> ${esc(oneLine(dn.note))}</p>`;
  const domainNotes = (lc.domain_notes ?? []).map((dn) => domainNote(dn)).join("");
  const agenticDomainNotes = (mode?.domain_notes ?? [])
    .map((dn) => domainNote(dn, "In agentic mode, "))
    .join("");

  const gapItems = (lc.gaps ?? [])
    .map((g) => kv(g.name, `<p>${esc(oneLine(g.description))}</p>`))
    .join("");
  const agenticGapItems = (mode?.gaps ?? [])
    .map((g) => kv(g.name, `<p>${esc(oneLine(g.description))}</p>`))
    .join("");

  const stageBlocks = stages.map((s) => renderStage(s, { riskShapeNames })).join("");

  // The fork: one question, asked once at the front, that decides whether the
  // later stages run plain or in agentic mode.
  const forks = stages.filter((s) => s.agentic?.divergence === "fork");
  const additive = stages.filter((s) => s.agentic?.divergence === "additive");
  const extended = additive.filter((s) => agenticKind(s.agentic) === "extends");
  const extendedLinks = extended
    .map((s) => `<a href="#stage-${s.number}">${esc(s.name)}</a>`)
    .join(" and ");
  const forkLinks = forks
    .map((s) => `<a href="#stage-${s.number}">${esc(s.name)}</a>`)
    .join(" and ");
  const modeSection = mode
    ? `
      <section id="agentic-mode">
        <h2 class="mono uppercase eyebrow">One pipeline, one fork</h2>
        <p class="lede">${esc(oneLine(mode.summary))}</p>
        <div class="agentic agentic-fork">
          <p class="callout-label agentic-label">The mode question</p>
          <p class="lede"><strong>${esc(oneLine(mode.question))}</strong></p>
          <p class="agentic-facts">Asked at <a href="#stage-${mode.asked_at}">Stage ${mode.asked_at} · ${esc(stageName(mode.asked_at))}</a>. Recorded at <a href="#stage-${mode.decided_at}">Stage ${mode.decided_at} · ${esc(stageName(mode.decided_at))}</a>, in the cleared ${fileRefs("intent.md")}. Not re-argued stage by stage.</p>
          <p class="lede">A fixed answer keeps the pipeline in its standard mode. A runtime answer puts it in agentic mode (${esc(mode.name)}). ${additive.length} of ${stages.length} stages keep their shape and take on extra checks${extendedLinks ? `, and ${extendedLinks} add to their artifact as well` : ""}. ${forkLinks ? `${forkLinks} change in kind, so each carries its own marked block below.` : ""}</p>
        </div>
        ${ledeParagraphs(mode.description)}
        ${mode.pipeline_note ? `<p class="lede"><strong>${esc(oneLine(mode.pipeline_note))}</strong></p>` : ""}
      </section>`
    : "";

  const principleItems = (lc.principles ?? [])
    .map((p) => kv(p.name, `<p>${esc(oneLine(p.description))}</p>`))
    .join("");
  const alignmentItems = (mode?.added_principles ?? [])
    .map((a) => kv(a.name, `<p>${esc(oneLine(a.description))}</p>`))
    .join("");
  const shiftRows = (mode?.core_shifts ?? [])
    .map(
      (s) =>
        `<tr><td><strong>${esc(s.dimension)}</strong></td><td>${esc(s.conventional ?? "")}</td><td>${esc(s.agentic ?? "")}</td></tr>`,
    )
    .join("");
  const constraintRows = (mode?.commercial_constraints ?? [])
    .map(
      (c) =>
        `<tr><td><strong>${esc(c.constraint)}</strong></td><td>${esc(oneLine(c.response))}</td></tr>`,
    )
    .join("");

  return `
      <section id="overview">
        <h1 class="mono uppercase eyebrow">${esc(lc.name)}</h1>
        <p class="lede">${esc(oneLine(lc.summary))}</p>
        <p class="lede">${esc(oneLine(lc.description))}</p>
        ${lc.pipeline_note ? `<p class="lede"><strong>${esc(oneLine(lc.pipeline_note))}</strong></p>` : ""}
        ${lc.companion ? `<p class="lede">This page is the what and why. The <a href="${esc(lc.companion)}">tactical page</a> is the how.</p>` : ""}
      </section>
      ${modeSection}

      <section id="pipeline">
        <h2 class="mono uppercase eyebrow">The pipeline</h2>
        <div class="scroll-x">
        <table class="hairline-table">
          <thead>
            <tr><th>Stage</th><th>Core artifact</th><th>Gate</th>${mode ? `<th>In agentic mode</th>` : ""}</tr>
          </thead>
          <tbody>${pipelineRows}</tbody>
        </table>
        </div>
      </section>

      <section id="how-stages-and-risk-work">
        <h2 class="mono uppercase eyebrow">How stages and risk shapes work together</h2>
        <p class="lede">Stages are artifact order. They describe the sequence of what you produce and which governance gate you pass through. Risk shapes are the real-time operating picture: they describe which capabilities run hot right now, regardless of which stage the work is in.</p>
        <p class="lede">A risk shape fires wherever it fires. The Feasibility shape can spike during Intent Framing if an architecture constraint surfaces early. The Value shape can stay active deep into Build if a prior assumption gets challenged. Shapes co-occur, recur, and persist. they are not bound to a single stage.</p>
        <p class="lede">The stage tells you what artifact you owe. The live risk mix tells you what to worry about while you produce it. You are always in a stage, and you are always responding to risk shapes.</p>
        <p class="lede">Stages have a default gravity, 0 through ${stages.length - 1}. but change events and failed gates send you back. The change-response doctrine runs at any stage: re-read the risk, re-set the dials, decision gate, re-staff, re-price and re-time, name the next slice.</p>
      </section>

      ${principleItems ? `<section id="principles">
        <h2 class="mono uppercase eyebrow">Principles, both modes</h2>
        <p class="lede">These hold across the whole pipeline in either mode. Agentic mode makes them more load-bearing, it does not introduce them.</p>
        <div class="kvs">${principleItems}</div>
      </section>` : ""}

      ${stageBlocks}

      ${alignmentItems ? `<section id="agentic-alignment">
        <h2 class="mono uppercase eyebrow">Agentic mode · Added principles</h2>
        <p class="lede">Only what is new once the deliverable reasons and acts on its own. The stage-level changes sit on each stage above.</p>
        <div class="kvs">${alignmentItems}</div>
      </section>` : ""}

      ${shiftRows ? `<section id="agentic-shifts">
        <h2 class="mono uppercase eyebrow">Agentic mode · Core operational shifts</h2>
        <div class="scroll-x">
        <table class="hairline-table">
          <thead><tr><th>Dimension</th><th>Conventional</th><th>Agentic mode (${esc(mode.name)})</th></tr></thead>
          <tbody>${shiftRows}</tbody>
        </table>
        </div>
      </section>` : ""}

      ${constraintRows ? `<section id="agentic-commercial">
        <h2 class="mono uppercase eyebrow">Agentic mode · Commercial model</h2>
        ${lc.commercial_unit?.agentic_note ? `<p class="lede">${esc(oneLine(lc.commercial_unit.agentic_note))}</p>` : ""}
        <div class="scroll-x">
        <table class="hairline-table">
          <thead><tr><th>Constraint</th><th>How ${esc(mode.name)} addresses it</th></tr></thead>
          <tbody>${constraintRows}</tbody>
        </table>
        </div>
      </section>` : ""}

      <section id="domains-across">
        <h2 class="mono uppercase eyebrow">Domains and risk shapes across the pipeline</h2>
        <p class="lede">Each stage has a primary domain driving the work and risk shapes that are typically hottest at that point. Framing tapers over time but does not hard-stop at the Evidence Gate. Proof runs at the Gate, Test, and Maintain stages, handling distinct but related evaluation tasks.</p>
        <div class="scroll-x">
        <table class="hairline-table">
          <thead>
            <tr><th>Stage</th><th>Primary domain</th><th>Secondary</th><th>Risk shapes typically hot</th>${mode ? `<th>Added in agentic mode</th>` : ""}</tr>
          </thead>
          <tbody>${domainRows}</tbody>
        </table>
        </div>
        <p class="lede">Risk shapes are listed where they are typically hottest, not where they only fire. Any shape can spike at any stage.</p>
        ${domainNotes}
        ${agenticDomainNotes}
      </section>

      ${gapItems || agenticGapItems ? `<section id="gaps">
        <h2 class="mono uppercase eyebrow">Known gaps</h2>
        ${gapItems ? `<div class="kvs">${gapItems}</div>` : ""}
        ${agenticGapItems ? `<p class="callout-label agentic-label">In agentic mode</p><div class="kvs">${agenticGapItems}</div>` : ""}
      </section>` : ""}`;
}

// Status & Pilot Readiness reads confidence-map.yaml and nothing else is
// authored here. Positions are a human's call, so this only lays them out: it
// never infers one. A row with parts shows where its weakest part sits.

// What counts as a change to the model. Edits to the site, the scripts or this
// page are not model changes, so they never appear in "What's happening today".
const MODEL_PATHS = [
  "capabilities",
  "domains",
  "skills",
  "roles",
  "titles",
  "risk-shapes",
  "seams",
  "definitions",
  "doctrine",
  "lifecycles",
  "levels.yaml",
  "intensity.yaml",
  "capacity-model.yaml",
];

// The latest commits that touched a model file, newest first. Empty when git is
// not available (a source archive, say), in which case the card is left out.
function modelChanges(limit = 5) {
  try {
    const out = execFileSync(
      "git",
      ["log", "-n", String(limit), "--format=%cI%x09%s", "--", ...MODEL_PATHS],
      { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [when, ...rest] = line.split("\t");
        return { when, subject: rest.join("\t") };
      });
  } catch {
    return [];
  }
}

function renderConfidenceMapMain(model) {
  const map = model.confidenceMap;
  if (!map) throw new Error("Missing confidence-map.yaml. Run npm run validate.");

  const columns = map.columns ?? [];
  const columnIndex = new Map(columns.map((column, index) => [column.id, index]));

  // Counted from the capability files, so the figure cannot go stale.
  const caps = model.capabilities ?? [];
  const sized = caps.filter((cap) => cap.scope_decomposition?.leverage_by_level).length;
  const derived = {
    "scope-units": `${sized} of ${caps.length} capabilities have leverage defined.`,
  };

  const notes = (entry) =>
    [
      entry.note ?? "",
      derived[entry.id] ?? "",
      entry.moves_when ? `Moves right when: ${entry.moves_when}` : "",
      entry.last_moved ? `Last moved ${entry.last_moved}` : "",
    ]
      .filter(Boolean)
      .map((text) => `<span class="cm-note">${esc(oneLine(text))}</span>`)
      .join("");

  // A part with a stage takes its name from the lifecycle, so the map cannot
  // drift from the stage names the lifecycle pages show.
  const partName = (row, item) => {
    if (item.stage === undefined) return item.name;
    const lifecycle = (model.lifecycles ?? []).find((lc) => lc.id === row.lifecycle);
    const stage = (lifecycle?.stages ?? []).find((s) => s.number === item.stage);
    if (!stage) {
      throw new Error(`confidence-map: ${row.id} cites missing stage ${item.stage}`);
    }
    return `Stage ${stage.number} · ${stage.name}`;
  };

  // Every id an edge or a joint pilot can point at, with its display name, the
  // column it sits in and the row it belongs to.
  const nodes = new Map();
  for (const row of map.rows ?? []) {
    const items = row.items ?? [];
    const column = items.length
      ? columns[Math.min(...items.map((item) => columnIndex.get(item.position) ?? columns.length))]?.id
      : row.position;
    nodes.set(row.id, { name: row.name, column, row: row.id, depends_on: row.depends_on });
    for (const item of items) {
      if (item.id) {
        nodes.set(item.id, { name: partName(row, item), column: item.position, row: row.id, depends_on: item.depends_on });
      }
    }
  }

  // Mapping looks back and pilot looks forward. Each part states one test for
  // each, and says so plainly when it has none.
  const tests = (entry) => {
    if (!entry.mapping && !entry.pilot) return "";
    const m = entry.mapping;
    const p = entry.pilot;
    const looking = m?.skip ? `Skipped. ${m.skip}` : (m?.test ?? "No mapping test yet.");
    const forward = p?.test ?? "Pilot not defined yet.";
    const meta = !p?.test
      ? ""
      : p.mode === "joint"
        ? `Joint pilot with ${(p.with ?? []).map((id) => nodes.get(id)?.name ?? id).join(", ")}.`
        : `Silo pilot: ${p.silo_scope}`;
    return `
          <div class="cm-tests">
            <p><strong>Mapping looks back.</strong> ${esc(oneLine(looking))}</p>
            <p><strong>Pilot looks forward.</strong> ${esc(oneLine(forward))}</p>
            ${meta ? `<p class="cm-tests-meta">${esc(oneLine(meta))}${p.not_yet ? ` ${esc(oneLine(p.not_yet))}` : ""}${p.note ? ` ${esc(oneLine(p.note))}` : ""}</p>` : ""}
          </div>`;
  };

  // A definition on hover or keyboard focus beside a label.
  const infoTip = (label, meaning, end = false) =>
    `<span class="skill-tip cm-info" tabindex="0" aria-label="${esc(label)}: ${esc(oneLine(meaning))}"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/><path d="M8 7.2v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="8" cy="4.9" r="0.9" fill="currentColor"/></svg><span class="tip${end ? " tip-end" : ""}" role="tooltip">${esc(oneLine(meaning))}</span></span>`;

  // The stamp is written with an offset ("2026-10-01T10:25:11-05:00"). Read as
  // written, it gives the same absolute time for every reader and no script.
  const stamped = (value) => {
    const match = String(value).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?(Z|[+-]\d{2}:\d{2})$/);
    return match ? `${match[1]} ${match[2]} ${match[3] === "Z" ? "UTC" : `UTC${match[3]}`}` : String(value);
  };

  // What changed in the model, from the commits that touched model files. It
  // is history, never a forecast. The page script turns the newest stamp into a
  // running "4 mins ago"; without it the absolute time is shown instead.
  const changes = modelChanges();
  const today = changes.length
    ? `<div class="cm-today">
          <div class="cm-today-head">
            <p class="callout-label cm-today-title">What's happening today</p>
            <p class="cm-today-date">Latest model change <time class="cm-ago" datetime="${esc(changes[0].when)}" data-since="${esc(changes[0].when)}">${esc(stamped(changes[0].when))}</time></p>
          </div>
          <ul class="cm-changes">
            ${changes
              .map((change) => `<li><span class="cm-change-date">${esc(shortDate(change.when.slice(0, 10)))}</span> ${esc(oneLine(change.subject))}</li>`)
              .join("")}
          </ul>
        </div>`
    : "";

  const span = (range) => (range.min === range.max ? `${range.min}` : `${range.min}–${range.max}`);
  const pct = (value) => Math.round(value * 100);
  const target = map.mapping_engagements_target;
  const recent = map.recent_projects_target;
  const coverage = map.coverage_to_advance;
  const rules = [
    target && recent ? `Mapping looks back at ${span(target)} running and ${span(recent)} recent projects.` : "",
    coverage ? `A part moves on at ${pct(coverage.min)}–${pct(coverage.max)}% coverage.` : "",
    "Dates are estimates and never move a part.",
  ].filter(Boolean).join(" ");

  const overall = pilotWindow(map);
  const hero = overall
    ? `<div class="cm-hero">
          <p class="cm-hero-range"><span class="cm-hero-k">First pilots:</span> from ${esc(shortDate(overall.first))}</p>
          <p class="cm-hero-range"><span class="cm-hero-k">Joint staffing pilot:</span> ${esc(shortDate(overall.joint.earliest))} – ${esc(shortDate(overall.joint.latest))}</p>
          ${map.pilot_principle ? `<p class="cm-hero-sub">${esc(oneLine(map.pilot_principle))}</p>` : ""}
          <p class="cm-hero-sub">${esc(rules)}</p>
        </div>`
    : "";

  return `
      <section id="overview">
        <p class="cm-back"><a href="index.html">← Back to the model</a></p>
        <h1 class="cm-sr">${esc(map.name)}</h1>
        ${hero}
        ${today}
      </section>
      ${readinessGantt(map, nodes, { columns, columnIndex, partName, tests, notes, infoTip })}
      ${readinessLoop(map, nodes)}
      ${readinessDone(map)}
      ${readinessNext(map)}
      ${readinessDecisions(map)}`;
}

// Dates on the readiness page are ISO days. They are read as UTC midnight so a
// day never shifts with the reader's time zone.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayOf = (iso) => {
  const [y, m, d] = String(iso).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
const isoOf = (day) => new Date(day * 86400000).toISOString().slice(0, 10);
const shortDate = (iso) => {
  const [, m, d] = String(iso).split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
};

const READINESS_COLOR = { thinking: "#C9A47A", mapping: "#4E9A6A", pilot: "#EC4B24" };
const LOOP_RED = "#D63B27";

// One chart for every part. Each row is one line: thinking, then mapping, then
// the pilot, each a solid bar covering its whole window. Where a pilot overlaps
// an earlier bar it draws on top. A joint pilot is one orange box across every
// part it pilots with.
function readinessGantt(map, nodes, helpers) {
  const { columns, columnIndex, partName, tests, notes, infoTip } = helpers;
  const rows = map.rows ?? [];
  if (!rows.length) return "";

  const pilotOf = (entry) => (entry.pilot?.test && entry.pilot.window && entry.pilot.starts ? entry.pilot : null);

  const todayIso = new Date().toISOString().slice(0, 10);
  const dates = [todayIso];
  for (const row of rows) {
    for (const range of [row.thinking_end, row.mapping?.ends]) if (range) dates.push(range.earliest, range.latest);
    for (const entry of [row, ...(row.items ?? [])]) {
      const pilot = pilotOf(entry);
      if (pilot) dates.push(pilot.starts, pilot.window.earliest, pilot.window.latest);
    }
  }
  dates.sort();
  const [fy, fm] = dates[0].split("-").map(Number);
  const [ly, lm] = dates[dates.length - 1].split("-").map(Number);
  const start = Date.UTC(fy, fm - 1, 1) / 86400000;
  const end = Date.UTC(ly, lm, 1) / 86400000;
  const at = (iso) => ((dayOf(iso) - start) / (end - start)) * 100;
  const f = (n) => Number(n.toFixed(3));

  // The joint pilot, and everything that takes part in it.
  const jointRow = rows.find((row) => row.pilot?.test && row.pilot.mode === "joint" && row.pilot.window);
  const members = jointRow ? [jointRow.id, ...(jointRow.pilot.with ?? [])] : [];

  const monthDays = [];
  for (let day = start; day < end; day += 1) {
    if (new Date(day * 86400000).getUTCDate() === 1) monthDays.push(day);
  }
  const grid =
    monthDays.map((day) => `<i class="gt-month" style="left:${f(at(isoOf(day)))}%"></i>`).join("") +
    `<i class="gt-today" style="left:${f(at(todayIso))}%"></i>`;
  const monthLabels = monthDays
    .map((day) => `<span class="gt-month-label" style="left:${f(at(isoOf(day)))}%">${MONTHS[new Date(day * 86400000).getUTCMonth()]} ${new Date(day * 86400000).getUTCFullYear()}</span>`)
    .join("");

  const bar = (kind, from, range, lane) => {
    const x0 = at(from);
    const x2 = Math.max(x0, at(range.latest));
    // Every bar fills its whole window, from its start to its latest end.
    return `<span class="gt-bar gt-${kind}" style="left:${f(x0)}%;width:${f(x2 - x0)}%"><span class="gt-solid"></span></span>`;
  };
  // Labels sit just after the end of a bar.
  const endLabel = (text, range) =>
    `<span class="gt-label" style="left:${f(at(range.latest))}%">${esc(text)}</span>`;

  const columnOf = (row) => nodes.get(row.id)?.column;

  // One line per row: thinking, then mapping, then the pilot, all on the same line.
  const lanes = (row) => {
    const column = columnOf(row);
    const bars = [];
    let end = null;
    if (column === "thinking" && row.thinking_end) {
      bars.push(bar("thinking", todayIso, row.thinking_end));
      end = row.thinking_end.latest;
    }
    if (column !== "pilot" && row.mapping?.ends) {
      // Mapping starts where thinking ends, so the two never overlap.
      const from = column === "thinking" && row.thinking_end ? row.thinking_end.latest : todayIso;
      bars.push(bar("mapping", from, row.mapping.ends));
      end = row.mapping.ends.latest;
    }
    const pilot = pilotOf(row);
    if (pilot) {
      // Drawn last, so where it overlaps an earlier bar the pilot is on top.
      bars.push(bar("pilot", pilot.starts, pilot.window));
      if (pilot.mode === "silo") bars.push(endLabel(pilot.label ?? "Pilots on its own", pilot.window));
    } else {
      const after = end ? `left:${f(at(end))}%;` : "left:8px;";
      bars.push(`<span class="gt-note" style="${after}padding-left:8px">Pilot not defined yet</span>`);
    }
    return grid + bars.join("");
  };

  const caret = `<svg class="cm-caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 2l4 3-4 3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const detail = (entry) => {
    const inner = `${notes(entry) ? `<div class="gt-notes">${notes(entry)}</div>` : ""}${tests(entry)}`;
    return inner;
  };

  const body = rows
    .map((row) => {
      const items = row.items ?? [];
      const column = columnOf(row);
      const inner = detail(row);

      if (!items.length) {
        return `
        <div class="gt-row" data-row="${esc(row.id)}">
          <div class="gt-name">
            <span class="gt-title">${esc(row.name)}</span>
            <span class="gt-tags">${inner ? `<button type="button" class="gt-more" data-toggle aria-expanded="false" aria-controls="gt-${esc(row.id)}">Details</button>` : ""}</span>
          </div>
          <div class="gt-lane">${lanes(row)}</div>
        </div>
        ${inner ? `<div class="gt-detail" id="gt-${esc(row.id)}" hidden>${inner}</div>` : ""}`;
      }

      const children = items
        .map((item) => {
          const own = pilotOf(item);
          const childLane = own
            ? grid + bar("pilot", own.starts, own.window) + (own.mode === "silo" ? endLabel(own.label ?? "Pilots on its own", own.window) : "")
            : `${grid}<span class="gt-note">Follows the group</span>`;
          return `
          <div class="gt-row gt-child" data-row="${esc(item.id ?? "")}" data-group="${esc(row.id)}">
            <div class="gt-name">
              <span class="gt-title">${esc(partName(row, item))}</span>
              ${notes(item) ? `<span class="gt-notes">${notes(item)}</span>` : ""}
            </div>
            <div class="gt-lane">${childLane}</div>
          </div>`;
        })
        .join("");

      return `
        <div class="gt-row gt-group" data-row="${esc(row.id)}">
          <div class="gt-name">
            <button type="button" class="gt-group-btn" data-toggle aria-expanded="false" aria-controls="gt-${esc(row.id)}">${caret}<span class="gt-title">${esc(row.name)}</span><span class="cm-count">(${items.length})</span></button>
          </div>
          <div class="gt-lane">${lanes(row)}</div>
        </div>
        <div class="gt-panel" id="gt-${esc(row.id)}" hidden>
          ${inner ? `<div class="gt-detail">${inner}</div>` : ""}${children}
        </div>`;
    })
    .join("");

  const key = (swatch, label, tip, end = false) =>
    `<span class="gt-key">${swatch}${esc(label)}${tip ? infoTip(label, tip, end) : ""}</span>`;
  const sw = (kind, cls = "") => `<span class="gt-swatch gt-bar gt-${kind} ${cls}"><span class="gt-solid"></span></span>`;
  const meaning = (id) => columns.find((column) => column.id === id)?.meaning;

  const joint = jointRow
    ? (() => {
        const l = at(jointRow.pilot.starts);
        const w = at(jointRow.pilot.window.latest) - l;
        return `<div class="gt-joint" data-members="${esc(members.join(" "))}" style="--l:${f(l / 100)};--w:${f(w / 100)}"><span class="gt-joint-label">Piloted together: ${esc(jointRow.name.toLowerCase())}</span></div>`;
      })()
    : "";

  return `
      <section id="timeline">
        <h2 class="mono uppercase eyebrow">Where each part is, and when it could move${map.reading_rule ? infoTip("Reading the chart", map.reading_rule) : ""}</h2>
        <p class="lede">Each bar covers its likely window.</p>
        <div class="gt-legend">
          ${key(sw("thinking"), "Thinking time", meaning("thinking"))}
          ${key(sw("mapping"), "Mapping", meaning("mapping"))}
          ${key(sw("pilot"), "Pilot", meaning("pilot"), true)}
          ${jointRow ? key(`<span class="gt-swatch gt-joint-swatch"></span>`, "Pilots together, one box") : ""}
        </div>
        <div class="cm-scroll">
          <div class="gt">
            <div class="gt-row gt-head">
              <div class="gt-name"><span class="gt-title">Part of the model</span></div>
              <div class="gt-lane">${monthLabels}${grid}<span class="gt-today-label" style="left:${f(at(todayIso))}%">Today</span></div>
            </div>
            ${body}
            ${joint}
          </div>
        </div>
        <script>
          (function () {
            var chart = document.querySelector('.gt');
            if (!chart) return;
            function layout() {
              var box = chart.querySelector('.gt-joint');
              if (!box) return;
              var rows = box.getAttribute('data-members').split(' ').map(function (id) {
                var row = chart.querySelector('[data-row="' + id + '"]');
                if (row && row.offsetParent === null) row = chart.querySelector('[data-row="' + row.getAttribute('data-group') + '"]');
                return row;
              }).filter(Boolean);
              if (!rows.length) return;
              var top = Math.min.apply(null, rows.map(function (r) { return r.offsetTop; })) + 32;
              var last = rows.reduce(function (a, r) { return r.offsetTop > a.offsetTop ? r : a; });
              box.style.top = top + 'px';
              box.style.height = (last.offsetTop + last.offsetHeight - 4 - top) + 'px';
            }
            chart.querySelectorAll('[data-toggle]').forEach(function (button) {
              button.addEventListener('click', function () {
                var open = button.getAttribute('aria-expanded') === 'true';
                button.setAttribute('aria-expanded', String(!open));
                document.getElementById(button.getAttribute('aria-controls')).hidden = open;
                layout();
              });
            });
            window.addEventListener('resize', layout);
            layout();
          })();
        </script>
      </section>`;
}

// The loop is drawn from `depends_on`: an arrow runs from the part that is
// needed to the part that needs it. Feedback that is not real yet is dashed.
function readinessLoop(map, nodes) {
  const ring = map.loop?.ring ?? [];
  if (!ring.length) return "";
  const center = map.loop.center ?? [];

  const edges = [];
  for (const [id, node] of nodes) {
    for (const edge of node.depends_on ?? []) {
      edges.push({ from: edge.id, to: id, reason: edge.reason, real: edge.real !== false });
    }
  }
  // Lettered in loop order: clockwise round the ring from the top by the part
  // that is needed, then edges from the centre, then feedback not yet real.
  const rank = (edge) => {
    const ringAt = ring.indexOf(edge.from);
    return (edge.real ? 0 : 2000) + (ringAt === -1 ? 1000 : ringAt * 10) + Math.max(0, ring.indexOf(edge.to));
  };
  edges.sort((a, b) => rank(a) - rank(b));
  const letter = (i) => String.fromCharCode(65 + i);

  const width = 600;
  const height = 420;
  const cx = width / 2;
  const cy = height / 2;
  const rx = 225;
  const ry = 160;
  const boxH = 32;
  const boxW = (id) => Math.round((nodes.get(id)?.name ?? id).length * 7 + 36);
  const place = new Map();
  ring.forEach((id, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / ring.length;
    place.set(id, { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
  });
  center.forEach((id, i) => place.set(id, { x: cx, y: cy + (i - (center.length - 1) / 2) * 48 }));

  // Where the line from a box's centre towards a point leaves the box.
  const exit = (id, toward, pad = 4) => {
    const p = place.get(id);
    const dx = toward.x - p.x;
    const dy = toward.y - p.y;
    const hw = boxW(id) / 2 + pad;
    const hh = boxH / 2 + pad;
    const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
    return { x: p.x + dx * t, y: p.y + dy * t };
  };

  const lines = edges
    .map((edge, i) => {
      const a = place.get(edge.from);
      const b = place.get(edge.to);
      if (!a || !b) return "";
      const s = exit(edge.from, b);
      const e = exit(edge.to, a, 8);
      const mx = (s.x + e.x) / 2;
      const my = (s.y + e.y) / 2;
      return `<line x1="${s.x}" y1="${s.y}" x2="${e.x}" y2="${e.y}" stroke="${LOOP_RED}" stroke-width="1.4"${edge.real ? "" : ` stroke-dasharray="5 4"`} marker-end="url(#loop-arrow)"/>` +
        `<circle cx="${mx}" cy="${my}" r="9" fill="#FFFFFF" stroke="${LOOP_RED}"/>` +
        `<text class="loop-letter" x="${mx}" y="${my + 4}" text-anchor="middle">${letter(i)}</text>`;
    })
    .join("");

  const boxes = [...place.entries()]
    .map(([id, p]) => {
      const node = nodes.get(id);
      const w = boxW(id);
      const color = node?.column ? READINESS_COLOR[node.column] : null;
      return `<g>
          <rect x="${p.x - w / 2}" y="${p.y - boxH / 2}" width="${w}" height="${boxH}" rx="6" fill="#FFFFFF" stroke="#D4D4D4"/>
          ${color ? `<circle cx="${p.x - w / 2 + 14}" cy="${p.y}" r="4" fill="${color}"/>` : ""}
          <text class="loop-name" x="${p.x + (color ? 7 : 0)}" y="${p.y + 4}" text-anchor="middle">${esc(node?.name ?? id)}</text>
        </g>`;
    })
    .join("");

  const list = edges
    .map(
      (edge, i) => `<li class="loop-edge${edge.real ? "" : " loop-edge-unreal"}">
          <span class="loop-key">${letter(i)}</span>
          <span><strong>${esc(nodes.get(edge.from)?.name ?? edge.from)} → ${esc(nodes.get(edge.to)?.name ?? edge.to)}.</strong> ${esc(oneLine(edge.reason))}${edge.real ? "" : " Not real yet."}</span>
        </li>`,
    )
    .join("");

  return `
      <section id="loop">
        <h2 class="mono uppercase eyebrow">Why this isn't a sequential roadmap</h2>
        <p class="lede">The parts depend on each other in a loop, so none of them finishes first. An arrow runs from the part that is needed to the part that needs it, a dot shows the column a part sits in, and a dashed arrow is feedback that does not exist yet.</p>
        <div class="cm-scroll">
          <svg class="loop" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Dependency loop between parts of the model">
            <defs><marker id="loop-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${LOOP_RED}"/></marker></defs>
            ${lines}
            ${boxes}
          </svg>
        </div>
        <ul class="loop-edges">${list}</ul>
        ${map.loop.callout ? `<p class="cm-callout">${esc(oneLine(map.loop.callout))}</p>` : ""}
      </section>`;
}

// A group with nothing in it is left out rather than shown empty.
function readinessDone(map) {
  const groups = (map.done ?? []).filter((group) => group.items.length);
  if (!groups.length) return "";
  return `
      <section id="done">
        <h2 class="mono uppercase eyebrow">What's done</h2>
        <div class="cm-done">
          ${groups
            .map(
              (group) => `<div class="cm-done-group">
            <h3>${esc(group.group)}</h3>
            <ul>${group.items.map((item) => `<li>${esc(oneLine(item))}</li>`).join("")}</ul>
          </div>`,
            )
            .join("")}
        </div>
      </section>`;
}

function readinessNext(map) {
  const next = map.next ?? [];
  if (!next.length) return "";
  const span = ({ min, max, unit }) => {
    const one = unit.replace(/s$/, "");
    if (min === max) return `${min} ${min === 1 ? one : unit}`;
    return `${min}–${max} ${unit}`;
  };
  return `
      <section id="next">
        <h2 class="mono uppercase eyebrow">What matters most next</h2>
        <div class="cm-scroll">
          <table class="hairline-table cm-next">
            <thead><tr><th>What</th><th>Estimate</th><th>Why it comes first</th></tr></thead>
            <tbody>
              ${next
                .map(
                  (entry) => `<tr>
                <td>${esc(entry.item)}</td>
                <td class="cm-next-est">${esc(span(entry.estimate))}${entry.after ? ` after ${esc(entry.after)}` : ""}</td>
                <td>${entry.note ? esc(oneLine(entry.note)) : ""}</td>
              </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>`;
}

function readinessDecisions(map) {
  const decisions = map.decisions ?? [];
  const drivers = map.range_drivers ?? {};
  if (!decisions.length && !drivers.pushes_late && !drivers.pulls_early) return "";
  const list = (items) => `<ul>${(items ?? []).map((item) => `<li>${esc(oneLine(item))}</li>`).join("")}</ul>`;
  return `
      <section id="decisions">
        <div class="cm-two">
          <div>
            <h2 class="mono uppercase eyebrow">Decisions we need</h2>
            ${list(decisions)}
          </div>
          <div>
            <h2 class="mono uppercase eyebrow">What moves the range</h2>
            ${drivers.pushes_late?.length ? `<h3>Pushes it later</h3>${list(drivers.pushes_late)}` : ""}
            ${drivers.pulls_early?.length ? `<h3>Pulls it earlier</h3>${list(drivers.pulls_early)}` : ""}
          </div>
        </div>
      </section>`;
}

function renderTacticalPlaybookMain(model) {
  const lc = requireLifecycle(model, "ai-native-sdlc");
  const mode = lc.agentic_mode;
  const parts = agenticTacticalParts();
  // Each stage's agentic block, marked as a fork where the lifecycle says the
  // modes diverge in kind. The repo layout is a code block, so it is slotted in
  // after the page-wide file-reference styling rather than inside it.
  const agentic = (n) =>
    agenticTacticalBlock(
      parts.stages[n],
      lc.stages.find((stage) => stage.number === n)?.agentic?.divergence === "fork",
      lc.stages.find((stage) => stage.number === n)?.artifact,
    );
  // Same output card as the strategy page: an "Output" label over the file
  // reference and a one-line description.
  const output = (file, text) => outputCard({ file, text });
  const sprintTag = `<span class="stage-tag">Evidence Sprint</span>`;
  // fileRefs wraps every intent.md / spec.md / plan.md style reference in the
  // rendered page, so the file-name styling matches the strategy page.
  return fileRefs(`
      <section id="overview">
        <h1 class="mono uppercase eyebrow">AI-Native SDLC Tactical</h1>
        <p class="lede">The reconciled tactical execution behind the AI-Native SDLC: the exact skills, hooks, agents, and file names behind each stage, checked against Anthropic's published playbook.</p>
        <p class="lede">The <a href="ai-sdlc.html">AI-Native SDLC</a> is the what and why. This page is the how.</p>
      </section>

      <section id="agentic-mode">
        <h2 class="mono uppercase eyebrow">Agentic mode</h2>
        <p class="lede">When the deliverable is itself an agentic system, the same pipeline runs in agentic mode (the ${mode ? esc(mode.name) : "ADLC"}). Each stage below carries a marked agentic block with what changes. Design and Test are where the modes fork in kind, so those two blocks are marked and carry their own detail.</p>
        <p class="lede">${mode ? `<strong>${esc(oneLine(mode.question))}</strong> Asked once at Stage ${mode.asked_at}, recorded at Stage ${mode.decided_at}. ` : ""}These are the operating principles, repo structure, and execution patterns for agentic-mode engagements. They describe the shape of the work, not the specific tools used to do it. Tool choices belong in each project's context engine and change with the landscape.</p>
      </section>

      <section id="anthropic-mapping">
        <h2 class="mono uppercase eyebrow">How our stages map to Anthropic's 6</h2>
        <p class="lede">Anthropic's playbook runs six stages: Plan → Design → Build → Test → Deploy → Maintain. Sparq splits the first stage into two gates, sold together as one commercial unit, the Evidence Sprint. This is the actual differentiator.</p>
        <table class="hairline-table">
          <thead>
            <tr><th>Sparq stage</th><th>Anthropic stage</th><th>What Sparq adds</th></tr>
          </thead>
          <tbody>
            <tr><td><strong>0 · Intent Framing</strong></td><td>Plan</td><td>Structured workshop (2–4 hrs) + strict inline assumption-tagging before intent.md exists</td></tr>
            <tr><td><strong>1 · Evidence Gate</strong></td><td>Plan</td><td>Required external-signal checkpoint (Promote/Iterate/Pivot/Stop) + tracker sync and merge on close</td></tr>
            <tr><td><strong>2 · Design</strong></td><td>Design</td><td>1:1</td></tr>
            <tr><td><strong>3 · Build</strong></td><td>Build</td><td>1:1</td></tr>
            <tr><td><strong>4 · Test</strong></td><td>Test</td><td>1:1</td></tr>
            <tr><td><strong>5 · Deploy</strong></td><td>Deploy</td><td>1:1</td></tr>
            <tr><td><strong>6 · Maintain</strong></td><td>Maintain</td><td>1:1, plus product-analytics bands widened beyond Anthropic's infra-only example</td></tr>
          </tbody>
        </table>
        <p class="lede"><strong>Commercially:</strong> Stages 0–1 together are the Evidence Sprint, the thing that used to be pitched as discovery, now scoped to roughly 2 weeks because the output is evidence and a costed Build decision, not a stack of workshop artifacts. Everything from Design onward tracks Anthropic's canonical mechanics closely.</p>
      </section>

      <section id="tactical-0">
        <h2 class="mono uppercase eyebrow">Stage 0 · Intent Framing. Tactical${sprintTag}</h2>
        <div class="kvs">
          ${kv("Practice", "<p>A 2–4 hour structured workshop. 10 min silent assumption dump → failure premortem → domain walkthrough across Value / Usability / Feasibility / Viability / Operational → architecture exposure with engineering. The full procedure is on the <a href='new-discovery.html'>New Discovery</a> page. No untagged claims survive the file.</p>")}
          ${kv("Tooling", "<p>Meeting-transcription MCP (Whisper/Fathom/Recall.ai) for live capture, plus Miro/Mural/Slack MCP for stickies and threads.</p>")}
        </div>
        <div class="kvs">
          ${kv("intent-elicitor skill", "<p>Interactive elicitation: asks probing questions, rephrases claims as testable assertions.</p>")}
          ${kv("assumption-extractor skill", "<p>Parses the transcript in real time and auto-tags into the 5 risk categories.</p>")}
          ${kv("premortem-adversary subagent", "<p>Red-teams the room on technical constraints and unstated dependencies.</p>")}
          ${kv("assumption-linter hook", "<p>Pre-commit. Rejects the commit if any claim lacks an [ASSUMPTION: Category] tag.</p>")}
        </div>
        ${output("raw intent.md", "100% tagged. Facilitator validates tagging before it moves.")}
        ${agentic(0)}
      </section>

      <section id="tactical-1">
        <h2 class="mono uppercase eyebrow">Stage 1 · Evidence Gate. Tactical${sprintTag}</h2>
        <div class="kvs">
          ${kv("Practice", "<p>Pull the highest-risk Value/Usability assumption. Frame a minimal external-facing slice. Attach it to a real client touchpoint; synthetic-only validation is disallowed without a logged exception. Record signal. Product + Delivery decide: Promote / Iterate / Pivot / Stop. On a Promote, close by merging cleared intent.md into /intent/, mapping scope blocks into the enterprise tracker, and defining hard boundary markers.</p>")}
          ${kv("Repo home", "<p>Evidence Work skills and the resulting evidence-of-signal live in a per-project repo.</p>")}
          ${kv("Vision Prototype", "<p>Distinct from the narrow Evidence Slice. Where an Evidence Slice tests one assumption, a Vision Prototype is a holistic build, full breadth, selective depth, meant to show the client the future-state value, not validate a single risk. Optional per engagement, but when built, it sits alongside the Promote decision and the costed Build proposal.</p>")}
          ${kv("Tooling", "<p>Conversation Intelligence MCP (Gong/Zoom/Teams/Chorus) for signal capture; Enterprise Tracker MCP (Jira/Azure DevOps/ServiceNow) and a non-interactive Claude CI runner for the close.</p>")}
        </div>
        <div class="kvs">
          ${kv("evidence-synthesizer skill", "<p>Maps quotes to tagged assumptions, evaluates signal strength, and caps internal-only feedback at Directional confidence so it can't be mistaken for a real-occasion validation.</p>")}
          ${kv("synthetic-user-dryrun subagent", "<p>Pre-gate multi-persona simulation so live client time isn't burned on an obviously broken pitch.</p>")}
          ${kv("gate-signoff-validator hook", "<p>Blocks the push to /intent/ unless an explicit decision tag and signature block are present.</p>")}
          ${kv("tracker-sync skill", "<p>Automates mapping between Markdown scope blocks and enterprise epic/story schemas.</p>")}
          ${kv("cleared-intent-trigger", "<p>GitHub Action that fires only when the intent.md frontmatter reads gate_status: cleared, instantiating Stage 2 (Design).</p>")}
        </div>
        ${output("cleared intent.md", "Synced and merged to main, with an optional Vision Prototype.")}
        ${agentic(1)}
      </section>

      <section id="tactical-2">
        <h2 class="mono uppercase eyebrow">Stage 2 · Design. Tactical</h2>
        <div class="kvs">
          ${kv("Practice", "<p>Compressed design session(s), Claude + core engineering leads. Enterprise skills injected into context. Architecture must satisfy the Evidence Gate's operational bounds without over-building beyond intent.md.</p>")}
          ${kv("Tooling", "<p>Figma MCP or repo-native design: design capability doesn't have to live in Figma. Where the capability is confidently prototype-driven, the design system is built directly in Claude Code / Cursor and lives in the repo, feeding spec.md without a Figma round-trip. Choose per project; both paths converge on the same artifact.</p>")}
        </div>
        <div class="kvs">
          ${kv(".claude/skills/security-baseline", "<p>Organization-wide security compliance skill.</p>")}
          ${kv(".claude/skills/brand-guidelines", "<p>Brand compliance skill.</p>")}
          ${kv(".claude/skills/ux-design-system", "<p>UX standards skill.</p>")}
          ${kv(".claude/skills/adlc-agent-guardrails", "<p>Agent behavioral guardrails skill.</p>")}
          ${kv("spec-compliance-linter", "<p>Verifies spec.md has every required section (API specs, failure modes, data models) before the stage can transition.</p>")}
        </div>
        ${output("spec.md", "Design/Tech Lead review.")}
        ${agentic(2)}
      </section>

      <section id="tactical-3">
        <h2 class="mono uppercase eyebrow">Stage 3 · Build. Tactical</h2>
        <div class="kvs">
          ${kv("Practice", "<p>Git worktree isolation (cap 2–3 per engineer). Plan Mode first: Claude writes plan.md before touching source. Engineer accepts the plan, then code generation starts. Scoped Auto Mode execution within defined paths. Deliberately mimics Anthropic's own Build stage: plan mode, CLAUDE.md, subagents, hooks. Sparq-specific tooling layers on top.</p>")}
          ${kv("Tooling", "<p>Claude Code CLI, CLAUDE.md as the repo's context engine.</p>")}
        </div>
        <div class="kvs">
          ${kv(".claude/agents/verifier.md", "<p>Spins up a fresh context window, runs the app, verifies behavior against plan.md.</p>")}
          ${kv(".claude/agents/simplifier.md", "<p>Strips redundant abstraction from generated diffs.</p>")}
          ${kv(".claude/agents/prompt-evaluator.md", "<p>For builds with embedded AI agents. evaluates prompt responses for safety/hallucination/tool-calling accuracy.</p>")}
          ${kv("path-blocking-hook", "<p>Intercepts file edits outside the scope defined in plan.md.</p>")}
        </div>
        ${output("plan.md + code diffs", "Verified code in isolated branches. Engineer plan acceptance.")}
        ${agentic(3)}
      </section>

      <section id="tactical-4">
        <h2 class="mono uppercase eyebrow">Stage 4 · Test. Tactical</h2>
        <div class="kvs">
          ${kv("Practice", "<p>Agent self-verification (build, unit tests, visual regression) before submission. Non-interactive CI eval suite runs 20–50 task scenarios. Test files are read-only during bug-fix tasks; the agent must fix the code, never weaken the assertion.</p>")}
          ${kv("Tooling", "<p>Headless Playwright/Puppeteer MCP, .github/workflows/agent-evals.yml.</p>")}
        </div>
        <div class="kvs">
          ${kv("lock-tests.sh hook", "<p>Blocks Edit/Write on tests/** during bug-fix tasks.</p>")}
          ${kv("eval-pass-checker", "<p>Blocks PR merge if task accuracy falls below the threshold.</p>")}
        </div>
        ${output("Verification logs + CI eval results", "Automated CI pass threshold.")}
        ${agentic(4)}
      </section>

      <section id="tactical-5">
        <h2 class="mono uppercase eyebrow">Stage 5 · Deploy. Tactical</h2>
        <div class="kvs">
          ${kv("Practice", "<p>Multi-pass PR review (Bugs → Security/PII → spec.md/plan.md compliance). Environment autonomy is tiered: Dev is fully autonomous, Staging requires a clean CI eval run plus automated review, Production requires named human Release Manager sign-off.</p>")}
          ${kv("Tooling", "<p>Claude Code PR Review Agent.</p>")}
        </div>
        <div class="kvs">
          ${kv(".claude/agents/pr-reviewer.md", "<p>Multi-pass review writing findings to REVIEW.md.</p>")}
          ${kv("Managed-settings engine", "<p>allowManagedHooksOnly, permissions.deny, sandboxed shell, disableSideloadFlags, allowManagedMcpServersOnly, matching Anthropic's reference settings.json.</p>")}
          ${kv("network-egress-blocker hook", "<p>Its own named control rather than folded into managed settings generically.</p>")}
        </div>
        ${output("REVIEW.md", "PR findings and release log. Human Release Manager sign-off on Production only.")}
        ${agentic(5)}
      </section>

      <section id="tactical-6">
        <h2 class="mono uppercase eyebrow">Stage 6 · Maintain. Tactical</h2>
        <div class="kvs">
          ${kv("Practice", "<p>Statistical process control on bands.yaml (Western Electric rules). On a breach, a background agent diagnoses root cause and writes a fresh raw intent.md back into Stage 0's triage queue. closing the loop without a human starting it. On-call engineers can also tag Claude directly in incident threads. Every resolved bug becomes a permanent regression case in the Stage 4 eval suite.</p>")}
          ${kv("Tooling", "<p>Infra MCP (Datadog/Prometheus/New Relic) and Product Analytics MCP (PostHog/Mixpanel/Pendo/Zendesk) feeding the same sensor.</p>")}
        </div>
        <div class="kvs">
          ${kv("metric-watcher daemon", "<p>Background monitor triggering triage agents on band breaches.</p>")}
          ${kv("incident-to-eval-compiler", "<p>Turns post-mortem logs into permanent regression tests.</p>")}
          ${kv("Claude Tag", "<p>ChatOps bot for on-call. Anthropic's actual Claude Tag product, not a generic ChatOps MCP Bot.</p>")}
        </div>
        ${output("bands.yaml", "Updated bands, incident records, and new regression cases added to Stage 4. Service Owner / on-call triage.")}
        ${agentic(6)}
      </section>

      <section id="agentic-tooling">
        <h2 class="mono uppercase eyebrow">Agentic mode · Tooling layers</h2>
        <p class="lede">An agentic-mode engagement requires seven infrastructure layers. The specific products filling each layer are project-level decisions maintained in the repo context engine, not prescribed here.</p>
        <div class="kvs">${parts.tooling}</div>
      </section>

      <section id="agentic-repo">
        <h2 class="mono uppercase eyebrow">Agentic mode · Repository structure</h2>
        <p class="lede">Every agentic-mode deliverable repository conforms to this canonical layout. The context engine lives at the root. Stage artifacts sit alongside the code they govern. Eval datasets live next to the runners that execute them.</p>
        @@REPO_STRUCTURE@@
      </section>

      <section id="agentic-principles">
        <h2 class="mono uppercase eyebrow">Agentic mode · Core operating principles</h2>
        <div class="kvs">${parts.principles}</div>
      </section>

      <section id="reconciliation">
        <h2 class="mono uppercase eyebrow">Reconciliation log</h2>
        <p class="lede">Every place the two internal source documents disagreed and the call that was made.</p>
        <table class="hairline-table">
          <thead>
            <tr><th>Stage</th><th>Conflict</th><th>Call made</th></tr>
          </thead>
          <tbody>
            <tr><td>0</td><td>assumption-extractor (A) vs intent-elicitor + assumption-linter (B)</td><td>Not a conflict. different functions. Keep all three.</td></tr>
            <tr><td>0</td><td>Workshop length: 60–90 min (both docs)</td><td>Extended to 2–4 hrs to reflect real client kickoffs.</td></tr>
            <tr><td>1</td><td>Skill named evidence-signal-check (A) vs evidence-synthesizer (B)</td><td>Canonicalize as evidence-synthesizer.</td></tr>
            <tr><td>1</td><td>Separate confidence-decision.md (A) vs updated intent.md (B)</td><td>Canonicalize as intent.md updated in place, in the per-project repo.</td></tr>
            <tr><td>1</td><td>Old Stage 2 (tracker sync) as its own numbered stage</td><td>Folded into Stage 1 as a closing action. automatic result of a Promote.</td></tr>
            <tr><td>2</td><td>4 compliance skills (A) vs 2 (B)</td><td>Keep A's full 4; add B's spec-compliance-linter on top.</td></tr>
            <tr><td>2</td><td>Figma-only tooling (both docs)</td><td>Added repo-native design as an equal path, not a fallback.</td></tr>
            <tr><td>3/4</td><td>Test-lock hook placed at Build (A) vs Test (B)</td><td>Move to Test. matches Anthropic's own placement.</td></tr>
            <tr><td>3</td><td>prompt-evaluator.md present (A) vs absent (B)</td><td>Keep. relevant for embedded-AI-agent builds.</td></tr>
            <tr><td>5</td><td>Bundled MDM settings (A) vs split config-engine + network hook (B)</td><td>Canonicalize on B's split, matches Anthropic's reference settings.json.</td></tr>
            <tr><td>6</td><td>Generic ChatOps MCP Bot (B)</td><td>Rename to Claude Tag. it's a real, named Anthropic product.</td></tr>
          </tbody>
        </table>
      </section>

      <section id="open-gaps">
        <h2 class="mono uppercase eyebrow">Open gaps vs Anthropic's playbook</h2>
        <div class="kvs">
          ${kv("CLAUDE.md as governed artifact", "<p>Anthropic treats CLAUDE.md with its own feedback loop: the correction goes into CLAUDE.md the second time an agent repeats a mistake, and PR review flags staleness. Neither internal doc gives CLAUDE.md this maintenance loop; it's currently just a context source.</p>")}
          ${kv("Scheduled security scanning", "<p>Anthropic's Deploy stage includes scheduled, model-driven security scanning (Claude Security) running independently of PR review, a recurring scan, not point-in-time, with findings fed back as fresh intent.md. Sparq's only security coverage at Deploy is currently the PR review pass.</p>")}
          ${kv("Leading/lagging metrics per stage", "<p>Anthropic's playbook defines explicit metrics per stage (e.g., time from intent.md commit to spec.md commit; first-pass CI success rate; time from band breach to intent.md in triage). Neither internal doc names how Sparq will measure whether the pipeline itself is working.</p>")}
        </div>
      </section>`).replace("@@REPO_STRUCTURE@@", parts.repoStructure);
}

// The agentic-mode tactical content: what the how looks like when the
// deliverable is itself an agentic system. It is plain text on purpose. The
// tactical page wraps every file reference once, over the whole page, so
// wrapping them here as well would nest the styling.
function agenticTacticalParts() {
  const repoStructure = `<div class="code-block"><pre><code>.
CLAUDE.md                     # Central Context Engine & System Instructions
.claude/
  settings.json               # Engine permissions, allowed tool boundaries
  commands/                   # Executable subcommands for development tasks
  skills/                     # Modular agent skills & domain workflows
intent.md                     # Stage 0 raw/tagged intent & premortem
spec.md                       # Stage 2 Technical architecture spec
autonomy-matrix.yaml          # Stage 2 Autonomy Authorization Matrix
plan.md                       # Stage 3 Pre-execution implementation plan
REVIEW.md                     # Stage 5 Multi-pass safety & deployment review
bands.yaml                    # Stage 6 Operational drift & token tracking bands
evals/
  datasets/                   # 20-50+ core task scenarios (.jsonl / .yaml)
  runners/                    # Evaluation harness and grader logic
  baselines/                  # Historical benchmark pass rates
mcp-servers/                  # Isolated MCP servers for system integration
src/                          # Agent runtime logic & deterministic workflows</code></pre></div>`;

  const stages = {
    0: {
      lede: "Establish whether an agentic architecture is actually necessary. Surface business value, feasibility bounds, and the specific ways an autonomous system can fail that a conventional build never has to consider.",
      items: [
        kv("Assumption dump", "<p>Silent dump across five lenses: Value, Usability, Feasibility, Viability, Operational.</p>"),
        kv("Agentic Failure Premortem", "<p>Explicitly catalog risks related to dynamic reasoning, open-ended tool calling, and token explosion.</p>"),
        kv("Tag every assertion", "<p>Tag every assertion in intent.md with: [VALIDATED], [DIRECTIONAL], [ASSUMPTION], or [AGENTIC-RISK]. These are an intent-tagging convention, distinct from model confidence markers.</p>"),
      ].join(""),
      output: ["intent.md", "Fully tagged, inert."],
    },
    1: {
      lede: "Verify high-risk assumptions with minimal spend before committing to architecture. For agentic systems this gate carries more weight because architecture decisions (tool access, autonomy scope) are expensive to unwind once made.",
      items: [
        kv("Evidence Slice or Vision Prototype", "<p>Build a targeted slice or prototype touching the highest-risk assumption.</p>"),
        kv("Adversarial stress tests", "<p>Multi-persona synthetic simulations with malformed prompts, indirect prompt injections, and edge-case tool parameters.</p>"),
        kv("Real-world signal", "<p>Connect to a real client touchpoint to collect empirical runtime telemetry. Internal-only signal caps at Directional confidence.</p>"),
        kv("Gate decision", "<p>Explicit status: Promote, Iterate, Pivot, or Stop.</p>"),
      ].join(""),
      output: ["intent.md (cleared)", "Cleared and synced to the enterprise tracker, with a Vision Prototype where built."],
    },
    2: {
      lede: "Design the system's runtime authority on purpose. This is where building an agent most clearly diverges from using one to build: the deliverable's own behavior has to be designed, bounded, and budgeted before implementation begins.",
      items: [
        kv("Orchestrator patterns", "<p>Map orchestrator patterns: prompt chaining, routing, parallelization, or orchestrator-worker. Default to deterministic workflows; escalate to autonomous agents only when genuinely required.</p>"),
        kv("Autonomy Matrix", "<p>Map every task category to an explicit authorization level: Autonomous, Automated with Logging, HITL Approval Required, or Prohibited. This is a strategic decision made once per system.</p>"),
        kv("Token economics", "<p>Set CAPEX/OPEX budgets as a first-class design constraint alongside functional requirements. Ongoing inference cost is a constraint, not an afterthought.</p>"),
        kv("Tool boundary specs", "<p>Define MCP server boundaries. Every tool, legacy connection, and enterprise platform the agent touches is exposed via a standardized protocol. No ad-hoc network requests or direct database calls.</p>"),
      ].join(""),
      output: ["spec.md + autonomy-matrix.yaml", "Technical blueprint with Autonomy Matrix and token budgets."],
    },
    3: {
      lede: "Execute under Evaluation-Driven Development. Evaluations are the specification that governs whether the system is behaving correctly, not just whether it compiles.",
      items: [
        kv("Plan Mode First", "<p>The implementation path is drafted and human-accepted before any code generation begins. The plan is committed to plan.md in Git.</p>"),
        kv("Worktree isolation", "<p>Isolate agent sessions across separate Git worktrees. Enforce a session cap per engineer to preserve review quality.</p>"),
        kv("Evaluation-Driven Development", "<p>Draft evaluation scenarios in parallel with feature code, not after it. For a probabilistic system, the eval suite is part of the spec, not a downstream check on it.</p>"),
        kv("Continuous model evaluation", "<p>Evaluate model outputs continuously during implementation for hallucination rate, formatting compliance, and tool-calling accuracy.</p>"),
      ].join(""),
      output: ["plan.md + code diffs", "Verified implementation with initial eval benchmarks."],
    },
    4: {
      lede: "A probabilistic system can pass every functional test and still fail on tool selection or safety alignment. Those need their own verification.",
      items: [
        kv("Non-interactive eval pipeline", "<p>Run evaluation suites across 20-50+ task scenarios on every relevant change.</p>"),
        kv("Test lockouts", "<p>If an eval fails, modify prompts, tool schemas, or context in CLAUDE.md. Never lower evaluation thresholds to reach a passing state.</p>"),
        kv("Combined pass threshold", `<ul class="bullets"><li><strong>Task completion accuracy</strong></li><li><strong>Tool-call accuracy</strong></li><li><strong>Safety and alignment gate</strong> (zero authorization breaches)</li></ul><p>All three axes must pass independently. Specific thresholds are set per project at Design.</p>`),
      ].join(""),
      output: ["Eval pass report + execution logs", "All three axes independently passing."],
    },
    5: {
      lede: "Transition a probabilistic system into production using tiered autonomy, not a single go/no-go review.",
      items: [
        kv("Multi-pass review", "<p>Security boundaries, alignment against spec, and functional correctness as separate review passes.</p>"),
        kv("Tiered autonomy", `<ul class="bullets"><li><strong>Development:</strong> Full autonomous execution.</li><li><strong>Staging:</strong> Automated checks + clean CI pipeline.</li><li><strong>Production:</strong> Explicit, named human authorization for any action above the defined risk threshold.</li></ul>`),
        kv("Context-engine correction", "<p>When the same mistake recurs, the repo context engine (CLAUDE.md) is updated so it does not recur again. The context engine is a governed artifact with its own feedback loop.</p>"),
      ].join(""),
      output: ["REVIEW.md", "Signed production activation record."],
    },
    6: {
      lede: "Manage probabilistic drift over time. Monitor token consumption, capture real-world edge cases, and feed incidents back into intent triage automatically.",
      items: [
        kv("Statistical process control", "<p>Monitor performance bands in bands.yaml: token consumption per task, reasoning drift, tool invocation error rates. Apply statistical control rules (e.g., Western Electric) against operational and product metrics.</p>"),
        kv("Automated incident loop", "<p>When telemetry flags an anomaly, a background process diagnoses the incident, compiles a permanent regression case into the eval suite, and raises a new item in intent.md. The lifecycle is a loop.</p>"),
        kv("Quarterly governance", "<p>Review governance quarterly against accumulated incident logs, drift data, and token expenditure reports.</p>"),
      ].join(""),
      output: ["bands.yaml", "Updated bands and incident regression cases feeding Stage 0."],
    },
  };

  const tooling = [
    kv("Agent CLI & Dev Engine", "<p>Repository-level code execution, plan drafting, worktree-isolated coding, tool invocation.</p>"),
    kv("Collaborative Ideation", "<p>Multi-persona ideation, assumption dumps, raw intent tagging, client workshop facilitation.</p>"),
    kv("Repo Context Engine", "<p>Dynamic repository context, agent instructions, project boundaries, subcommands and skills. Lives in CLAUDE.md and the .claude/ directory.</p>"),
    kv("Tool Integration Layer", "<p>Standardized server/client tool binding, database wrapping, legacy system isolation. Zero direct API access; all enterprise interactions routed through protocol-level boundaries.</p>"),
    kv("Model Stack", "<p>Strategic reasoning, orchestrator planning, code generation. Model choice is a project decision, not an organizational one.</p>"),
    kv("Evaluation Framework", "<p>Non-deterministic assertion running, multi-scenario bench testing, pass/fail grading against 20-50+ scenarios. Keep datasets format-agnostic (.jsonl or .yaml) so they parse interchangeably across eval tools.</p>"),
    kv("Observability & Telemetry", "<p>Token accounting, prompt cost tracking, runtime latency monitoring. Standardize on OpenTelemetry format so traces stream to any aggregator without modifying application code.</p>"),
    kv("Vector & Memory", "<p>Dynamic session context, semantic retrieval. May be in-memory, protocol-served, or backed by a dedicated vector store depending on the system's context requirements.</p>"),
  ].join("");

  const principles = [
    kv("Context engine as governed artifact", "<p>The repo context engine (CLAUDE.md) is not a static config file. It has its own feedback loop: when an agent repeats a mistake, the correction goes into the context engine. PR review checks for staleness. It contains deterministic operational rules, build commands, and agent boundaries.</p>"),
    kv("Tool boundary isolation", "<p>Agents never make ad-hoc network requests or direct database calls. Every enterprise interaction is routed through a protocol-level boundary (MCP server or equivalent) with input validation and autonomy checks enforced at the tool handler level.</p>"),
    kv("Format-agnostic evaluation data", "<p>Evaluation datasets are stored in standard formats (.jsonl or .yaml) so they parse interchangeably across any eval framework. The datasets are the durable asset; the runner is replaceable.</p>"),
    kv("Telemetry portability", "<p>Standardize on open telemetry formats so traces stream to any aggregator without modifying application code. The observability layer is a slot, not a commitment.</p>"),
  ].join("");

  return { repoStructure, stages, tooling, principles };
}

// One stage's agentic block on the tactical page. It sits under the standard
// tactical content for the same stage, marked the same way as on the strategy
// page, with an orange rule where the modes fork in kind.
function agenticTacticalBlock(parts, fork, baseArtifact) {
  const [file, text] = parts.output;
  // The stage's own card on this page already names its artifact, so this one
  // names only what agentic mode adds.
  return `
        <div class="agentic${fork ? " agentic-fork" : ""}">
          <p class="callout-label agentic-label">Agentic mode${fork ? `<span class="stage-tag">Where the modes fork</span>` : ""}</p>
          <p class="lede">${parts.lede}</p>
          <div class="kvs">${parts.items}</div>
          ${outputCard({ file: addedArtifacts(baseArtifact, file), text })}
        </div>`;
}

// New Discovery is the "discovery" doctrine drawn as a page: its steps grouped
// under the lifecycle stage each one belongs to. Stage names come from the
// lifecycle, so they are never retyped here, and the commercial unit's stages
// come from the lifecycle too.
function renderNewDiscoveryMain(model) {
  const d = requireDoctrine(model, "new-discovery");
  const lc = requireLifecycle(model, d.lifecycle);
  const capsById = byId(model.capabilities ?? []);
  const stageOf = new Map((lc.stages ?? []).map((st) => [st.number, st]));

  // Steps keep one running number across both stages, so the procedure reads
  // as a single sequence. Grouping only decides which heading a step sits under.
  const steps = d.steps ?? [];
  const stageNumbers = [...new Set(steps.map((step) => step.stage).filter((n) => n !== undefined))];
  const groups = stageNumbers
    .map((n) => {
      const st = stageOf.get(n);
      const rows = steps
        .map((step, index) => (step.stage === n ? renderDoctrineStep(step, index, capsById, { plain: true }) : ""))
        .join("");
      return `
        <h3 class="mono uppercase eyebrow process-stage" id="process-stage-${n}">Stage ${n} · <a href="ai-sdlc.html#stage-${n}">${esc(st?.name ?? String(n))}</a></h3>
        <div class="kvs">${rows}</div>`;
    })
    .join("");

  const variants = (d.variants ?? [])
    .map((v) => kv(v.name, `<p>${esc(oneLine(v.description))}</p>`))
    .join("");
  const delivers = (d.delivers ?? []).map((item) => `<li>${fileRefs(esc(oneLine(item)))}</li>`).join("");

  return `
      <section id="overview">
        <h1 class="mono uppercase eyebrow">${esc(d.name)}</h1>
        <p class="lede">${fileRefs(esc(oneLine(d.summary)))}</p>
      </section>

      <section id="process">
        <h2 class="mono uppercase eyebrow">The default process</h2>
        ${d.rule ? `<p class="lede">${fileRefs(esc(oneLine(d.rule)))}</p>` : ""}
        ${groups}
      </section>

      ${variants ? `<section id="variants">
        <h2 class="mono uppercase eyebrow">What can change</h2>
        <p class="lede">These change who is in the room and where the time goes. They never change the output or the gate.</p>
        <div class="kvs">${variants}</div>
      </section>` : ""}

      ${delivers ? `<section id="delivers">
        <h2 class="mono uppercase eyebrow">What discovery delivers</h2>
        <ul class="bullets">${delivers}</ul>
        ${d.closing_note ? `<p class="lede"><strong>${esc(oneLine(d.closing_note))}</strong></p>` : ""}
      </section>` : ""}`;
}

// Core Philosophy is the argument, kept short enough to read in a minute. The
// detail it points at lives on the other pages, so nothing here restates the
// model: counts, domain names, dial names and stage names are read from it, and
// only the four claims are authored.
function renderCorePhilosophyMain(model) {
  const lifecycle = requireLifecycle(model, "ai-native-sdlc");
  const stageLink = (n) => {
    const st = (lifecycle.stages ?? []).find((x) => x.number === n);
    return to(`ai-sdlc.html#stage-${n}`, `${lifecycle.name}, Stage ${n}${st ? ` · ${st.name}` : ""}`);
  };

  const domainNames = [...model.domains]
    .sort((a, b) => domainRank(a.id) - domainRank(b.id))
    .map((domain) => domain.name)
    .join(", ");
  const domainCount = model.domains.length;
  const capabilityCount = model.capabilities.length;
  const shapeCount = model.riskShapes.length;
  const seamCount = model.seams.length;
  const titleCount = model.titles.length;
  const idle = model.intensity?.dials?.[0]?.name ?? "Dormant";

  const principle = (n, title, body, links) => `
        <article class="principle" id="principle-${n}">
          <h3>${n}. ${esc(title)}</h3>
          <p class="lede">${body}</p>
          ${links}
        </article>`;

  const principles = [
    principle(
      1,
      "Confidence governs what gets committed, not the calendar",
      "The timebox stays, but a date can require a decision; it cannot manufacture the evidence behind it. Each checkpoint says what the evidence supports as of that date. It closes on Promote, Iterate, Pivot, or Stop, never on a default Promote because time ran out.",
      stageLink(1),
    ),
    principle(
      2,
      "Evidence is the artifact, documents are a view of it",
      `Roadmaps and decks are generated from what has been validated, and they say so where something has not been. Every assumption is tagged in ${fileRefs("intent.md")} as a claim, not a fact, and reviewed before it can become a spec.`,
      stageLink(0),
    ),
    principle(
      3,
      "Capabilities are promoted as they earn it",
      "The system is not defined all at once. Each capability moves from Concept to Validation to Commitment on its own, with a recorded decision at each step. The MVP emerges from which capabilities earn commitment, and in what order.",
      to("capability-model.html", "Capability Model"),
    ),
    principle(
      4,
      "Every domain contributes throughout, no phase owns the work",
      `All ${domainCount} domains (${esc(domainNames)}) run across the whole lifecycle from the first conversation. A domain not needed yet sits at ${esc(idle)}: idle, not absent. As commitment deepens, intensity changes, not who gets to speak.`,
      to("operating-view.html", "Operating View"),
    ),
  ].join("");

  return `
      <section id="overview">
        <h1 class="mono uppercase eyebrow">Core Philosophy</h1>
        <p class="lede">We commit to what the evidence supports, not to what the calendar demands. A client buys a named outcome, not a job title, and each outcome moves forward only as fast as the proof behind it.</p>
      </section>
      <section id="principles">
        <h2 class="mono uppercase eyebrow">Four principles</h2>
        ${principles}
      </section>
      <section id="where-it-lives">
        <h2 class="mono uppercase eyebrow">Where it lives</h2>
        <ul class="bullets">
          <li><strong>Outcomes.</strong> ${capabilityCount} capabilities in ${domainCount} domains. <a href="capability-model.html">Capability Model</a></li>
          <li><strong>How hard they run.</strong> ${shapeCount} risk shapes and ${seamCount} seams decide what is turned up and what must hand off. <a href="operating-view.html">Operating View</a></li>
          <li><strong>Who holds them, and what is sold.</strong> ${titleCount} titles bundle the capabilities. The client is charged for capabilities at levels, never for titles. <a href="roles-titles.html">Roles &amp; Titles</a></li>
          <li><strong>How delivery runs.</strong> One lifecycle, with discovery as its first two stages. <a href="ai-sdlc.html">${esc(lifecycle.name)}</a> and <a href="new-discovery.html">New Discovery</a></li>
        </ul>
      </section>
      <section id="confidence">
        <h2 class="mono uppercase eyebrow">How settled this is</h2>
        <p class="lede">The model is drafted, not proven. Every entry is at draft status, the numbers behind seat counts are placeholders no one has checked against real delivery, and the dial settings on the risk shapes are judgment calls rather than observations. The three Commitment States are not recorded per capability yet; today they appear only in how seat counts and levels promote.</p>
        <p class="lede">Status &amp; Pilot Readiness records where each part sits and when it could be ready for pilot use. Parts move right when real work holds them up, and back left when real work breaks them.</p>
        ${to("confidence-map.html", "Status & Pilot Readiness")}
      </section>`;
}

function renderCapabilityModelMain(model) {
  const { levels, domains, capabilities, skills } = model;
  const legend = levelLegendMap(levels);
  const capsById = byId(capabilities);

  // Grouped and sorted once, then read twice: the domain index links to
  // capabilities, and the capability sections render them in the same order.
  const capsByDomain = new Map(domains.map((d) => [d.id, []]));
  for (const cap of capabilities) {
    const group = capsByDomain.get(cap.domain);
    if (!group) {
      throw new Error(
        `Capability "${cap.id}" names domain "${cap.domain}", which has no file in domains/. Run npm run validate.`,
      );
    }
    group.push(cap);
  }
  for (const group of capsByDomain.values()) {
    group.sort((a, b) => a.name.localeCompare(b.name));
  }

  const domainSections = domains
    .map((domain) => {
      const caps = capsByDomain.get(domain.id) ?? [];
      const list = caps.length
        ? `<ul class="plain">${caps
            .map(
              (cap) =>
                `<li class="inline-row"><a href="#capability-${esc(cap.id)}">${esc(cap.name)}</a>${badge(cap.status)}</li>`,
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

  const capabilitySections = domains
    .map((domain) =>
      (capsByDomain.get(domain.id) ?? [])
        .map((cap) => renderCap(cap, domains, legend, capsById))
        .join(""),
    )
    .join("");

  const skillRows = [...skills]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((skill) => {
      const tip = esc(oneLine(skill.description));
      return `
        <tr id="agent-skill-${esc(skill.id)}">
          <td>
            <span class="skill-tip" tabindex="0">
              ${agentSkillChip(skill.id)}
              ${badge(skill.status)}
              <span class="tip">${tip}</span>
            </span>
          </td>
        </tr>`;
    })
    .join("");

  const levelRows = [...(levels?.execution_levels ?? []), levels?.ownership]
    .filter(Boolean)
    .map((level) => {
      const label = `<span class="mono">${esc(level.id)}</span> ${esc(level.name)}`;
      const desc = esc(oneLine(level.description));
      return `
            <tr>
              <td class="cap-ex-level">${label}</td>
              <td>${desc}</td>
            </tr>`;
    })
    .join("");

  const scoped = capabilities.filter(hasScopeClaims);
  const withLeverage = scoped.filter((cap) => cap.scope_decomposition.leverage_by_level).length;
  const withConcurrency = scoped.filter((cap) => cap.scope_decomposition.concurrency).length;
  const hypotheses = capabilities.filter(
    (cap) => !hasScopeClaims(cap) && cap.scope_decomposition?.open_question,
  ).length;
  const scopeMarkers = [...new Set(scoped.map((cap) => cap.scope_decomposition.confidence))];
  const scopedLinks = scoped
    .map((cap) => `<a href="#capability-${esc(cap.id)}">${esc(cap.name)}</a>`)
    .join(", ");

  return `
      <section id="overview">
        <h1 class="mono uppercase eyebrow">Capability Model</h1>
        <p class="lede">Domains are types of work. They do not change and they do not have levels. Capabilities are the named outcomes we promise inside a domain.</p>
        <p class="lede">How a capability is executed is a separate scale. L1 Guided Execution, L2 Practitioner, L3 Advanced Lead, and L4 Capability Ownership. That scale lives with capabilities, not with domains.</p>
        <p class="lede">A second scale says how big the work is: how many independent instances of a capability an engagement needs. That is <a href="#scope-leverage">scope</a>, and it is also set per capability.</p>
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
        ${capabilitySections}
        ${capabilitySections ? "" : `<p class="meta">None yet.</p>`}
      </section>
      <section id="scope-leverage">
        <h2 class="mono uppercase eyebrow">Scope & Leverage</h2>
        <p class="lede">Level says how senior the work needs to be. Scope says how many independent instances of that capability and level the engagement needs. Without it, a one-person customization and a large modernization produce the same capability and level, and the size gets settled by asking people.</p>
        <p class="lede"><span class="mono">instances = ceil(scope_units / leverage[level])</span></p>
        <p class="lede">A scope unit is one independent instance of the capability's work, and each capability declares what counts as one. Leverage is how many units one person at a level can responsibly span before a second instance is needed. The count itself is per engagement: it comes from answering the capability's intake question at scoping time, so it is never stored in the model. Where a capability declares leverage, it takes the place of the model's generic seat-capacity defaults for that capability.</p>
        <p class="lede">Concurrency is a separate question: do the units have to run at the same time, or can they take turns? Concurrent units are all active at once, so the timeline gives no relief and the people needed are the units divided by the leverage. Sequenceable units can follow one another, so the same people cover more of them and the calendar gets longer. There is no 50/50 split between two units that run one after another, because nothing overlaps. Each unit gets the person's full time while it is active.</p>
        <p class="lede">How much of a person one active unit takes is not recorded. It may be the same number as leverage, one over it, so it stays an open question until a real case shows the two disagree.</p>
        <p class="lede">${scoped.length} of ${capabilities.length} capabilities have some of this defined so far: ${scopedLinks || "none yet"}. Leverage by level is set for ${withLeverage} and concurrency for ${withConcurrency}. ${scopeMarkers.length ? `The figures are ${esc(scopeMarkers.join(", "))}: starting defaults, not drawn from delivery. ` : ""}Every capability shows its own gaps on its card${hypotheses ? `, and ${hypotheses} with nothing defined record a hypothesis about what the unit might be` : ""}. Different domains plausibly count different things (a system, a product surface, an audience), so none is filled in by copying another.</p>
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
      </section>`;
}

function render(model, pageId = "core-philosophy") {
  const page = ALL_PAGES.find((item) => item.id === pageId);
  if (!page) throw new Error(`Unknown page: ${pageId}`);
  const main = page.main(model);
  const generated = new Date().toISOString().slice(0, 10);

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
      display: flex;
      flex-direction: column;
      min-height: calc(100vh - 96px);
    }
    .side-foot {
      margin-top: auto;
      padding-top: 16px;
    }
    .shell.shell-standalone {
      grid-template-columns: minmax(0, 960px);
      justify-content: center;
    }
    .pages {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .page-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--ink);
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 13.5px;
      letter-spacing: 0.01em;
      opacity: 0.4;
      transition: opacity 180ms ease;
    }
    .page-link:hover,
    .page-link[aria-current="page"] {
      opacity: 1;
    }
    .page-link:hover { font-weight: 400; }
    .page-link[aria-current="page"] { font-weight: 600; }
    .page-link[aria-current="page"]::after {
      content: "";
      width: 6px;
      height: 6px;
      border-radius: 99px;
      background: var(--ink);
      flex-shrink: 0;
      animation: nav-dot-in 400ms ease;
    }
    @keyframes nav-dot-in {
      from { opacity: 0; transform: scale(0.4); }
      to { opacity: 1; transform: scale(1); }
    }
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
      display: flex;
      align-items: flex-start;
      gap: 6px;
      font-size: 13.5px;
    }
    .side .toc .link-icon {
      flex-shrink: 0;
      margin-top: 4px;
      color: var(--dim);
    }
    .side .toc a:hover .link-icon {
      color: var(--ink);
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
    .to {
      margin: 0 0 8px;
    }
    .to:last-child { margin-bottom: 0; }
    section { margin: 0 0 84px; padding: 0; }
    section[id], article[id], tr[id] { scroll-margin-top: 24px; }
    .label {
      font-size: 13.5px;
      color: var(--ink);
      font-weight: 600;
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
    .row-head {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      gap: 8px 16px;
      margin-bottom: 4px;
    }
    #capabilities .row-head,
    #risk-shapes .row-head,
    #seams .row-head,
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
    ul.sow {
      margin: 0 0 16px;
      max-width: 760px;
    }
    ul.bullets li {
      padding: 0;
      border: 0;
    }
    ul.bullets li:last-child { margin-bottom: 0; }
    .meta, .dim { color: var(--muted); font-size: 12px; }
    .dim { color: var(--dim); }
    .line-note {
      color: var(--ink);
      font-size: 13px;
      margin-top: 12px;
      max-width: 700px;
    }
    .stage-tag {
      display: inline-block;
      font-family: "Berkeley Mono", "SF Mono", ui-monospace, monospace;
      font-size: 10px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 3px 10px 2px;
      border-radius: 99px;
      background: #e8690b;
      color: #fff;
      margin-left: 10px;
      vertical-align: middle;
    }
    .file-ref {
      font-family: "Berkeley Mono", "SF Mono", ui-monospace, monospace;
      font-size: 0.88em;
      color: #e8690b;
      background: rgba(0,0,0,0.04);
      border: 1px solid var(--line);
      border-radius: 4px;
      padding: 1px 6px;
    }
    .code-block {
      background: rgba(0,0,0,0.03);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 20px 24px;
      max-width: 700px;
      overflow-x: auto;
    }
    .code-block pre {
      margin: 0;
      font-family: "Berkeley Mono", "SF Mono", ui-monospace, monospace;
      font-size: 12.5px;
      line-height: 1.7;
      color: var(--ink);
    }
    .code-block code {
      font-family: inherit;
    }
    .file-ref-dark {
      font-family: "Berkeley Mono", "SF Mono", ui-monospace, monospace;
      font-size: 0.88em;
      color: var(--ink);
      background: rgba(0,0,0,0.04);
      border: 1px solid var(--line);
      border-radius: 4px;
      padding: 1px 6px;
    }
    /* The four principles on Core Philosophy: a title, one paragraph, one link. */
    .principle + .principle { margin-top: 40px; }
    .principle h3 { margin: 0 0 8px; }
    .principle .lede { margin-bottom: 8px; }
    .principle .to { margin-bottom: 0; }
    /* A stage heading that follows a group of steps needs room above it, or it
       reads as the end of the group before it instead of the start of its own. */
    .kvs + .process-stage { margin-top: 56px; }
    /* Agentic mode, inside a stage. A bordered block under the standard content;
       a fork (Design, Test) adds an orange rule so it cannot be skimmed past. */
    /* The Output card is the source of truth for this family: the callout
       and the card share one label style and one width. */
    .agentic {
      margin: 32px 0 0;
      padding: 16px 20px 20px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #FAFAFA;
      max-width: 700px;
    }
    .agentic-fork { border-left: 3px solid #e8690b; }
    .agentic > :last-child { margin-bottom: 0; }
    .agentic .stage-output { background: #fff; max-width: none; }
    .agentic-label {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0 0 12px;
    }
    .agentic-facts { margin: 0 0 16px; font-size: 13.5px; line-height: 1.6; }
    .stage-output {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 24px;
      padding: 16px 20px;
      border: 1px solid var(--line);
      border-radius: 8px;
      max-width: 700px;
    }
    .callout-label {
      font-family: "Berkeley Mono", "SF Mono", ui-monospace, monospace;
      font-size: 10px;
      line-height: 1.4;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      font-weight: 600;
      color: color-mix(in srgb, var(--ink) 40%, transparent);
    }
    .stage-output-body {
      display: flex;
      align-items: baseline;
      gap: 12px;
      font-size: 13.5px;
      line-height: 1.5;
    }
    .stage-output-file {
      flex-shrink: 0;
      white-space: nowrap;
    }
    .cm-back { margin: 0 0 48px; }
    .cm-scroll { overflow-x: auto; margin-top: 32px; }
    /* Each evidence column is as wide as its own header plus the same gap, so
       the white space between "Thinking Time", "Current engagement mapping"
       and "Pilot use" is equal. The columns are not equal width on purpose.
       Header widths (text + info icon): 112, 215, 75. Gap wanted: 72, less the
       16px column-gap. The last column only needs room for its header. */
    .cm { min-width: 800px; }
    .cm-head,
    .cm-row {
      display: grid;
      grid-template-columns: minmax(200px, 260px) 168px 271px 110px;
      column-gap: 16px;
      align-items: center;
    }
    .cm-explainer { max-width: 700px; }
    .cm-today {
      margin: 40px 0 0;
      padding: 16px 20px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #FAFAFA;
      max-width: 700px;
    }
    .cm-today p { margin: 0; }
    .cm-today p + p { margin-top: 8px; }
    .cm-today-head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: 4px 16px;
      margin-bottom: 8px;
    }
    .cm-today .cm-today-head p { margin: 0; }
    .cm-today .cm-today-date { font-size: 11px; text-align: right; }
    .cm-head {
      padding: 8px 0;
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
      background: #FAFAFA;
    }
    .cm-hcell {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13.5px;
      font-weight: 600;
      white-space: nowrap;
    }
    .cm-info { gap: 0; opacity: 0.55; transition: opacity 150ms ease; }
    .cm-info:hover,
    .cm-info:focus-within { opacity: 1; }
    .cm-info .tip {
      white-space: normal;
      width: 260px;
      font-weight: 400;
    }
    .cm-info .tip-end { left: auto; right: 0; }
    .cm-group,
    .cm-single { border-bottom: 1px solid var(--line); }
    .cm-group > summary { list-style: none; cursor: pointer; }
    .cm-group > summary::-webkit-details-marker { display: none; }
    .cm-row { padding: 12px 0; }
    .cm-child { padding: 8px 0; border-top: 1px solid var(--line); }
    .cm-name { display: flex; flex-direction: column; gap: 2px; font-weight: 600; }
    .cm-child .cm-name { font-weight: 400; padding-left: 18px; }
    .cm-name-line { display: flex; align-items: center; gap: 8px; }
    .cm-caret { flex-shrink: 0; transition: transform 180ms ease; }
    .cm-group[open] > summary .cm-caret { transform: rotate(90deg); }
    .cm-spacer { width: 10px; flex-shrink: 0; }
    .cm-note { font-size: 12.5px; font-weight: 400; padding-left: 18px; }
    .cm-child .cm-note { padding-left: 0; }
    .cm-cell { display: flex; align-items: center; gap: 8px; min-height: 18px; }
    .cm-dot {
      width: 10px;
      height: 10px;
      border-radius: 99px;
      background: #e8690b;
      flex-shrink: 0;
    }
    .cm-dot-part { background: #f2b88e; }
    .cm-count { font-size: 12.5px; font-weight: 400; }
    .cm-mode {
      font-size: 12px;
      line-height: 1.4;
      padding: 1px 8px;
      border: 1px solid var(--line);
      border-radius: 99px;
      white-space: nowrap;
    }
    .gt { position: relative; min-width: 1100px; }
    .gt-row {
      display: grid;
      grid-template-columns: 240px 1fr;
      border-top: 1px solid var(--line);
    }
    .gt-head { border-top: 0; }
    .gt-head .gt-lane { min-height: 28px; }
    .gt-name {
      position: sticky;
      left: 0;
      z-index: 3;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      padding: 8px 12px 8px 0;
      background: var(--bg);
    }
    .gt-child .gt-name { padding-left: 20px; }
    .gt-title { font-weight: 600; }
    .gt-child .gt-title { font-weight: 400; }
    .gt-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
    .gt-group-btn, .gt-more {
      font: inherit;
      color: inherit;
      background: none;
      border: 0;
      padding: 0;
      cursor: pointer;
    }
    .gt-group-btn { display: inline-flex; align-items: center; gap: 8px; text-align: left; }
    .gt-more { font-size: 12px; text-decoration: underline; text-underline-offset: 2px; }
    .gt-group-btn:focus-visible, .gt-more:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
    .gt-group-btn[aria-expanded="true"] .cm-caret { transform: rotate(90deg); }
    .gt [hidden] { display: none !important; }
    .gt-lane { position: relative; min-height: 40px; }
    .gt-child .gt-lane { min-height: 40px; }
    .gt-month, .gt-today { position: absolute; top: 0; bottom: 0; width: 1px; background: #E4E4E4; }
    .gt-today { background: #EC4B24; }
    .gt-today-label { position: absolute; top: 4px; padding-left: 6px; font-size: 12px; color: #EC4B24; font-weight: 600; transform: translateY(14px); }
    .gt-month-label { position: absolute; top: 4px; padding-left: 6px; font-size: 12px; }
    .gt-bar {
      --c: #C9A47A;
      position: absolute;
      top: 14px;
      height: 12px;
      border: 1px solid var(--c);
      background: var(--c);
    }
    .gt-thinking { --c: #C9A47A; }
    .gt-mapping { --c: #4E9A6A; }
    .gt-pilot { --c: #EC4B24; box-shadow: 0 0 0 1.5px var(--bg); }
    .gt-solid { position: absolute; left: 0; top: 0; bottom: 0; background: var(--c); }
    .gt-label, .gt-note { position: absolute; top: 14px; font-size: 12px; line-height: 14px; white-space: nowrap; }
    .gt-label { margin-left: 4px; padding: 0 3px; background: var(--bg); z-index: 3; }
    .gt-note { left: 8px; opacity: 0.7; }
    .gt-joint {
      position: absolute;
      left: calc(240px + (100% - 240px) * var(--l));
      width: calc((100% - 240px) * var(--w));
      border: 1.5px solid #EC4B24;
      border-radius: 4px;
      pointer-events: none;
      z-index: 2;
    }
    .gt-joint-label {
      position: absolute;
      left: 8px;
      top: -9px;
      padding: 0 6px;
      font-size: 12px;
      line-height: 16px;
      background: var(--bg);
      white-space: nowrap;
    }
    .gt-panel { display: block; }
    .gt-detail { padding: 8px 0 12px 20px; max-width: 760px; position: sticky; left: 0; }
    .gt-notes { display: flex; flex-direction: column; gap: 2px; }
    .gt-notes .cm-note, .gt-name .cm-note { padding-left: 0; }
    .gt-detail .cm-tests { border-top: 0; padding-left: 0; }
    .gt-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 20px;
      margin: 16px 0 0;
      font-size: 12.5px;
    }
    .gt-key { display: inline-flex; align-items: center; gap: 8px; }
    .gt-swatch { position: relative; top: 0; display: inline-block; width: 22px; height: 10px; }
    .gt-joint-swatch { border: 1.5px solid #EC4B24; border-radius: 3px; background: none; }
    .gt-swatch .gt-solid { width: 100%; }
    .cm-hero { margin: 0 0 40px; }
    .cm-hero-range {
      margin: 0 0 4px;
      font-size: 24px;
      line-height: 1.25;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    .cm-hero-k { font-weight: 400; }
    .cm-hero-sub { margin: 8px 0 0; max-width: 700px; }
    .tl, .loop { display: block; font-family: inherit; }
    .tl-month { stroke: #DCDCDC; stroke-width: 1; }
    .tl-week { stroke: var(--line); stroke-width: 1; }
    .tl-row { stroke: var(--line); stroke-width: 1; }
    .tl-band { fill: #EC4B24; fill-opacity: 0.06; }
    .tl-label, .tl-sub, .tl-trails, .tl-today-label { font-size: 12px; fill: var(--ink); }
    .tl-name { font-size: 13.5px; font-weight: 600; fill: var(--ink); }
    .tl-today { stroke: #EC4B24; stroke-width: 1.4; }
    .tl-today-label { fill: #EC4B24; font-weight: 600; }
    .tl-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 20px;
      margin: 16px 0 0;
      font-size: 12.5px;
    }
    .tl-legend span { display: inline-flex; align-items: center; gap: 8px; }
    .loop-name { font-size: 13px; font-weight: 600; fill: var(--ink); }
    .loop-letter { font-size: 11px; font-weight: 600; fill: #D63B27; }
    .loop-edges {
      list-style: none;
      margin: 16px 0 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      column-gap: 32px;
      max-width: 900px;
    }
    .loop-edge {
      display: flex;
      gap: 12px;
      padding: 8px 0;
      border-top: 1px solid var(--line);
    }
    .loop-key {
      flex: 0 0 20px;
      height: 20px;
      border: 1px solid #D63B27;
      border-radius: 99px;
      color: #D63B27;
      font-size: 11px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .loop-edge-unreal .loop-key { border-style: dashed; }
    .cm-callout {
      margin: 24px 0 0;
      padding: 4px 0 4px 16px;
      border-left: 2px solid #D63B27;
      max-width: 700px;
    }
    .cm-done {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0 32px;
    }
    .cm-done-group { border-top: 1px solid var(--line); padding-top: 12px; }
    .cm-done-group h3,
    .cm-two h3 { margin: 0 0 8px; font-size: 13.5px; font-weight: 600; }
    .cm-done ul,
    .cm-two ul { margin: 0; padding-left: 18px; }
    .cm-done li,
    .cm-two li { margin: 0 0 6px; }
    .cm-done p { margin: 0; }
    .cm-next { min-width: 560px; }
    .cm-next-est { white-space: nowrap; }
    .cm-two {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 0 48px;
    }
    .cm-two h3 { margin-top: 16px; }
    .cm-h { margin: 0 0 12px; font-size: 15px; font-weight: 600; line-height: 1.3; }
    .cm-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .cm-today .cm-today-date { font-size: 12.5px; }
    .cm-changes { list-style: none; margin: 0; padding: 0; }
    .cm-changes li { margin: 0 0 4px; }
    .cm-change-date { display: inline-block; min-width: 48px; }
    .cm-detail { display: flex; flex-direction: column; gap: 2px; padding: 8px 0 0 18px; border-top: 1px solid var(--line); }
    .cm-detail .cm-note { padding-left: 0; }
    .cm-tests { padding: 8px 0 8px 18px; border-top: 1px solid var(--line); }
    .cm-detail + .cm-tests { border-top: 0; padding-top: 4px; }
    .cm-tests p { margin: 0 0 4px; max-width: 700px; }
    .cm-tests-meta { font-size: 12.5px; }
    .prose { margin-bottom: 24px; max-width: 700px; }
    .stack .prose { margin-bottom: 8px; }
    .stack .prose:last-child { margin-bottom: 0; }
    .scroll-x {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      max-width: 100%;
    }
    .scroll-x table { min-width: 640px; }
    .kvs { display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; }
    .kvs:last-child { margin-bottom: 0; }
    .kv {
      display: flex;
      flex-direction: column;
    }
    .kv-body, .kv-body p { font-size: 13.5px; font-weight: 400; line-height: 1.6; }
    .levels-block { display: flex; flex-direction: column; gap: 8px; }
    .levels-block-head { display: flex; align-items: center; gap: 8px; }
    .lvl-mode {
      display: inline-block;
      font-family: "Berkeley Mono", "SF Mono", ui-monospace, monospace;
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 3px;
    }
    .lvl-mode-specific { color: var(--accent); background: #EEF0FB; }
    .lvl-mode-standard-ladder { color: var(--muted); background: var(--hover); }
    .lvl-rows { display: flex; flex-direction: column; }
    .lvl-row {
      display: flex;
      gap: 12px;
      padding: 8px 0;
      border-top: 1px solid var(--line);
    }
    .lvl-row:first-child { border-top: 0; }
    .lvl-tag { flex: 0 0 24px; color: var(--muted); font-size: 12px; padding-top: 1px; }
    .lvl-content { min-width: 0; }
    .lvl-content p { font-size: 13.5px; line-height: 1.6; margin: 0; }
    .lvl-row.is-ladder .lvl-tag { color: var(--dim); }
    .lvl-ladder { color: var(--dim); font-size: 13px; }
    .lvl-ladder:hover { color: var(--muted); }
    .lvl-ladder-note { color: var(--dim); font-size: 13px; }
    .guardrail-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
    .guardrail-chip {
      display: inline-block;
      font-family: "Berkeley Mono", "SF Mono", ui-monospace, monospace;
      font-size: 12px;
      letter-spacing: 0.01em;
      color: var(--muted);
      background: var(--hover);
      padding: 2px 6px;
      border-radius: 3px;
      line-height: 1.4;
    }
    .lvl-boundary { color: var(--ink); }
    .lvl-no-l1 { color: var(--ink); }
    .lvl-no-l1-tag {
      display: inline-block;
      color: var(--muted);
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.04em;
      margin-right: 8px;
    }
    ul.fires { list-style: none; padding: 0; margin: 0; }
    ul.fires li {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
      padding: 6px 0;
      border-top: 1px solid var(--line);
    }
    ul.fires li:first-child { border-top: 0; padding-top: 0; }
    .fires-cap { min-width: 0; }
    .dial {
      flex-shrink: 0;
      display: inline-block;
      font-family: "Berkeley Mono", "SF Mono", ui-monospace, monospace;
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 3px;
      line-height: 1.4;
      cursor: help;
    }
    .dial-dormant { color: var(--dim); background: var(--hover); }
    .dial-low { color: var(--muted); background: var(--hover); }
    .dial-active { color: var(--accent); background: #EEF0FB; }
    .dial-peak { color: #FFFFFF; background: var(--accent); }
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
      .side { position: static; min-height: 0; }
      .side-foot { margin-top: 16px; }
      .side .toc { flex-direction: row; flex-wrap: wrap; gap: 8px 16px; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      * { transition: none !important; animation: none !important; }
    }
  </style>
</head>
<body>
  <div class="shell${page.standalone ? " shell-standalone" : ""}">
    ${
      page.standalone
        ? ""
        : `<aside class="side">
      <nav class="pages" aria-label="Pages">
        ${renderPageLinks(pageId)}
      </nav>
      <nav class="toc" aria-label="On this page">
        ${pageToc(pageId)}
      </nav>
      <nav class="side-foot" aria-label="Apart from the model">
        ${renderFootLinks()}
      </nav>
    </aside>`
    }
    <div class="doc">
      ${main}
      <footer>Generated <span class="mono">${esc(generated)}</span> from the YAML source of truth. Read-only.${page.footerNote?.(model) ? ` ${esc(oneLine(page.footerNote(model)))}` : ""}</footer>
    </div>
  </div>
  <script>
    // Running clock for the Confidence Map note: "4 mins ago". The absolute
    // time inside the element is the fallback when this script does not run.
    (function() {
      var els = document.querySelectorAll('.cm-ago');
      if (!els.length) return;
      function unit(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
      function ago(ms) {
        var m = Math.max(0, Math.floor(ms / 60000));
        if (m < 1) return 'just now';
        if (m < 60) return unit(m, 'min') + ' ago';
        var h = Math.floor(m / 60);
        if (h < 24) return unit(h, 'hr') + (m % 60 ? ' ' + unit(m % 60, 'min') : '') + ' ago';
        return unit(Math.floor(h / 24), 'day') + (h % 24 ? ' ' + unit(h % 24, 'hr') : '') + ' ago';
      }
      function tick() {
        els.forEach(function(el) {
          var since = Date.parse(el.getAttribute('data-since'));
          if (isNaN(since)) return;
          el.textContent = ago(Date.now() - since);
        });
      }
      tick();
      setInterval(tick, 30000);
    })();
  </script>
</body>
</html>`;
}

async function build() {
  // site/ is published to the open web, so it only ever renders the public
  // tier. An overlay of non-public entries can be loaded without leaking here.
  const loaded = await loadModel();
  const model = scopeView(modelView(loaded), PUBLIC_SCOPE);
  model.domains = sortDomains(model.domains);
  const outDir = join(ROOT, "site");
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, ".nojekyll"), "");
  for (const page of ALL_PAGES) {
    await writeFile(join(outDir, page.file), render(model, page.id));
  }
  for (const [file, target] of Object.entries(REDIRECTS)) {
    await writeFile(join(outDir, file), renderRedirect(target));
  }
  console.log(`Wrote ${ALL_PAGES.map((page) => `site/${page.file}`).join(", ")}`);
}

function renderRedirect(target) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Moved</title>
  <meta http-equiv="refresh" content="0; url=${esc(target)}">
  <link rel="canonical" href="${esc(target)}">
  <script>location.replace(${JSON.stringify(target)});</script>
</head>
<body>
  <p>This page moved. <a href="${esc(target)}">Go to the AI-Native SDLC</a>.</p>
</body>
</html>`;
}

function mime(pathname) {
  switch (extname(pathname)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".css":
      return "text/css; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function serve() {
  const siteDir = resolve(join(ROOT, "site"));
  const server = createServer(async (req, res) => {
    let pathname = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`).pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    if (pathname === "/") pathname = "/index.html";
    const file = resolve(siteDir, `.${pathname}`);
    if (file !== siteDir && !file.startsWith(`${siteDir}/`)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": mime(pathname),
        "Cache-Control": "no-store",
      });
      res.end(body);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found. Run npm run build if site/ is missing.");
    }
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `Port ${PORT} is already in use. Stop the old preview (lsof -ti :${PORT} | xargs kill) and run npm run dev again.`,
      );
      process.exit(1);
    }
    throw err;
  });
  // IPv4 on all interfaces: macOS IPv6-only binds make http://127.0.0.1:4173 fail,
  // and Cursor port forwarding needs a non-loopback listen.
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Preview at http://127.0.0.1:${PORT}`);
  });
}

await build();
if (process.argv.includes("--serve")) serve();
