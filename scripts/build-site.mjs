#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import {
  PUBLIC_SCOPE,
  REPO_ROOT,
  domainRank,
  loadModel,
  modelView,
  oneLine,
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
// blank line — the thing they would expect to work.
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
    id: "how-it-all-relates",
    title: "How it all relates",
    file: "index.html",
    main: renderHowItRelatesMain,
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
  {
    id: "delivery-lifecycles",
    title: "Delivery Lifecycles",
    toggleOnly: true,
    children: [
      {
        id: "ai-sdlc",
        title: "AI-Native Strategy",
        file: "ai-sdlc.html",
        main: renderAiSdlcMain,
      },
      {
        id: "tactical-playbook",
        title: "AI-Native Tactical",
        file: "tactical-playbook.html",
        main: renderTacticalPlaybookMain,
      },
      {
        id: "adlc",
        title: "Agentic",
        file: "adlc.html",
        main: renderAdlcMain,
      },
      {
        id: "adlc-tactical",
        title: "Agentic Tactical",
        file: "adlc-tactical.html",
        main: renderAdlcTacticalMain,
      },
      {
        id: "new-discovery",
        title: "New Discovery",
        file: "new-discovery.html",
        main: renderNewDiscoveryMain,
      },
    ],
  },
];

// Flat list of every renderable page for build output, render lookup, and TOC.
// Toggle-only parents (no file/main) are excluded — they exist only in the nav.
const ALL_PAGES = PAGES.flatMap((page) =>
  page.toggleOnly ? (page.children ?? []) : [page, ...(page.children ?? [])],
);

const ILLUSTRATIONS = "assets/how-it-all-relates-illustrations";

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
  "how-it-all-relates": [
    ["#overview", "One list"],
    ["#the-spine", "The spine"],
    ["#two-questions", "Two questions"],
    ["#surface-area", "Surface area"],
    ["#three-verbs", "Three verbs"],
    ["#seats", "Seats"],
    ["#the-sow", "The SOW"],
  ],
  "capability-model": [
    ["#overview", "Overview"],
    ["#domains", "Domains"],
    ["#capabilities", "Capabilities"],
    ["#agent-skills", "Agent Skills"],
  ],
  "roles-titles": [
    ["#overview", "Overview"],
    ["#commercial-stack", "The SOW"],
    ["#lines", "Lines"],
    ["#title-ownership-seat", "Title · Ownership · Seat"],
    ["#doctrine-seat-fulfilment", "Filling seats"],
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
    ["#pipeline", "Pipeline"],
    ["#how-stages-and-risk-work", "Stages vs risk shapes"],
    ["#stage-0", "0 · Intent Framing"],
    ["#stage-1", "1 · Evidence Gate"],
    ["#stage-2", "2 · Design"],
    ["#stage-3", "3 · Build"],
    ["#stage-4", "4 · Test"],
    ["#stage-5", "5 · Deploy"],
    ["#stage-6", "6 · Maintain"],
    ["#domains-across", "Domains across stages"],
    ["#adaptation", "Adaptation matrix"],
    ["#gaps", "Known gaps"],
  ],
  "tactical-playbook": [
    ["#overview", "Overview"],
    ["#anthropic-mapping", "Anthropic mapping"],
    ["#tactical-0", "0 · Intent Framing"],
    ["#tactical-1", "1 · Evidence Gate"],
    ["#tactical-2", "2 · Design"],
    ["#tactical-3", "3 · Build"],
    ["#tactical-4", "4 · Test"],
    ["#tactical-5", "5 · Deploy"],
    ["#tactical-6", "6 · Maintain"],
    ["#reconciliation", "Reconciliation log"],
    ["#open-gaps", "Open gaps"],
  ],
  "adlc": [
    ["#overview", "Overview"],
    ["#core-shifts", "Core shifts"],
    ["#stages", "The 8 stages"],
    ["#stage-0", "0 · Preparation"],
    ["#stage-1", "1 · Scope Framing"],
    ["#stage-2", "2 · Architecture"],
    ["#stage-3", "3 · Proof of Value"],
    ["#stage-4", "4 · Implementation"],
    ["#stage-5", "5 · Testing"],
    ["#stage-6", "6 · Deployment"],
    ["#stage-7", "7 · Learning"],
  ],
  "adlc-tactical": [
    ["#overview", "Overview"],
  ],
  "new-discovery": [
    ["#overview", "Overview"],
    ["#sdlc-stages", "AI-Native SDLC stages"],
    ["#adlc-stages", "Agentic stages"],
  ],
};

function pageToc(pageId) {
  const links = PAGE_TOC[pageId] ?? [["#overview", "Overview"]];
  return links.map(([href, label]) => tocLink(href, label)).join("\n        ");
}

function renderPageLinks(pageId) {
  return PAGES.map((item) => {
    const kids = item.children ?? [];
    const selfActive = item.id === pageId;
    const childActive = kids.some((kid) => kid.id === pageId);
    const groupOpen = selfActive || childActive;

    const href = selfActive ? "#overview" : item.file;
    const current = selfActive ? ' aria-current="page"' : "";

    if (!kids.length) {
      return `<a class="page-link"${current} href="${esc(href)}">${esc(item.title)}</a>`;
    }

    const childLinks = kids
      .map((kid) => {
        const kidActive = kid.id === pageId;
        const kidHref = kidActive ? "#overview" : kid.file;
        const kidCurrent = kidActive ? ' aria-current="page"' : "";
        return `<a class="page-link page-child"${kidCurrent} href="${esc(kidHref)}">${esc(kid.title)}</a>`;
      })
      .join("\n            ");

    const caret = `<svg class="page-caret${groupOpen ? " open" : ""}" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 2l4 3-4 3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    const parentEl = item.toggleOnly
      ? `<span class="page-link page-toggle">${esc(item.title)}${caret}</span>`
      : `<a class="page-link"${current} href="${esc(href)}">${esc(item.title)}${caret}</a>`;

    return `<div class="page-group${groupOpen ? " open" : ""}">
          ${parentEl}
          <div class="page-children">
            ${childLinks}
          </div>
        </div>`;
  }).join("\n        ");
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
// `standard-ladder` ones — never hardcoded per-capability prose here.
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

function renderCap(cap, domains, legend) {
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
        ${kv("Shape", `<p>${esc(oneLine(title.shape))}</p>`)}
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

function renderDoctrine(doctrine, capsById, { heading = false } = {}) {
  const steps = (doctrine.steps ?? [])
    .map((step, index) => {
      const never = step.never
        ? `<p class="dim">Never: ${esc(oneLine(step.never))}</p>`
        : "";
      const caps = (step.capabilities ?? []).length
        ? `<p class="dim">Invokes: ${step.capabilities.map((id) => capLink(id, capsById)).join(", ")}</p>`
        : "";
      return kv(
        `${index + 1} · ${oneLine(step.name)}`,
        `<p>${esc(oneLine(step.description))}</p>${never}${caps}`,
      );
    })
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
  const { titles, capabilities, domains, definitions } = model;
  const capsById = byId(capabilities);
  const domainsById = byId(domains);
  const definitionsById = byId(definitions);

  const lines = [...titles]
    .sort((a, b) => (a.reading_order ?? 99) - (b.reading_order ?? 99))
    .map((title) => renderTitle(title, capsById, domainsById))
    .join("");

  const stack = requireDoctrine(model, "commercial-stack");
  const fulfilment = requireDoctrine(model, "seat-fulfilment");

  const layer = (id) => {
    const definition = definitionsById.get(id);
    if (!definition) throw new Error(`Missing definition: ${id}`);
    return renderLayer(definition);
  };

  // The layers in the order they read: what you group under, what you are
  // accountable for, how deep, what you are doing now — then how that seat
  // actually gets a person in it, before who you are at the firm.
  const layers = [
    layer("title"),
    layer("capability-ownership"),
    layer("level"),
    layer("seat"),
    renderDoctrine(fulfilment, capsById, { heading: true }),
    layer("consultant-band"),
  ].join("");

  return `
      <section id="overview">
        <h1 class="mono uppercase eyebrow">Core Philosophy</h1>
        <p class="lede">Capabilities are the contract. Seats are the fulfillment. Titles are internal coverage.</p>
        <p class="lede">The SOW sells an outcome, priced from the capabilities-at-levels underneath it — never headcount, and never a title. A title is internal shorthand for a coherent bundle of owned capabilities; it groups coverage, it isn't a thing a client buys.</p>
        <p class="lede">An L4 is the atomic internal unit — accountable for one capability cluster's maturity. L4s compose into the lines below: common compositions, named for internal coverage, not for the market.</p>
        <p class="lede">A pair of single-spike L4s and one M-shaped person can fulfil the same commitment. The contract promises capabilities at levels; it doesn't care who covers them.</p>
        <p class="lede">Five lines cover every capability, so each has a coherent home and none is a grab-bag — now an enforced invariant, not just a claim.</p>
      </section>
      <section id="commercial-stack">
        <h2 class="mono uppercase eyebrow">${esc(stack.name)}</h2>
        <div class="stack">
        ${renderDoctrine(stack, capsById)}
        </div>
      </section>
      <section id="lines">
        <h2 class="mono uppercase eyebrow">Lines</h2>
        <div class="stack">
        ${lines}
        </div>
      </section>
      <section id="title-ownership-seat">
        <h2 class="mono uppercase eyebrow">Title · Ownership · Seat</h2>
        <div class="stack">
        ${layers}
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
        ${figure("06-operating-view.png", "Risk turns intensity dials; work flows across seams.")}
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
        <p class="lede">The recurring kinds of "riskiest unknown." Each names an unknown, activates a set of capabilities at a dial, and produces an output that becomes available as input to whatever fires next. Shapes co-occur, recur, and persist — the order they fire in is not fixed.</p>
        ${dialsDraft ? `<p class="line-note">Dial values are authored drafts. They have not been reviewed, and no page or document recorded them before now.</p>` : ""}
        <div class="stack">
        ${shapes}
        </div>
      </section>
      <section id="seams">
        <h2 class="mono uppercase eyebrow">Seams</h2>
        <p class="lede">The load-bearing handoffs between capabilities. A seam is the interface between two capabilities: what must cross, in what form. This is the floor — the minimum for a valid handoff. It holds regardless of tool; AI carries the artifact across, judgment decides whether what crossed is right.</p>
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

function figure(file, caption) {
  const src = sitePath(`${ILLUSTRATIONS}/${file}`);
  return `<figure class="figure">
        <img src="${esc(src)}" alt="${esc(caption)}" width="1536" height="1024">
      </figure>`;
}

function to(href, label) {
  return `<p class="to"><a href="${esc(href)}">${esc(label)} →</a></p>`;
}

// A page may never claim more confidence than the model records, so the bracket
// marker is read from capacity-model.yaml rather than written into the prose.
function confidenceMarker(value, qualifier) {
  const token = String(value ?? "")
    .replace(/^\[|\]$/g, "")
    .trim();
  if (!token) {
    throw new Error(
      "Missing confidence marker in capacity-model.yaml. Run npm run validate.",
    );
  }
  return qualifier ? `[${token}; ${qualifier}]` : `[${token}]`;
}

function requireLifecycle(model, id) {
  const found = (model.lifecycles ?? []).find((lc) => lc.id === id);
  if (!found) throw new Error(`Missing lifecycle: ${id}`);
  return found;
}

function renderStage(stage) {
  const procedures = (stage.procedures ?? [])
    .map((p) => kv(p.name, `<p>${esc(oneLine(p.description))}</p>`))
    .join("");
  const practices = (stage.practices ?? [])
    .map((p) => kv(p.name, `<p>${esc(oneLine(p.description))}</p>`))
    .join("");
  const note = stage.note
    ? `<p class="line-note">${esc(oneLine(stage.note))}</p>`
    : "";
  const output = stage.output
    ? `<p class="line-note">Output: ${esc(oneLine(stage.output))}</p>`
    : "";
  return `
      <section id="stage-${stage.number}">
        <h2 class="mono uppercase eyebrow">Stage ${stage.number} · ${esc(stage.name)}</h2>
        <p class="lede">${esc(oneLine(stage.objective))}</p>
        ${note}
        ${procedures ? `<div class="kvs">${procedures}</div>` : ""}
        ${practices ? `<div class="kvs">${practices}</div>` : ""}
        ${output}
      </section>`;
}

function renderStageWithTactical(stage) {
  const procedures = (stage.procedures ?? [])
    .map((p) => kv(p.name, `<p>${esc(oneLine(p.description))}</p>`))
    .join("");
  const tooling = (stage.tooling ?? []).length
    ? kv("Tooling", `<p>${esc(stage.tooling.join("; "))}.</p>`)
    : "";
  const agents = (stage.agents_and_hooks ?? [])
    .map(
      (a) =>
        `<li><strong>${esc(a.name)}</strong> — ${esc(oneLine(a.description))}</li>`,
    )
    .join("");
  const agentsBlock = agents
    ? kv("Agents & hooks", `<ul class="bullets">${agents}</ul>`)
    : "";
  const note = stage.note
    ? `<p class="line-note">${esc(oneLine(stage.note))}</p>`
    : "";
  const output = stage.output
    ? `<p class="line-note">Artifact: ${esc(oneLine(stage.output))}</p>`
    : "";
  return `
      <section id="stage-${stage.number}">
        <h2 class="mono uppercase eyebrow">Stage ${stage.number} · ${esc(stage.name)}</h2>
        <p class="lede">${esc(oneLine(stage.objective))}</p>
        ${note}
        ${procedures ? `<div class="kvs">${procedures}</div>` : ""}
        ${tooling || agentsBlock ? `<div class="kvs">${tooling}${agentsBlock}</div>` : ""}
        ${output}
      </section>`;
}

function renderAiSdlcMain(model) {
  const lc = requireLifecycle(model, "ai-native-sdlc");
  const stages = lc.stages ?? [];
  const riskShapeNames = new Map(
    (model.riskShapes ?? []).map((s) => [s.id, s.name]),
  );
  const domainNames = new Map((model.domains ?? []).map((d) => [d.id, d.name]));

  const pipelineRows = stages
    .map(
      (s) =>
        `<tr><td><strong>${s.number} · ${esc(s.name)}</strong></td><td>${esc(s.artifact)}</td><td>${esc(s.gate)}</td></tr>`,
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
      return `<tr><td>${s.number} · ${esc(s.name)}</td><td>${esc(primary)}</td><td>${esc(secondary)}</td><td>${esc(shapes)}</td></tr>`;
    })
    .join("");

  const adaptationRows = stages
    .filter((s) => s.adaptation)
    .map(
      (s) =>
        `<tr><td>${s.number} · ${esc(s.name)}</td><td>${esc(oneLine(s.adaptation.approach))}</td><td>${esc(s.artifact)}</td><td>${esc(oneLine(s.adaptation.governance))}</td></tr>`,
    )
    .join("");

  const domainNotes = (lc.domain_notes ?? [])
    .map(
      (dn) =>
        `<p class="lede"><strong>${esc(domainNames.get(dn.domain) ?? dn.domain)}</strong> ${esc(oneLine(dn.note))}</p>`,
    )
    .join("");

  const gapItems = (lc.gaps ?? [])
    .map((g) => kv(g.name, `<p>${esc(oneLine(g.description))}</p>`))
    .join("");

  const stageBlocks = stages.map((s) => renderStage(s)).join("");

  return `
      <section id="overview">
        <h1 class="mono uppercase eyebrow">${esc(lc.name)}</h1>
        <p class="lede">${esc(oneLine(lc.summary))}</p>
        <p class="lede">${esc(oneLine(lc.description))}</p>
        ${lc.pipeline_note ? `<p class="lede"><strong>${esc(oneLine(lc.pipeline_note))}</strong></p>` : ""}
      </section>

      <section id="pipeline">
        <h2 class="mono uppercase eyebrow">The pipeline</h2>
        <table class="hairline-table">
          <thead>
            <tr><th>Stage</th><th>Core artifact</th><th>Gate</th></tr>
          </thead>
          <tbody>${pipelineRows}</tbody>
        </table>
      </section>

      <section id="how-stages-and-risk-work">
        <h2 class="mono uppercase eyebrow">How stages and risk shapes work together</h2>
        <p class="lede">Stages are artifact order. They describe the sequence of what you produce and which governance gate you pass through. Risk shapes are the real-time operating picture — they describe which capabilities run hot right now, regardless of which stage the work is in.</p>
        <p class="lede">A risk shape fires wherever it fires. The Feasibility shape can spike during Intent Framing if an architecture constraint surfaces early. The Value shape can stay active deep into Build if a prior assumption gets challenged. Shapes co-occur, recur, and persist — they are not bound to a single stage.</p>
        <p class="lede">The stage tells you what artifact you owe. The live risk mix tells you what to worry about while you produce it. You are always in a stage, and you are always responding to risk shapes.</p>
        <p class="lede">Stages have a default gravity — 0 through ${stages.length - 1} — but change events and failed gates send you back. The change-response doctrine runs at any stage: re-read the risk, re-set the dials, decision gate, re-staff, re-price and re-time, name the next slice.</p>
      </section>

      ${stageBlocks}

      <section id="domains-across">
        <h2 class="mono uppercase eyebrow">Domains and risk shapes across the pipeline</h2>
        <p class="lede">Each stage has a primary domain driving the work and risk shapes that are typically hottest at that point. Framing tapers over time but does not hard-stop at the Evidence Gate. Proof runs at the Gate, Test, and Maintain stages, handling distinct but related evaluation tasks.</p>
        <table class="hairline-table">
          <thead>
            <tr><th>Stage</th><th>Primary domain</th><th>Secondary</th><th>Risk shapes typically hot</th></tr>
          </thead>
          <tbody>${domainRows}</tbody>
        </table>
        <p class="lede">Risk shapes are listed where they are typically hottest, not where they only fire. Any shape can spike at any stage.</p>
        ${domainNotes}
      </section>

      <section id="adaptation">
        <h2 class="mono uppercase eyebrow">Adaptation matrix</h2>
        <table class="hairline-table">
          <thead>
            <tr><th>Stage</th><th>AI-Native approach</th><th>Artifact</th><th>Governance</th></tr>
          </thead>
          <tbody>${adaptationRows}</tbody>
        </table>
      </section>

      ${gapItems ? `<section id="gaps"><h2 class="mono uppercase eyebrow">Known gaps</h2><div class="kvs">${gapItems}</div></section>` : ""}`;
}

function renderAdlcMain(model) {
  const lc = requireLifecycle(model, "adlc");
  const stages = lc.stages ?? [];

  const shiftRows = (lc.core_shifts ?? [])
    .map(
      (s) =>
        `<tr><td><strong>${esc(s.dimension)}</strong></td><td>${esc(s.sdlc)}</td><td>${esc(s.adlc)}</td></tr>`,
    )
    .join("");

  const overviewRows = stages
    .map(
      (s) =>
        `<tr><td><strong>${s.number}</strong></td><td>${esc(s.name)}</td><td>${esc(oneLine(s.objective))}</td></tr>`,
    )
    .join("");

  const cu = lc.commercial_unit;
  const cuNote = cu
    ? `<p class="lede">Commercially, Stages ${cu.stages.join(" through ")} encompass the ${esc(cu.name)}.</p>`
    : "";

  const stageBlocks = stages.map((s) => renderStageWithTactical(s)).join("");

  return `
      <section id="overview">
        <h1 class="mono uppercase eyebrow">${esc(lc.name)}</h1>
        <p class="lede">${esc(oneLine(lc.summary))}</p>
        <p class="lede">${esc(oneLine(lc.description))}</p>
      </section>

      ${shiftRows ? `<section id="core-shifts">
        <h2 class="mono uppercase eyebrow">Core shifts: SDLC vs ADLC</h2>
        <table class="hairline-table">
          <thead><tr><th>Dimension</th><th>SDLC</th><th>ADLC</th></tr></thead>
          <tbody>${shiftRows}</tbody>
        </table>
      </section>` : ""}

      <section id="stages">
        <h2 class="mono uppercase eyebrow">The ${stages.length} stages</h2>
        ${cuNote}
        <table class="hairline-table">
          <thead><tr><th>Stage</th><th>Name</th><th>Core question</th></tr></thead>
          <tbody>${overviewRows}</tbody>
        </table>
      </section>

      ${stageBlocks}`;
}

function renderTacticalPlaybookMain() {
  return `
      <section id="overview">
        <h1 class="mono uppercase eyebrow">Tactical Playbook</h1>
        <p class="lede">The reconciled tactical execution behind the AI-Native SDLC — the exact skills, hooks, agents, and file names behind each stage, checked against Anthropic's published playbook.</p>
        <p class="lede">The <a href="ai-sdlc.html">AI-Native SDLC</a> is the what and why. This page is the how.</p>
      </section>

      <section id="anthropic-mapping">
        <h2 class="mono uppercase eyebrow">How our stages map to Anthropic's 6</h2>
        <p class="lede">Anthropic's playbook runs six stages: Plan → Design → Build → Test → Deploy → Maintain. Sparq splits the first stage into two gates, sold together as one commercial unit — the Evidence Sprint. This is the actual differentiator.</p>
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
        <p class="lede"><strong>Commercially:</strong> Stages 0–1 together are the Evidence Sprint — the thing that used to be pitched as discovery, now scoped to roughly 2 weeks because the output is evidence and a costed Build decision, not a stack of workshop artifacts. Everything from Design onward tracks Anthropic's canonical mechanics closely.</p>
      </section>

      <section id="tactical-0">
        <h2 class="mono uppercase eyebrow">Stage 0 · Intent Framing — Tactical</h2>
        <p class="line-note">First half of the Evidence Sprint.</p>
        <div class="kvs">
          ${kv("Practice", "<p>A 2–4 hour structured workshop. 10 min silent assumption dump sorted into Value / Usability / Feasibility / Viability / Operational → failure premortem → architecture exposure with engineering. No untagged claims survive the file.</p>")}
          ${kv("Tooling", "<p>Meeting-transcription MCP (Whisper/Fathom/Recall.ai) for live capture, plus Miro/Mural/Slack MCP for stickies and threads.</p>")}
        </div>
        <div class="kvs">
          ${kv("intent-elicitor skill", "<p>Interactive elicitation — asks probing questions, rephrases claims as testable assertions.</p>")}
          ${kv("assumption-extractor skill", "<p>Parses the transcript in real time and auto-tags into the 5 risk categories.</p>")}
          ${kv("premortem-adversary subagent", "<p>Red-teams the room on technical constraints and unstated dependencies.</p>")}
          ${kv("assumption-linter hook", "<p>Pre-commit. Rejects the commit if any claim lacks an [ASSUMPTION: Category] tag.</p>")}
        </div>
        <p class="line-note">Artifact: raw intent.md, 100% tagged. Facilitator validates tagging before it moves.</p>
      </section>

      <section id="tactical-1">
        <h2 class="mono uppercase eyebrow">Stage 1 · Evidence Gate — Tactical</h2>
        <p class="line-note">Second half of the Evidence Sprint — the execution part of discovery.</p>
        <div class="kvs">
          ${kv("Practice", "<p>Pull the highest-risk Value/Usability assumption. Frame a minimal external-facing slice. Attach it to a real client touchpoint — synthetic-only validation is disallowed without a logged exception. Record signal. Product + Delivery decide: Promote / Iterate / Pivot / Stop. On a Promote, close by merging cleared intent.md into /intent/, mapping scope blocks into the enterprise tracker, and defining hard boundary markers.</p>")}
          ${kv("Repo home", "<p>Evidence Work skills and the resulting evidence-of-signal live in a per-project repo. That's also where the ESOA lives — transitioning from a solutions-side version into the delivery-side version rather than being recreated.</p>")}
          ${kv("Vision Prototype", "<p>Distinct from the narrow Evidence Slice. Where an Evidence Slice tests one assumption, a Vision Prototype is a holistic build — full breadth, selective depth — meant to show the client the future-state value, not validate a single risk. Optional per engagement, but when built, it sits alongside the Promote decision and the costed Build proposal.</p>")}
          ${kv("Tooling", "<p>Conversation Intelligence MCP (Gong/Zoom/Teams/Chorus) for signal capture; Enterprise Tracker MCP (Jira/Azure DevOps/ServiceNow) and a non-interactive Claude CI runner for the close.</p>")}
        </div>
        <div class="kvs">
          ${kv("evidence-synthesizer skill", "<p>Maps quotes to tagged assumptions, evaluates signal strength, and caps internal-only feedback at Directional confidence so it can't be mistaken for a real-occasion validation.</p>")}
          ${kv("synthetic-user-dryrun subagent", "<p>Pre-gate multi-persona simulation so live client time isn't burned on an obviously broken pitch.</p>")}
          ${kv("gate-signoff-validator hook", "<p>Blocks the push to /intent/ unless an explicit decision tag and signature block are present.</p>")}
          ${kv("tracker-sync skill", "<p>Automates mapping between Markdown scope blocks and enterprise epic/story schemas.</p>")}
          ${kv("cleared-intent-trigger", "<p>GitHub Action that fires only when the intent.md frontmatter reads gate_status: cleared, instantiating Stage 2 (Design).</p>")}
        </div>
        <p class="line-note">Artifact: intent.md (cleared, synced, merged to main) + per-project ESOA (carried forward) + optional Vision Prototype.</p>
      </section>

      <section id="tactical-2">
        <h2 class="mono uppercase eyebrow">Stage 2 · Design — Tactical</h2>
        <div class="kvs">
          ${kv("Practice", "<p>Compressed design session(s), Claude + core engineering leads. Enterprise skills injected into context. Architecture must satisfy the Evidence Gate's operational bounds without over-building beyond intent.md.</p>")}
          ${kv("Tooling", "<p>Figma MCP or repo-native design — design capability doesn't have to live in Figma. Where the capability is confidently prototype-driven, the design system is built directly in Claude Code / Cursor and lives in the repo, feeding spec.md without a Figma round-trip. Choose per project; both paths converge on the same artifact.</p>")}
        </div>
        <div class="kvs">
          ${kv(".claude/skills/security-baseline", "<p>Organization-wide security compliance skill.</p>")}
          ${kv(".claude/skills/brand-guidelines", "<p>Brand compliance skill.</p>")}
          ${kv(".claude/skills/ux-design-system", "<p>UX standards skill.</p>")}
          ${kv(".claude/skills/adlc-agent-guardrails", "<p>Agent behavioral guardrails skill.</p>")}
          ${kv("spec-compliance-linter", "<p>Verifies spec.md has every required section (API specs, failure modes, data models) before the stage can transition.</p>")}
        </div>
        <p class="line-note">Artifact: spec.md. Design/Tech Lead review.</p>
      </section>

      <section id="tactical-3">
        <h2 class="mono uppercase eyebrow">Stage 3 · Build — Tactical</h2>
        <div class="kvs">
          ${kv("Practice", "<p>Git worktree isolation (cap 2–3 per engineer). Plan Mode first — Claude writes plan.md before touching source. Engineer accepts the plan, then code generation starts. Scoped Auto Mode execution within defined paths. Deliberately mimics Anthropic's own Build stage — plan mode, CLAUDE.md, subagents, hooks. Sparq-specific tooling layers on top.</p>")}
          ${kv("Tooling", "<p>Claude Code CLI, CLAUDE.md as the repo's context engine.</p>")}
        </div>
        <div class="kvs">
          ${kv(".claude/agents/verifier.md", "<p>Spins up a fresh context window, runs the app, verifies behavior against plan.md.</p>")}
          ${kv(".claude/agents/simplifier.md", "<p>Strips redundant abstraction from generated diffs.</p>")}
          ${kv(".claude/agents/prompt-evaluator.md", "<p>For builds with embedded AI agents — evaluates prompt responses for safety/hallucination/tool-calling accuracy.</p>")}
          ${kv("path-blocking-hook", "<p>Intercepts file edits outside the scope defined in plan.md.</p>")}
        </div>
        <p class="line-note">Artifact: plan.md and verified code diffs, in isolated branches. Engineer plan acceptance.</p>
      </section>

      <section id="tactical-4">
        <h2 class="mono uppercase eyebrow">Stage 4 · Test — Tactical</h2>
        <div class="kvs">
          ${kv("Practice", "<p>Agent self-verification (build, unit tests, visual regression) before submission. Non-interactive CI eval suite runs 20–50 task scenarios. Test files are read-only during bug-fix tasks — the agent must fix the code, never weaken the assertion.</p>")}
          ${kv("Tooling", "<p>Headless Playwright/Puppeteer MCP, .github/workflows/agent-evals.yml.</p>")}
        </div>
        <div class="kvs">
          ${kv("lock-tests.sh hook", "<p>Blocks Edit/Write on tests/** during bug-fix tasks.</p>")}
          ${kv("eval-pass-checker", "<p>Blocks PR merge if task accuracy falls below the threshold.</p>")}
        </div>
        <p class="line-note">Artifact: verification logs and CI evaluation pass results. Automated CI pass threshold.</p>
      </section>

      <section id="tactical-5">
        <h2 class="mono uppercase eyebrow">Stage 5 · Deploy — Tactical</h2>
        <div class="kvs">
          ${kv("Practice", "<p>Multi-pass PR review (Bugs → Security/PII → spec.md/plan.md compliance). Environment autonomy is tiered: Dev is fully autonomous, Staging requires a clean CI eval run plus automated review, Production requires named human Release Manager sign-off.</p>")}
          ${kv("Tooling", "<p>Claude Code PR Review Agent.</p>")}
        </div>
        <div class="kvs">
          ${kv(".claude/agents/pr-reviewer.md", "<p>Multi-pass review writing findings to REVIEW.md.</p>")}
          ${kv("Managed-settings engine", "<p>allowManagedHooksOnly, permissions.deny, sandboxed shell, disableSideloadFlags, allowManagedMcpServersOnly — matching Anthropic's reference settings.json.</p>")}
          ${kv("network-egress-blocker hook", "<p>Its own named control rather than folded into managed settings generically.</p>")}
        </div>
        <p class="line-note">Artifact: REVIEW.md, PR findings, release log. Human Release Manager sign-off on Production only.</p>
      </section>

      <section id="tactical-6">
        <h2 class="mono uppercase eyebrow">Stage 6 · Maintain — Tactical</h2>
        <div class="kvs">
          ${kv("Practice", "<p>Statistical process control on bands.yaml (Western Electric rules). On a breach, a background agent diagnoses root cause and writes a fresh raw intent.md back into Stage 0's triage queue — closing the loop without a human starting it. On-call engineers can also tag Claude directly in incident threads. Every resolved bug becomes a permanent regression case in the Stage 4 eval suite.</p>")}
          ${kv("Tooling", "<p>Infra MCP (Datadog/Prometheus/New Relic) and Product Analytics MCP (PostHog/Mixpanel/Pendo/Zendesk) feeding the same sensor.</p>")}
        </div>
        <div class="kvs">
          ${kv("metric-watcher daemon", "<p>Background monitor triggering triage agents on band breaches.</p>")}
          ${kv("incident-to-eval-compiler", "<p>Turns post-mortem logs into permanent regression tests.</p>")}
          ${kv("Claude Tag", "<p>ChatOps bot for on-call — Anthropic's actual Claude Tag product, not a generic ChatOps MCP Bot.</p>")}
        </div>
        <p class="line-note">Artifact: bands.yaml updates, incident records, new regression cases added to Stage 4. Service Owner / on-call triage.</p>
      </section>

      <section id="reconciliation">
        <h2 class="mono uppercase eyebrow">Reconciliation log</h2>
        <p class="lede">Every place the two internal source documents disagreed and the call that was made.</p>
        <table class="hairline-table">
          <thead>
            <tr><th>Stage</th><th>Conflict</th><th>Call made</th></tr>
          </thead>
          <tbody>
            <tr><td>0</td><td>assumption-extractor (A) vs intent-elicitor + assumption-linter (B)</td><td>Not a conflict — different functions. Keep all three.</td></tr>
            <tr><td>0</td><td>Workshop length: 60–90 min (both docs)</td><td>Extended to 2–4 hrs to reflect real client kickoffs.</td></tr>
            <tr><td>1</td><td>Skill named evidence-signal-check (A) vs evidence-synthesizer (B)</td><td>Canonicalize as evidence-synthesizer.</td></tr>
            <tr><td>1</td><td>Separate confidence-decision.md (A) vs updated intent.md (B)</td><td>Canonicalize as intent.md updated in place, in the per-project repo alongside the ESOA.</td></tr>
            <tr><td>1</td><td>Old Stage 2 (tracker sync) as its own numbered stage</td><td>Folded into Stage 1 as a closing action — automatic result of a Promote.</td></tr>
            <tr><td>2</td><td>4 compliance skills (A) vs 2 (B)</td><td>Keep A's full 4; add B's spec-compliance-linter on top.</td></tr>
            <tr><td>2</td><td>Figma-only tooling (both docs)</td><td>Added repo-native design as an equal path, not a fallback.</td></tr>
            <tr><td>3/4</td><td>Test-lock hook placed at Build (A) vs Test (B)</td><td>Move to Test — matches Anthropic's own placement.</td></tr>
            <tr><td>3</td><td>prompt-evaluator.md present (A) vs absent (B)</td><td>Keep — relevant for embedded-AI-agent builds.</td></tr>
            <tr><td>5</td><td>Bundled MDM settings (A) vs split config-engine + network hook (B)</td><td>Canonicalize on B's split, matches Anthropic's reference settings.json.</td></tr>
            <tr><td>6</td><td>Generic ChatOps MCP Bot (B)</td><td>Rename to Claude Tag — it's a real, named Anthropic product.</td></tr>
          </tbody>
        </table>
      </section>

      <section id="open-gaps">
        <h2 class="mono uppercase eyebrow">Open gaps vs Anthropic's playbook</h2>
        <div class="kvs">
          ${kv("CLAUDE.md as governed artifact", "<p>Anthropic treats CLAUDE.md with its own feedback loop — the correction goes into CLAUDE.md the second time an agent repeats a mistake, and PR review flags staleness. Neither internal doc gives CLAUDE.md this maintenance loop; it's currently just a context source.</p>")}
          ${kv("Scheduled security scanning", "<p>Anthropic's Deploy stage includes scheduled, model-driven security scanning (Claude Security) running independently of PR review — a recurring scan, not point-in-time, with findings fed back as fresh intent.md. Sparq's only security coverage at Deploy is currently the PR review pass.</p>")}
          ${kv("Leading/lagging metrics per stage", "<p>Anthropic's playbook defines explicit metrics per stage (e.g., time from intent.md commit to spec.md commit; first-pass CI success rate; time from band breach to intent.md in triage). Neither internal doc names how Sparq will measure whether the pipeline itself is working.</p>")}
        </div>
      </section>`;
}

function renderAdlcTacticalMain() {
  return `
      <section id="overview">
        <h1 class="mono uppercase eyebrow">Agentic Tactical</h1>
        <p class="lede">The tactical execution details for the Agentic Development Lifecycle — skills, hooks, agents, and file names behind each phase.</p>
        <p class="lede">Placeholder — content is being authored.</p>
      </section>`;
}

function renderNewDiscoveryMain(model) {
  const sdlc = requireLifecycle(model, "ai-native-sdlc");
  const adlc = requireLifecycle(model, "adlc");

  const sdlcCu = sdlc.commercial_unit;
  const sdlcStages = (sdlc.stages ?? []).filter((s) =>
    (sdlcCu?.stages ?? []).includes(s.number),
  );
  const sdlcRows = sdlcStages
    .map(
      (s) =>
        `<tr><td><strong>${s.number}</strong></td><td><a href="ai-sdlc.html#stage-${s.number}">${esc(s.name)}</a></td><td>${esc(s.artifact)}</td></tr>`,
    )
    .join("");

  const adlcCu = adlc.commercial_unit;
  const adlcStages = (adlc.stages ?? []).filter((s) =>
    (adlcCu?.stages ?? []).includes(s.number),
  );
  const adlcRows = adlcStages
    .map(
      (s) =>
        `<tr><td><strong>${s.number}</strong></td><td><a href="adlc.html#stage-${s.number}">${esc(s.name)}</a></td><td>${esc(s.artifact)}</td></tr>`,
    )
    .join("");

  return `
      <section id="overview">
        <h1 class="mono uppercase eyebrow">New Discovery</h1>
        <p class="lede">The discovery process rebuilt for AI-Native delivery. This is where we define how the front-loaded stages of both lifecycles combine into one commercial unit — the thing we sell as discovery, backed by real signal instead of workshop artifacts.</p>
        <p class="lede">Content is being authored. The stages involved are mapped below.</p>
      </section>

      <section id="sdlc-stages">
        <h2 class="mono uppercase eyebrow">${esc(sdlc.name)} stages involved</h2>
        ${sdlcCu ? `<p class="lede">In the ${esc(sdlc.name)}, discovery is the <strong>${esc(sdlcCu.name)}</strong> — Stages ${sdlcCu.stages.join(" and ")} sold as one commercial unit.</p>` : ""}
        <table class="hairline-table">
          <thead><tr><th>Stage</th><th>Name</th><th>Artifact</th></tr></thead>
          <tbody>${sdlcRows}</tbody>
        </table>
        <p class="line-note">Full stage details on the <a href="ai-sdlc.html">AI-Native Strategy</a> page.</p>
      </section>

      <section id="adlc-stages">
        <h2 class="mono uppercase eyebrow">${esc(adlc.name)} stages involved</h2>
        ${adlcCu ? `<p class="lede">In the ${esc(adlc.name)}, discovery spans <strong>Stages ${adlcCu.stages[0]} through ${adlcCu.stages[adlcCu.stages.length - 1]}</strong> — the additional stages cover agent-specific scope framing, architecture definition, and simulation.</p>` : ""}
        <table class="hairline-table">
          <thead><tr><th>Stage</th><th>Name</th><th>Artifact</th></tr></thead>
          <tbody>${adlcRows}</tbody>
        </table>
        <p class="line-note">Full stage details on the <a href="adlc.html">Agentic</a> page.</p>
      </section>`;
}

function renderHowItRelatesMain(model) {
  const stack = requireDoctrine(model, "commercial-stack");
  const layers = (stack.steps ?? [])
    .map(
      (step) =>
        `<li><strong>${esc(oneLine(step.name))}.</strong> ${esc(oneLine(step.description))}</li>`,
    )
    .join("");

  const capacity = model.capacityModel;
  const capacityShape = confidenceMarker(
    capacity?.nominal_capacity?.shape_hypothesis?.confidence,
    "to be calibrated from a real engagement",
  );
  const countability = confidenceMarker(
    capacity?.surface_area?.cross_domain_countability?.confidence,
  );

  return `
      <section id="overview">
        <h1 class="mono uppercase eyebrow">How it all relates</h1>
        <p class="lede">Domains, capabilities, levels, roles, titles, seats. That looks like six lists. It is one list. Everything else is a way of pointing at it.</p>
        <p class="lede">The convolution comes from treating those six words as six things to keep. Domains and capabilities are the list. Levels are how a capability is executed. Roles, titles, and seats are people pointing at it — not parallel inventories.</p>
        <p class="lede">The count we now attach to a seat is not a seventh list. It's a quantity on one entry, not a new inventory to keep.</p>
        ${figure("01-one-list.png", "One list, not several lists")}
      </section>
      <section id="the-spine">
        <h2 class="mono uppercase eyebrow">The spine</h2>
        <p class="lede">Domain contains capability. A capability is the named outcome we promise. It can be executed at L1, L2, L3, or L4 — same promise, different depth of judgment and accountability.</p>
        <p class="lede">The capability is the whole piece. The level is which piece you slot in to assemble it. Same promise either way. Domains and capabilities are fixed; capabilities carry levels. Nothing else below is its own list.</p>
        ${figure("02-the-spine.png", "Capability assembled at a level")}
        ${to("capability-model.html", "Capability Model")}
      </section>
      <section id="two-questions">
        <h2 class="mono uppercase eyebrow">Two questions, not one</h2>
        <p class="lede">A seat is set by two questions that do different jobs. How much rides on this sets the level. How much of it there is sets the count. Neither answers the other.</p>
        <p class="lede">Level is depth of judgment, fixed by collapse risk. Count is volume, fixed by how much of the work there is. A bigger project does not raise the level — it raises the count at whatever level the risk already fixed. This is the answer to whether scale changes the level: it doesn't. Scale is a count question; level is a risk question. They're orthogonal.</p>
        <p class="lede">L3×1, L1×5, and L2×3 are all coherent seats — one deep expert on the thing that can't fail, many hands on routine surface, or moderate stakes with more of it than one seat can carry.</p>
      </section>
      <section id="surface-area">
        <h2 class="mono uppercase eyebrow">Surface area</h2>
        <p class="lede">Count comes from surface area — how much of a capability-at-level the work demands, divided by how much one seat can hold.</p>
        <p class="lede">Surface area is the number of independently attention-demanding units at a capability×level — units that can't share one operator's attention without one of them degrading. It's a concurrency measure, set by the timeline: two things on separate critical paths are two units; the same work done serially is fewer.</p>
        <p class="lede">What one seat holds depends on the level and on who's in it. Nominal capacity falls as the level rises — higher stakes tax attention per unit ${esc(capacityShape)}. And an overqualified operator covers more, up to a hard ceiling, because the work is easy for them.</p>
        <p class="lede">One flag stays open: surface area counts cleanly in engineering (services, streams), but whether the same unit survives in the judgment-heavy domains — Framing, Proof, Commercial, Enablement, Continuity — is ${esc(countability)}. Named and unresolved, not assumed closed.</p>
      </section>
      <section id="three-verbs">
        <h2 class="mono uppercase eyebrow">Three verbs</h2>
        <p class="lede">Title, ownership, and seat are not three more lists. They are three verbs on the same capability: grouped under, keeps fit, executes.</p>
        <p class="lede">Title is grouped under — a bundle of owned capabilities, internal shorthand for coverage. L4 Capability Ownership is keeps fit — the capability you author guardrails for, internal and permanent. Seat is executes — one capability at one level, this squad, internal and dynamic. All three are internal; none of them is what the client buys.</p>
        ${to("roles-titles.html#title-ownership-seat", "Roles & Titles")}
      </section>
      <section id="seats">
        <h2 class="mono uppercase eyebrow">A seat is runtime</h2>
        <p class="lede">A seat is a capability at a level, with a count, filled by a person or people, on this engagement. That's a runtime instance — and the count isn't a new list, it's how many times we instantiate one entry.</p>
        <p class="lede">The count is confidence-gated, same as everything else. Before the work can prove the load, the count is assumed — a demanded ceiling estimated at intake, the least-validated moment we have, when we don't yet know what we don't know. As surface area validates during the work, a committed floor emerges.</p>
        <p class="lede">We stand behind the floor and watch the ceiling; a surface-area update re-derives the count mid-engagement. One person can hold the seat, or several people who each clear the bar can make up the count together. Seat names churn. The capability underneath does not.</p>
        ${figure("04-seat-is-runtime.png", "One capability, staffed one or several ways")}
        ${to("operating-view.html", "Operating View")}
      </section>
      <section id="the-sow">
        <h2 class="mono uppercase eyebrow">What the SOW shows</h2>
        <p class="lede">${esc(oneLine(stack.summary))}</p>
        <ul class="bullets sow">
          ${layers}
        </ul>
        ${[stack.rule, stack.closing_note]
          .filter(Boolean)
          .map((note) => `<p class="lede">${esc(oneLine(note))}</p>`)
          .join("\n        ")}
        <p class="lede">Rule of thumb: the client buys an outcome, the firm fulfils it with people in seats, and the shorthand we use between the two stays on our side of the table.</p>
        ${to("roles-titles.html#commercial-stack", "Roles & Titles")}
      </section>`;
}

function renderCapabilityModelMain(model) {
  const { levels, domains, capabilities, skills } = model;
  const legend = levelLegendMap(levels);

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
        .map((cap) => renderCap(cap, domains, legend))
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

  return `
      <section id="overview">
        <h1 class="mono uppercase eyebrow">Core Philosophy</h1>
        <p class="lede">Domains are types of work. They do not change and they do not have levels. Capabilities are the named outcomes we promise inside a domain.</p>
        <p class="lede">How a capability is executed is a separate scale — L1 Guided Execution, L2 Practitioner, L3 Advanced Lead, and L4 Capability Ownership. That scale lives with capabilities, not with domains.</p>
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

function render(model, pageId = "how-it-all-relates") {
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
    .page-group .page-children {
      display: none;
      flex-direction: column;
      gap: 6px;
      padding-left: 18px;
      margin-top: 6px;
    }
    .page-group.open .page-children { display: flex; }
    .page-caret {
      flex-shrink: 0;
      transition: transform 180ms ease;
      color: var(--dim);
    }
    .page-caret.open { transform: rotate(90deg); }
    .page-toggle { cursor: pointer; }
    .page-child { font-size: 12.5px; }
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
    .figure {
      margin: 24px 0 32px;
      background: #fff;
      border: 1px solid var(--line);
    }
    .figure img {
      display: block;
      width: 100%;
      max-width: 100%;
      height: auto;
      background: #fff;
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
      color: var(--muted);
      font-size: 12px;
      font-style: italic;
      margin-top: 12px;
      max-width: 700px;
    }
    .prose { margin-bottom: 24px; max-width: 700px; }
    .stack .prose { margin-bottom: 8px; }
    .stack .prose:last-child { margin-bottom: 0; }
    .kvs { display: flex; flex-direction: column; gap: 12px; }
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
      .side { position: static; }
      .side .toc { flex-direction: row; flex-wrap: wrap; gap: 8px 16px; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      * { transition: none !important; animation: none !important; }
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
  <script>
    document.querySelectorAll('.page-toggle').forEach(function(el) {
      el.addEventListener('click', function() {
        var group = el.closest('.page-group');
        if (group) {
          group.classList.toggle('open');
          var caret = el.querySelector('.page-caret');
          if (caret) caret.classList.toggle('open');
        }
      });
    });
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
  await cp(join(ROOT, ILLUSTRATIONS), join(outDir, ILLUSTRATIONS), { recursive: true });
  const firstDrawing = join(outDir, ILLUSTRATIONS, "01-one-list.png");
  const boardDrawing = join(outDir, ILLUSTRATIONS, "06-operating-view.png");
  const drawn = await readFile(firstDrawing).catch(() => null);
  const board = await readFile(boardDrawing).catch(() => null);
  if (!drawn?.length) {
    throw new Error(`Missing ${firstDrawing}. Drawings must copy into site/ on build.`);
  }
  if (!board?.length) {
    throw new Error(`Missing ${boardDrawing}. Drawings must copy into site/ on build.`);
  }
  for (const page of ALL_PAGES) {
    await writeFile(join(outDir, page.file), render(model, page.id));
  }
  console.log(`Wrote ${ALL_PAGES.map((page) => `site/${page.file}`).join(", ")}`);
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
