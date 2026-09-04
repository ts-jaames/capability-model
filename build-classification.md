# SparqOS — Build Inventory & Classification

Reference for anything built to make SparqOS infrastructural rather than supervised. Read-only in the repo; not rendered on the site.

Written human-first but structured so an agent can consume it later without a rewrite: stable IDs (A–Y), uniform fields, machine-legible summary in §6. Upgrade path: lift the per-item fields into YAML front-matter or a sidecar keyed by the same IDs. One source, multiple views — never hand-maintain two copies.

---

## 0. The honest reframe

Most of this list is not an app to build. It is an instruction to write.

Claude already does the reasoning — structuring assumptions, qualifying slices, tiering artifact language by confidence, checking a draft against its evidence, composing pricing from rules, writing a client update. What Claude cannot do on its own is remember across sessions, see your private context mid-work, trigger itself on a clock or event, run a guarded multi-step loop, or hold a surface for people who aren't in a Claude session. Those five gaps are the only real builds.

Everything else is a **SKILL.md**: a written rubric that encodes *your* definitions so Claude applies them the same way every time. "Building" those means writing a good instruction file. The over-build is a custom UI for what a skill plus a connector already does.

**Build-now total is three (D, E, J).** Everything added since — including the client experience and the skill-hygiene items — is a SKILL.md, a file, a practice, or deferred. That the count stays at three is the test that this list hasn't re-inflated.

---

## 1. The build test — five reasons to build past a skill

If a candidate needs one of these, it earns a real build. If it needs none, it is a SKILL.md.

1. **Durable state across sessions and engagements.** Claude has no memory. This is the one true gap. → **D**
   *Horizon note:* Claude's own memory improving does not close this — per-user chat memory is not a shared, structured, auditable engagement record. D stands.
2. **Exposing proprietary structured context to Claude mid-work.** This is what MCP is for. → **E**, plus the connector that lets Claude read/write **D**.
3. **Proactive or scheduled action.** Claude doesn't self-trigger on a clock or an event. → **J**; any auto-running variant of **K**; **R**.
4. **Guarded autonomy over a multi-step loop.** An agent: skills + tools + loop + guardrails + leash. → **Q**, **T**.
5. **A standing surface for people who won't be in a Claude session** — i.e. clients. → **U** (a doc, borderline), **V** (the portal).

**Proprietary-info nuance.** The instinct to protect proprietary context is right, but it elevates a thing to *storage + MCP*, not to an app.
- Proprietary **rubric** (assumption format, gate criteria, pricing tiers) → lives in skill instructions/files. No app.
- Proprietary **evidence and model** → must be stored and exposed → **D** and **E**.

---

## 2. Classification (condensed)

### 2a. Two axes, not a size ladder
- **Nature.** *App/substrate* holds state and is a source of truth. *Skill* encodes judgment, is stateless, does one job. *Tool* exposes or watches something.
- **Autonomy.** Where *agent* lives: skills + tool access + loop + guardrails + leash length. An agent reads/writes substrates and calls skills. Levels: human-invoked → human-in-the-loop → human-on-the-loop → fully auto.

### 2b. Layering (not the same kind of thing as skill/agent/app)
```
COMMERCIAL PACKAGE  ← what the client buys (IQ suites)          [volatile label]
   packages ↓
CAPABILITY          ← atomic unit, has a LEVEL                  [stable]
   delivered via ↓
PLAYBOOK            ← the how-to / delivery enablement          [often the missing piece]
   run/supported by ↓
TOOLING             ← skills · agents · tools (guardrails + owner)
   reads/writes ↓
SUBSTRATE           ← evidence store, source-of-truth files     [stable]
```
A commercial package does not get its own level ladder; its maturity is a view over the levels of the capabilities it packages, plus whether a playbook, guardrails, and owner exist. A kit is substrate. A playbook is enablement, not a tool.

### 2c. The four-question gate
Governs "is this agent safe to run?", "is this package sellable as delivered?", and "can we put this client surface in front of a client?": (1) Can you run it with guardrails? (2) What are they? (3) Can it run on its own? (4) Who owns it? Until all four are answered, the thing is Concept-state — nameable and showable as vision, not sellable/runnable as if committed.

### 2d. Ownership tag (orthogonal to type)
**Sponsored** — owner + team, standing project. **One-off** — one person clears it.

### 2e. Naming guardrail
Naming a thing that doesn't exist defines it for everyone. Names marked *working* or *un-adopted* below are labels, not constructed things; referencing them as real is a commitment act. Treat as Concept-state until deliberately adopted.

---

## 3. Inventory, cut by build reality

Fields: **Pain · What Claude already does · The actual build · Justification (§1) · Owner · Sequencing.**

### 3a. SKILL.md — instruction, near-zero build

For every item here, Claude does the reasoning. The "build" is writing the rubric. None trip the §1 test.

**A. Risk-to-Assumption Structurer**
- *Pain:* Assumptions stay implicit — the #1 gap from Imagine Studios.
- *Build:* SKILL.md holding your success/failure format and decision-consequence link. Runs from the first sales conversation, not just post-kickoff — evidence intake starts at the sales seam. *Owner:* one-off. *After:* front door. *Before:* B.

**B. Slice Qualifier**
- *Pain:* Slices silently become features; false confidence follows.
- *Build:* SKILL.md with the one-assumption / predefined-signal / time-boxed / disposable test. *Owner:* one-off. *After:* A. *Before:* C.

**C. Signal / Instrumentation Definer**
- *Pain:* "Without predefined signal criteria, slices degrade into demos."
- *Build:* SKILL.md defining measure, success/failure, capture method, promotion threshold. *Owner:* one-off. *After:* B. *Before:* O.

**G. Confidence-Tiered Artifact Generation** *(proposed name VERA — un-adopted; do not reference as if it exists)*
- *Pain:* Humans re-synthesize the same evidence; confidence isn't reflected in the language.
- *Build:* A SKILL.md per artifact (strategy, roadmap, backlog, milestones, cost, scope check) that reads **D** and tiers language by confidence. Separate skills, never a platform — a platform recreates polished-fiction risk in the tooling. *Owner:* sponsored (family). *After:* D holds evidence. *Before:* H.

**H. Polish-vs-Confidence Linter**
- *Pain:* Polish gets mistaken for confidence — the core failure mode.
- *Build:* SKILL.md that compares a draft against **D**'s confidence states and flags overclaiming. Native comparison; the build is the rubric + read access to D. *Owner:* one-off. *Before:* any client send.

**I. Confidence Gate Checker**
- *Pain:* Promotion happens on enthusiasm or calendar, not earned signal.
- *Build:* SKILL.md evaluating a capability against the gate guidelines → promote/iterate/pivot/stop + logged rationale. *Owner:* one-off. *After:* D + C.

**K. Conflict Detector**
- *Pain:* Artifacts rub against defined entities unnoticed until it's an architectural error.
- *Build:* SKILL.md that checks an artifact against the source-of-truth files (reached via **E**). Human-invoked = skill. (An auto-running variant is a build — see R.) *Owner:* one-off. *After:* E.

**L. Confidence-Tiered Pricing Composer** *(skill, not tool)*
- *Pain:* Fixed-fee scope relocates risk into change orders and margin erosion.
- *Build:* SKILL.md that reads capability confidence states + your pricing rules and composes tight / buffered / spike-window pricing. E-09 is the test case. *Feedback loop:* the same skill can compare realized margin against the confidence-tiered estimate at engagement close, so the pricing rubric learns — that's a note here, not a separate monitor. Only becomes a tool if it must plug into a quoting/SOW system. *Owner:* sponsored (commercial). *After:* E + I.

**M. Engagement Change Runner** — *exists as a skill.*
- Reference implementation. Extend it to call **E** rather than carrying the model inline. *Owner:* tbd.

**O. Spike Runner / Slice Executor**
- *Pain:* Turning a defined assumption into an instrumented spike is manual.
- *Build:* A Claude Code SKILL.md — Claude Code already scaffolds instrumented code from a spec; the build is the SparqOS-shaped instruction. *Owner:* one-off. *After:* C. *Before:* I.

**P. Model Onboarding Skill**
- *Pain:* The system depends on one person holding the model.
- *Build:* SKILL.md that walks a new person through the model using their live engagement. *Owner:* one-off. *After:* enough of A–I exist to demo.

**X. Skill Index**
- *Pain:* As SKILL.md files multiply, no one knows which exist, what they do, or which are adopted vs experimental. The volatile layer becomes illegible — the same drift the source-of-truth work fights, one layer down.
- *Build:* a repo file (this inventory is its seed) listing adopted skills, one line each, with status. Near-zero. Same one-source discipline. *Owner:* one-off.

**Y. Skill Evaluation**
- *Pain:* A skill that encodes the wrong rubric fails silently — confident, consistent, and wrong. There's no way to know a skill is good.
- *Build:* use skill-creator's eval tooling to test each skill against known-good cases before it's adopted. A practice, not a build. This is the skill-layer version of "signal before you trust it": don't promote a skill to adopted without evals, same as you don't promote a capability without signal. *Owner:* one-off (per skill author).

### 3b. Genuine builds — now

These trip the §1 test. There are three.

**D. Evidence Substrate** *(currently the Evidence Operating Kit, a spreadsheet; app-form working name "Stacks" — un-adopted)*
- *Pain:* Evidence lives across docs, transcripts, sheets, Cursor, Jira; traceability is partial and manual. Nothing else can be real until this is.
- *Claude already does:* nothing here — **it has no memory across sessions or engagements.**
- *The actual build:* durable storage for Risk → Assumption → Slice → Signal → Confidence → Decision, per engagement, **plus an MCP connector so Claude can read/write it mid-work.** Not a bespoke UI. The kit is v0 and is filled for Imagine; promote to stored + connected only once A–C have populated it by hand enough to prove the schema.
- *Justification:* #1 (memory) + #2 (MCP). *Owner:* sponsored. *Before:* G, H, I, N, S.

**E. Capability Model MCP Server**
- *Pain:* The model is a website humans read; agents can't consult it mid-work, so the stable layer can't enforce anything programmatically. Definitions/source-of-truth files (the former "Nucleus," now collapsed here) have the same problem.
- *Claude already does:* the reasoning, once it can see the model — but it can't see it.
- *The actual build:* a thin MCP wrapper over the existing YAML (capabilities, levels, risk shapes, dials, seams) **and** the definition files, so any skill or agent can query "which capabilities does this risk shape fire, at what dial?" and "what is the canonical definition of X?"
- *Justification:* #2 (MCP). Highest-leverage moderate-effort build. *Owner:* **one-off — James.** *After:* YAML is stable (it is). *Before:* K, L, M-extension, conflict checks.

**J. Two-Week Tripwire Monitor**
- *Pain:* The two-week tripwire is a principle no one is watching; evidence work stalls silently.
- *Claude already does:* nothing — **it doesn't watch a clock or self-trigger.**
- *The actual build:* a small scheduled job (cron + Slack post) that checks **D** and pings the SparqOS channel if no evidence slice has started by end of week 2. Automation, not an app.
- *Justification:* #3 (self-triggering). *Owner:* one-off. *After:* D-v0. *Before:* standing watcher.

### 3c. Genuine builds — deferred (with the trigger to revisit)

Each trips the §1 test but should not be built yet. The reasoning in each is native; only the wrapper is new.

**Q. Evidence Loop Agent**
- Wraps A, B, C + reads/writes **D** into a loop over an engagement. *Justification:* #4 (guarded autonomy). Must pass the four-question gate; a human signs off every confidence update, non-negotiable. *Owner:* sponsored. **Revisit when:** running A/B/C by hand becomes the bottleneck under delivery pressure.

**R. Live-Comms Drift Detection**
- Runs transcripts against logged assumptions in **D**, flags contradictions. Reasoning is native; Zoom/Slack MCP connectors already handle ingestion. *The actual build:* a scheduled trigger + those connectors + read access to D. *Justification:* #2 + #3. *Owner:* tbd. **Revisit when:** D + K exist and drift between the room and the record is a recurring problem.

**S. Cross-Engagement Pattern Surface** *(retrieval/SPOT; substrate-coupled vs -agnostic still open)*
- "This risk resembles one we tested before; here was the signal." *The actual build:* if substrate-coupled, a query skill over **D** across engagements (near-free once D holds multiple) — if substrate-agnostic, a retrieval layer over broader corpora. *Justification:* #1 + #2. *Owner:* sponsored. **Revisit when:** the substrate holds several engagements and the coupled/agnostic question resolves on demo signal. *Horizon note:* cheaper inference + bigger context may make "read it all each time" viable and shrink this to a skill — don't oversize it now.

**T. Autonomous Slice Loops**
- **O** promoted from skill to agent: qualify slice → scaffold spike → capture signal into **D** → draft the confidence update for human sign-off. *The actual build:* the agency wrapper (loop + guardrails) over O. *Justification:* #4. *Owner:* sponsored. **Revisit when:** hand-running O across many slices hurts.

### 3d. Client experience (during a live engagement)

This is what a client feels while we work — distinct from the client-facing *product*. The demo blurred those; keep them separate.

**The framing rule (governs every mode).** Convert *uncertainty remaining* into *risk retired*. "60% complete" reads as behind; "four of six collapse risks retired" reads as progress. Both are honest; one triggers the client's why-isn't-this-green reflex and one doesn't. A dashboard is the riskiest mode precisely because it sells certainty (gauges, %-complete) while evidence work sells calibrated uncertainty. Whatever the surface, the load-bearing work is the framing, not the pixels.

**Selling ahead of the build (the Blueprint pattern).** Commercial may want to sell the portal (V) while delivery is running the push update (N). The doctrine doesn't forbid that — it bounds it. The four-question gate is the line: you may show V as vision/roadmap, explicitly Concept-state; you may not bill it as delivered. N is what's live and honest today. Selling V as delivered is the Blueprint failure mode — a label ahead of the capability — and it fails the same way. Sell the vision labeled as vision; deliver N.

**N. Mode A — Client Push Update** *(build now)*
- *Pain:* Clients need honest, current confidence without internal vocabulary, and without a standing surface to build.
- *Build:* SKILL.md that generates a note when confidence *moves* — what we tested, what shifted, what decision it unlocks, what's still a bet — delivered into a channel they already use (email/Slack/shared doc). Reads **D**. No new surface, so it doesn't trip #5.
- *Cadence rule:* fires on evidence change, not calendar, or it becomes status theater.
- *Cheapest strong version:* ride the touchpoint the client already has (Scope Check, steering) and change only what it shows — risk retired, not % done. Zero software.
- *Owner:* one-off. *After:* D + G + H. *Gated by:* W.

**U. Mode B — Client Living Record** *(deferred, small)*
- *Pain:* Between updates, clients want to pull the current state themselves.
- *Build:* one always-current readable doc (Google Doc/Notion) — decision ledger + validated/assumed/uncertain, in prose — regenerated when evidence changes. A generated artifact in a place they already have, not a bespoke surface.
- *Justification:* borderline #5 (standing readable, but a doc, not an app). *Owner:* sponsored. *Gated by:* W.
- **Revisit when:** clients repeatedly ask to see the record between pushes. That pull is the promotion signal from N. *Risk:* drifts into a dashboard the moment someone adds charts.

**V. Mode C — Client Portal** *(deferred product — Continua territory)*
- *Pain:* (the demo) an interactive standing surface — confidence over time, risk signal, roadmap.
- *Build:* a genuine app, trips #5, highest polish-risk. Separate commercial product; do not couple it to the internal substrate now. This is also where client calibration → evidence becomes possible (a client overrides a health read; that calibration feeds **D**) — a product feature, deferred with the product.
- *Justification:* #5. *Owner:* sponsored (product). *Gated by:* W. **Revisit when:** sustained client pull on U plus a commercialization decision. May be shown as vision earlier under the sell-ahead rule.

**W. Disclosure-Boundary Pass** *(gates N, U, V)*
- *Pain:* Internal confidence language ("assumption untested," "feasibility unproven") leaking to a client can alarm or over-expose. Client-facing is not internal-facing.
- *Build:* SKILL.md that runs the judgment-kit disclosure-boundary pass on any client-facing output before it ships — names what's internal-only vs client-safe. Existing skill applied to the client layer.
- *Owner:* one-off. *Gates:* N, U, V.

---

## 4. Sequencing

Default gravity, not gates:

```
A ─▶ B ─▶ C ─▶ [D seeded by hand]
                     │
   E ─────────────▶ D (stored + MCP) ─▶ G ─▶ H ─▶ N (via W) ─▶ U ─▶ V
   │                     │
   ▼                     ▼
   L, M-extension    I ─▶ J (watcher)
                          │
                     K (needs E) ·  Q wraps A/B/C
                          │
                          ▼
                 deferred: R · S · T
skill hygiene runs alongside: X (index) · Y (evals)
```
The load-bearing move is A→B→C seeding D by hand — that hand-seeding is the evidence slice that earns D's real build.

---

## 5. Deliberately not built

- **Artifact generation as a platform** — skill family (G), never a platform.
- **A separate "Nucleus" app** — collapsed into **E**; definitions are files behind the same MCP.
- **A standalone margin-vs-confidence monitor** — folded into L as a close-of-engagement feedback pass.
- **Multi-agent orchestration** — premature; revisit only after two agents run reliably.
- **Standalone agent observability** — bundle it with the first agent (Q/T), don't build it alone now.
- **Numeric confidence scoring** — confidence stays qualitative, by design.
- **Any custom UI for reasoning Claude already does** — the default over-build.

---

## 6. Summary table (machine-legible)

| ID | Name | Real build? | What's actually built | §1 reason | Owner | State |
|---|---|---|---|---|---|---|
| A | Risk-to-Assumption Structurer | No | SKILL.md rubric (runs from sales seam) | — | one-off | now |
| B | Slice Qualifier | No | SKILL.md rubric | — | one-off | now |
| C | Signal / Instrumentation Definer | No | SKILL.md rubric | — | one-off | now |
| D | Evidence Substrate (kit → stored + MCP) | **Yes — now** | storage + MCP connector | #1, #2 | sponsored | v0 exists |
| E | Capability Model MCP Server | **Yes — now** | thin MCP wrapper over YAML + defs | #2 | one-off — James | claimed |
| F | Canonical Source of Truth | No | collapsed into E (files behind MCP) | — | — | folded |
| G | Confidence-Tiered Artifact Generation (name un-adopted) | No | SKILL.md per artifact | — | sponsored | after D |
| H | Polish-vs-Confidence Linter | No | SKILL.md rubric + read D | — | one-off | after G |
| I | Confidence Gate Checker | No | SKILL.md rubric | — | one-off | after D |
| J | Two-Week Tripwire Monitor | **Yes — now** | cron + Slack, reads D | #3 | one-off | after D-v0 |
| K | Conflict Detector | No (auto variant = yes) | SKILL.md, reads defs via E | — (#3 if auto) | one-off | after E |
| L | Pricing Composer | No | SKILL.md (skill, not tool) | — | sponsored | after E, I |
| M | Engagement Change Runner | No | exists; extend to call E | — | tbd | exists |
| N | Client Push Update (Mode A) | No | SKILL.md, reads D, gated by W | — | one-off | now (after D,G,H) |
| O | Spike Runner / Slice Executor | No | Claude Code SKILL.md | — | one-off | after C |
| P | Model Onboarding Skill | No | SKILL.md | — | one-off | after A–I |
| Q | Evidence Loop Agent | Yes — deferred | agent wrapper over A/B/C + D | #4 | sponsored | defer |
| R | Live-Comms Drift Detection | Yes — deferred | trigger + Zoom/Slack MCP + D | #2, #3 | tbd | defer |
| S | Cross-Engagement Pattern Surface (SPOT) | Yes — deferred | query/retrieval over D | #1, #2 | sponsored | defer |
| T | Autonomous Slice Loops | Yes — deferred | agent wrapper over O | #4 | sponsored | defer |
| U | Client Living Record (Mode B) | Yes — deferred (small) | generated doc, gated by W | #5 (borderline) | sponsored | defer |
| V | Client Portal (Mode C, Continua) | Yes — deferred (product) | standing client surface, gated by W | #5 | sponsored | defer |
| W | Disclosure-Boundary Pass | No | SKILL.md (judgment-kit applied) | — | one-off | gates N/U/V |
| X | Skill Index | No | repo file | — | one-off | now |
| Y | Skill Evaluation | No | practice (skill-creator evals) | — | one-off | now |

**Build-now total: three (D, E, J).** Everything else is a SKILL.md, a file, a practice, or deferred.

---

## 7. End state (not a build)

"MCP-native everything" — any agent in any surface reasoning against the same model and substrate — is not an item to build. It is what emerges once **D** and **E** exist. If those two are real and everything else is stateless skills or gated agents against them, the constraint system is genuinely infrastructure: the stable layer stays fixed, the volatile layer stays disposable, and it stops depending on one person.

---

## 8. Horizon effects (≤ 6 months — things change)

- **Claude memory improving ≠ D solved.** Per-user chat memory is not a shared, structured, auditable engagement record. D stands.
- **Cheaper inference + bigger context** may make "read it all each time" viable, shrinking retrieval (S) toward a skill. Don't oversize S now.
- **More capable, cheaper agents** may promote Q/R/T sooner than expected — but the four-question gate and human sign-off on confidence updates do not relax as capability rises.
- **Agent observability** becomes necessary the moment any agent runs unattended. Bundle it with the first agent, not before.
