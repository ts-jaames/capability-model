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
    id: "ai-sdlc",
    title: "AI-Native SDLC",
    file: "ai-sdlc.html",
    main: renderAiSdlcMain,
    children: [
      {
        id: "adlc",
        title: "ADLC",
        file: "adlc.html",
        main: renderAdlcMain,
      },
    ],
  },
];

// Flat list of every page for build output and TOC lookup.
const ALL_PAGES = PAGES.flatMap((page) => [page, ...(page.children ?? [])]);

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
    ["#stage-2", "2 · Plan"],
    ["#stage-3", "3 · Design"],
    ["#stage-4", "4 · Build"],
    ["#stage-5", "5 · Test"],
    ["#stage-6", "6 · Deploy"],
    ["#stage-7", "7 · Maintain"],
    ["#domains-across", "Domains across stages"],
    ["#adaptation", "Adaptation matrix"],
    ["#gaps", "Known gaps"],
  ],
  "adlc": [
    ["#overview", "Overview"],
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

    return `<div class="page-group${groupOpen ? " open" : ""}">
          <a class="page-link"${current} href="${esc(href)}">${esc(item.title)}${caret}</a>
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

function renderAiSdlcMain() {
  return `
      <section id="overview">
        <h1 class="mono uppercase eyebrow">AI-Native SDLC</h1>
        <p class="lede">This playbook establishes the standard operating procedures for the Sparq AI-Native Software Development Life Cycle. Adapted from the Anthropic AI-Native SDLC pattern, this methodology integrates the Evidence Gate as a non-negotiable gate inside the pipeline rather than treating it as an external meta-process.</p>
        <p class="lede">The base pipeline optimizes for speed and build correctness. However, it requires a mechanism to validate whether we are building the right thing before scaling execution. Therefore, the Evidence Gate explicitly gates the transition from Plan → Design. Feasibility and Operational risks are handled inside the Build → Test phases via Continuous Integration (CI) evaluation suites. The commit chain (Git-tracked artifacts at every stage) remains both the operational workflow and the audit trail.</p>
      </section>

      <section id="pipeline">
        <h2 class="mono uppercase eyebrow">The pipeline</h2>
        <p class="lede">Eight stages, each producing a Git-tracked artifact. The Evidence Gate sits between Intent Framing and Plan — a human-driven gate for the risks CI cannot catch.</p>
        <table class="hairline-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Core artifact</th>
              <th>Gate</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><strong>0 · Intent Framing</strong></td><td>raw intent.md</td><td>—</td></tr>
            <tr><td><strong>1 · Evidence Gate</strong></td><td>decision on intent.md</td><td>Promote / Iterate / Pivot / Stop</td></tr>
            <tr><td><strong>2 · Plan</strong></td><td>intent.md (cleared)</td><td>Product Owner merge</td></tr>
            <tr><td><strong>3 · Design</strong></td><td>spec.md</td><td>Skills validation</td></tr>
            <tr><td><strong>4 · Build</strong></td><td>plan.md + code diffs</td><td>CLAUDE.md + hooks</td></tr>
            <tr><td><strong>5 · Test</strong></td><td>verification logs + eval results</td><td>Eval pass thresholds</td></tr>
            <tr><td><strong>6 · Deploy</strong></td><td>REVIEW.md + PR findings</td><td>Environment autonomy tiers</td></tr>
            <tr><td><strong>7 · Maintain</strong></td><td>bands.yaml + incident records</td><td>Metric-band triggers</td></tr>
          </tbody>
        </table>
      </section>

      <section id="how-stages-and-risk-work">
        <h2 class="mono uppercase eyebrow">How stages and risk shapes work together</h2>
        <p class="lede">Stages are artifact order. They describe the sequence of what you produce and which governance gate you pass through. Risk shapes are the real-time operating picture — they describe which capabilities run hot right now, regardless of which stage the work is in.</p>
        <p class="lede">A risk shape fires wherever it fires. The Feasibility shape can spike during Intent Framing if an architecture constraint surfaces early. The Value shape can stay active deep into Build if a prior assumption gets challenged. Shapes co-occur, recur, and persist — they are not bound to a single stage.</p>
        <p class="lede">The stage tells you what artifact you owe. The live risk mix tells you what to worry about while you produce it. You are always in a stage, and you are always responding to risk shapes.</p>
        <p class="lede">Stages have a default gravity — 0 through 7 — but change events and failed gates send you back. The change-response doctrine runs at any stage: re-read the risk, re-set the dials, decision gate, re-staff, re-price and re-time, name the next slice.</p>
      </section>

      <section id="stage-0">
        <h2 class="mono uppercase eyebrow">Stage 0 · Intent Framing Session</h2>
        <p class="lede">Generate the raw material and problem framing required for the pipeline without prematurely settling on narrative agreement. This session acts as structured elicitation to expose unvalidated assumptions.</p>
        <div class="kvs">
          ${kv("Discipline", "<p>The output must be a stack of tagged, unvalidated assumptions, not settled prose. Confidence is not agreement in a workshop.</p>")}
          ${kv("Client alignment", "<p>As a consultancy, we often do not have standing authority over intent.md. Use this session to bridge the vocabulary gap and secure client agreement on the problem statement before proceeding.</p>")}
        </div>
        <div class="kvs">
          ${kv("Assumption Dump", '<p>Ask: "What must be true for this initiative to succeed?" Individually list, group, and rephrase as testable statements.</p>')}
          ${kv("Failure Premortem", '<p>Ask: "It\'s 12 months from now. This failed. Why?" List causes and translate them into risks.</p>')}
          ${kv("Domain Walkthrough", "<p>Force the identification of at least one risk per category: Value, Usability, Feasibility, Viability, and Operational. This prevents tunnel vision.</p>")}
          ${kv("Architecture Exposure", '<p>Ask: "What technical constraint could invalidate this?" Identify platform limitations, integration dependencies, performance ceilings, and security requirements.</p>')}
        </div>
        <p class="line-note">Output: a raw intent.md (problem statement, proposed outcomes, affected systems, constraints) where every claim is explicitly tagged as an assumption. This file does not trigger CI compilation — it must proceed to the Evidence Gate.</p>
      </section>

      <section id="stage-1">
        <h2 class="mono uppercase eyebrow">Stage 1 · Evidence Gate</h2>
        <p class="lede">Decide whether the raw intent.md is trustworthy enough to compile into spec.md. This is a human-driven evaluation gate to validate risk categories that cannot be caught by CI rubrics.</p>
        <table class="hairline-table">
          <thead>
            <tr>
              <th>Risk category</th>
              <th>Where tested</th>
              <th>Rationale</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><strong>Feasibility</strong></td><td>Stage 5 (CI Eval Suite)</td><td>Deterministic — a rubric can check whether code fulfills a spec.</td></tr>
            <tr><td><strong>Operational</strong></td><td>Stage 5 (CI Eval Suite)</td><td>Testable against known patterns and thresholds.</td></tr>
            <tr><td><strong>Value</strong></td><td>Evidence Gate</td><td>Requires external reaction. Cannot be skipped or auto-evaluated.</td></tr>
            <tr><td><strong>Usability</strong></td><td>Evidence Gate</td><td>Requires human interaction/reaction. Cannot be skipped.</td></tr>
            <tr><td><strong>Viability</strong></td><td>Evidence Gate (Light)</td><td>Business/commercial sense-check.</td></tr>
          </tbody>
        </table>
        <div class="kvs">
          ${kv("Validation loop", "<p>Run the cycle of Risk → Assumption → Slice → Signal → Confidence → Decision on tagged assumptions. Address one assumption per slice.</p>")}
          ${kv("Test in the real world", "<p>For Value/Usability risks, attach the test to a real occasion (next client conversation, stakeholder review, prospect encounter) rather than manufacturing synthetic scenarios. A slice needs something behaving in the world to react to.</p>")}
          ${kv("Internal convergence", "<p>Only use internal convergence checks when a real external occasion genuinely does not exist. Record the reason explicitly. Internal-only signals cap at Directional confidence, never Validated.</p>")}
          ${kv("Explicit decisions", "<p>Make a clear decision for the intent: Promote, Iterate, Pivot, or Stop. No numeric confidence scores.</p>")}
        </div>
        <p class="line-note">Output: the intent.md either clears (moves to Stage 2), gets sent back to Stage 0 for re-framing, or the initiative is stopped/pivoted.</p>
      </section>

      <section id="stage-2">
        <h2 class="mono uppercase eyebrow">Stage 2 · Plan</h2>
        <p class="lede">Establish the cleared intent as the proto-spec artifact and synchronize it across operational systems.</p>
        <div class="kvs">
          ${kv("Dual-linkage", "<p>Markdown remains the operational truth within the repository. Sync to legacy enterprise trackers (Jira/Azure DevOps) via MCP connectors to maintain client governance requirements.</p>")}
          ${kv("Automated spec trigger", "<p>Upon merge of a gate-cleared intent.md into the /intent/ directory, trigger a non-interactive CI job. This job automatically compiles spec.md with Sparq compliance skills loaded (security, UX, brand guidelines). The Product Owner is responsible for the final review step.</p>")}
        </div>
        <p class="line-note">Output: intent.md (cleared and synced).</p>
      </section>

      <section id="stage-3">
        <h2 class="mono uppercase eyebrow">Stage 3 · Design</h2>
        <p class="lede">Synthesize requirements and architecture into a formal specification.</p>
        <div class="kvs">
          ${kv("Compressed synthesis", "<p>Execute a compressed, single-session requirements and architecture synthesis.</p>")}
          ${kv("Skill integration", "<p>Guide the synthesis utilizing organization-wide skills for security, compliance, and UX standards.</p>")}
          ${kv("Domain focus", "<p>Building is the primary domain — product-interface-building and core-systems-engineering drive the synthesis. Framing constraint-checks run as secondary, ensuring the architecture stays within the boundaries set at the Evidence Gate.</p>")}
        </div>
        <p class="line-note">Output: spec.md.</p>
      </section>

      <section id="stage-4">
        <h2 class="mono uppercase eyebrow">Stage 4 · Build</h2>
        <p class="lede">Draft implementation plans and execute code generation within isolated agent environments.</p>
        <div class="kvs">
          ${kv("CLAUDE.md context engine", "<p>Maintain a robust context engine detailing build commands, linting rules, architectural patterns, and team-specific mistakes to avoid.</p>")}
          ${kv("Plan mode as default", "<p>AI agents must draft plan.md before writing code. Human acceptance commits the plan to Git.</p>")}
          ${kv("Parallel worktrees", "<p>Isolate agent sessions across separate Git worktrees. Enforce a parallel session cap of 2–3 concurrent worktree sessions per engineer to preserve review quality and prevent fatigue.</p>")}
          ${kv("Scoped auto mode", "<p>Allow autonomous edit execution only where existing test coverage and build hooks are fully mature.</p>")}
          ${kv("Shared subagents", "<p>Utilize .claude/agents/ to store standardized helper agents across repositories — verifier agents (run the app, check behavior) and simplifier agents (strip redundant complexity post-implementation).</p>")}
        </div>
        <p class="line-note">Output: plan.md and verified code diffs.</p>
      </section>

      <section id="stage-5">
        <h2 class="mono uppercase eyebrow">Stage 5 · Test</h2>
        <p class="lede">Continually verify code behavior and assess Feasibility and Operational risks through automated CI suites.</p>
        <div class="kvs">
          ${kv("Self-verification loop", "<p>Agents must run builds, tests, and visual diffs, proving success in context before reporting a task complete.</p>")}
          ${kv("Continuous CI eval suite", "<p>Maintain 20–50 real-world task evaluations in .github/workflows/agent-evals.yml. These run non-interactively upon updates to code, skills, or hooks to establish baseline agent performance benchmarks.</p>")}
          ${kv("Focused scope", "<p>CI evaluations assess Feasibility and Operational risks only. Value and Usability risks are resolved upstream at the Evidence Gate (Stage 1).</p>")}
          ${kv("Test-file locking", "<p>Implement pre-tool hooks that block agents from modifying existing test files during bug-fix tasks. The agent must fix the code to pass the tests — it is explicitly denied the ability to alter assertions to force a passing status.</p>")}
        </div>
        <p class="line-note">Output: verification logs and evaluation results.</p>
      </section>

      <section id="stage-6">
        <h2 class="mono uppercase eyebrow">Stage 6 · Deploy</h2>
        <p class="lede">Conduct multi-pass reviews and securely deploy artifacts across environments using defined autonomy tiers.</p>
        <div class="kvs">
          ${kv("Multi-pass PR review", "<p>Automate first-pass scans for logical bugs, security gaps, and compliance against spec.md and plan.md (REVIEW.md).</p>")}
          ${kv("Hooks as release gates", "<p>Enforce deterministic pre-execution scripts for security controls, blocking unauthorized path edits.</p>")}
          ${kv("Environment tiers", '<ul class="bullets"><li><strong>Dev/Sandbox</strong> — full agent execution allowed.</li><li><strong>Staging</strong> — automated PR review with passing CI required.</li><li><strong>Production</strong> — explicit human release-manager authorization required.</li></ul>')}
          ${kv("Managed settings", "<p>Deploy immutable settings centrally (e.g., allowManagedHooksOnly, permissions.deny) to block shell network egress, prevent credential leakage, and disable plugin sideloading.</p>")}
        </div>
        <p class="line-note">Output: REVIEW.md, PR findings, and deployed code.</p>
      </section>

      <section id="stage-7">
        <h2 class="mono uppercase eyebrow">Stage 7 · Maintain</h2>
        <p class="lede">Monitor system health continuously and trigger automated triage and incident resolution loops.</p>
        <div class="kvs">
          ${kv("Metric drift triggers", "<p>Apply deterministic monitoring using statistical control rules against operational metrics (e.g., test failure rate, post-deploy 5xx rates) via bands.yaml.</p>")}
          ${kv("Autonomous intent feed", "<p>If a metric breach occurs (e.g., 3σ deviation), a background agent automatically diagnoses the root cause and writes a new intent.md into the triage queue.</p>")}
          ${kv("ChatOps incident response", "<p>Triage live production alerts via Claude tag in Slack/Teams, execute diagnostic runbooks via MCP, and log root-cause analyses directly to the thread record.</p>")}
          ${kv("Incident-to-eval pipeline", "<p>For every resolved production incident, automatically compile a regression evaluation case into the CI suite (Stage 5) to guarantee prevention of recurrence.</p>")}
        </div>
        <p class="line-note">Output: bands.yaml updates and incident/eval loop records.</p>
      </section>

      <section id="domains-across">
        <h2 class="mono uppercase eyebrow">Domains and risk shapes across the pipeline</h2>
        <p class="lede">Each stage has a primary domain driving the work and risk shapes that are typically hottest at that point. Framing tapers over time but does not hard-stop at Plan. Proof runs at the Evidence Gate, Test, and Maintain stages, handling distinct but related evaluation tasks.</p>
        <table class="hairline-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Primary domain</th>
              <th>Secondary</th>
              <th>Risk shapes typically hot</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>0 · Intent Framing</td><td>Framing</td><td>—</td><td>Problem clarity, Commercial</td></tr>
            <tr><td>1 · Evidence Gate</td><td>Proof</td><td>Framing</td><td>Value, Problem clarity</td></tr>
            <tr><td>2 · Plan</td><td>Framing (tapering)</td><td>Commercial</td><td>Commercial</td></tr>
            <tr><td>3 · Design</td><td>Building</td><td>Framing</td><td>Feasibility</td></tr>
            <tr><td>4 · Build</td><td>Building</td><td>Proof</td><td>Feasibility, AI reliability</td></tr>
            <tr><td>5 · Test</td><td>Proof</td><td>Building</td><td>Proof/acceptance, Feasibility, AI reliability</td></tr>
            <tr><td>6 · Deploy</td><td>Building</td><td>Continuity</td><td>Proof/acceptance, Adoption</td></tr>
            <tr><td>7 · Maintain</td><td>Continuity</td><td>Enablement</td><td>Continuity, Adoption</td></tr>
          </tbody>
        </table>
        <p class="lede">Risk shapes are listed where they are typically hottest, not where they only fire. Any shape can spike at any stage — a Feasibility constraint can surface during Intent Framing, and a Value question can re-open during Build.</p>
        <p class="lede"><strong>Commercial</strong> frames the pipeline — it sets the envelope and price before Stage 0, and the proof → commercial seam updates it as evidence arrives. It is not absent from the pipeline; it operates across stages rather than owning one.</p>
        <p class="lede"><strong>Enablement</strong> activates when the Adoption risk shape fires, typically hottest at Deploy and Maintain but possible at any stage where organizational change is needed to land the work.</p>
      </section>

      <section id="adaptation">
        <h2 class="mono uppercase eyebrow">Adaptation matrix</h2>
        <p class="lede">How each stage adapts to the AI-native context — the core artifact, the approach, and the governance mechanism that keeps it honest.</p>
        <table class="hairline-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>AI-native approach</th>
              <th>Artifact / trigger</th>
              <th>Governance</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>0 · Intent Framing</td><td>Structured elicitation producing tagged, unvalidated assumptions</td><td>raw intent.md</td><td>Facilitator ensures output stays assumption-tagged</td></tr>
            <tr><td>1 · Evidence Gate</td><td>Risk validation loop for Value/Usability/Viability only</td><td>Decision on intent.md</td><td>Product + Delivery sign-off; Promote/Iterate/Pivot/Stop</td></tr>
            <tr><td>2 · Plan</td><td>Brainstorming sessions generating concise proto-specs</td><td>intent.md (cleared)</td><td>Product Owner merge sign-off</td></tr>
            <tr><td>3 · Design</td><td>Compressed single-session requirements &amp; design synthesis</td><td>spec.md</td><td>Skills validation (Security, UX, Brand)</td></tr>
            <tr><td>4 · Build</td><td>Plan-mode drafting, worktree-isolated implementation</td><td>plan.md &amp; code diffs</td><td>CLAUDE.md + path-blocking hooks</td></tr>
            <tr><td>5 · Test</td><td>Continuous self-verification and CI-driven eval suites</td><td>Verification logs &amp; eval results</td><td>Test-locking hooks &amp; eval pass thresholds</td></tr>
            <tr><td>6 · Deploy</td><td>Multi-pass agentic PR review with human risk evaluation</td><td>REVIEW.md &amp; PR findings</td><td>Branch protection &amp; production deploy hooks</td></tr>
            <tr><td>7 · Maintain</td><td>Metric-band monitoring auto-generating new intent items</td><td>bands.yaml &amp; incident records</td><td>Tiered automated response &amp; on-call approval</td></tr>
          </tbody>
        </table>
      </section>

      <section id="gaps">
        <h2 class="mono uppercase eyebrow">Known gaps</h2>
        <div class="kvs">
          ${kv("bands.yaml widening", "<p>Maintenance metrics primarily monitor infrastructure health (error rates). A sensor is needed to monitor Value/Usability drift post-launch (adoption rates, usage depth) so the pipeline does not lose signal on a shipped feature nobody wants. This remains an unresolved gap.</p>")}
          ${kv("Naming the Intent Framing Session", "<p>This stage is deliberately left undressed. Naming it before the shape is settled through repeated real use is an anti-pattern. We will call it what it is until it earns a name through institutional habit.</p>")}
          ${kv("Client-specific authority", "<p>Engagement models differ on how much of the Intent Framing Session includes the client versus internal Sparq preparation. This balance is engagement-specific and not yet standardized across all delivery modes.</p>")}
        </div>
      </section>`;
}

function renderAdlcMain() {
  return `
      <section id="overview">
        <h1 class="mono uppercase eyebrow">ADLC</h1>
        <p class="lede">The AI-Native development lifecycle — how code, context, and judgment flow through a delivery slice.</p>
        <p class="lede">Placeholder — content is being authored.</p>
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
