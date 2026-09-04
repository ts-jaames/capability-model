# SparqOS — Build Inventory & Classification

Reference for anything built to make SparqOS infrastructural rather than supervised. Read-only in the repo; not rendered on the site.

This file is written human-first but structured so an agent or app can consume it later without a rewrite. Every item has a stable ID (A–P, plus the agent items) and the same field set. See §0 for the upgrade path.

Governing constraint that shaped the whole list: **the build roadmap obeys Evidence Work.** The cheap skills are thin slices — they generate the signal that earns the expensive substrate. We do not build the substrate first.

---

## 0. How this file is meant to be consumed

- **Now:** humans read it. There is no agent consumer yet, so a machine schema now would be building before validating.
- **When an agent needs it:** lift the per-item fields into YAML front-matter or a sidecar `.yaml`/`.json` keyed by the same IDs. The markdown stays the human view; the extract becomes the agent's source.
- **One source, multiple views.** Never hand-maintain two copies — the moment there are two, they drift, which is the drift problem the canonical-source-of-truth work exists to prevent.
- The summary table in §7 is the machine-legible affordance: human-scannable and parseable as-is.

---

## 1. Classification — what a thing is, before you build it

### 1a. Two axes, not one size ladder

**Axis A — Nature (what kind of thing is it?)**

| Kind | It… | Test |
|---|---|---|
| **Substrate / App** | holds state, is a source of truth, others depend on it | Does something break if it loses its memory? |
| **Skill** | encodes judgment, is stateless, does one job when invoked | Same inputs → same *shape* of output, no memory after it finishes? |
| **Tool** | exposes or watches something else; light or no state | Is its job to serve or check, rather than to own? |

**Axis B — Autonomy (how much does it act on its own?)** — this is where **Agent** lives.

An agent is not a bigger skill. An agent is: one or more **skills** + **tool access** + a **loop** + **guardrails** + a **leash length**. An agent reads/writes substrates and calls skills; it sits between them.

Autonomy levels, lightest to heaviest: **human-invoked** (one shot) → **human-in-the-loop** (agent runs, human approves each step) → **human-on-the-loop** (agent runs, human reviews after) → **fully auto**.

### 1b. The layering (where commercial packages, kits, and playbooks sit)

These are not the same kind of thing as skill/agent/app. They stack:

```
COMMERCIAL PACKAGE   ← what the client buys      (IQ suites: Blueprint.IQ, Ask.IQ…)   [volatile label]
        │  packages
CAPABILITY           ← the atomic unit, has a LEVEL                                   [stable]
        │  delivered via
PLAYBOOK             ← the how-to / delivery enablement                               [the missing piece]
        │  run/supported by
TOOLING              ← skills · agents · tools, each with guardrails + owner
        │  reads/writes
SUBSTRATE            ← evidence kit / evidence substrate / source-of-truth stores     [stable]
```

Rules that fall out:
- **A commercial package does not get its own level ladder.** Its maturity is a view over the levels of the capabilities it packages, plus whether a playbook, guardrails, and owner exist. Giving a package its own levels couples a volatile label to the stable layer — the error the operating view avoids by referencing capabilities, not external-line names.
- **A "kit" is substrate.** The Evidence Operating Kit is substrate-v0 (a spreadsheet). A filled kit (e.g. Imagine) is an instance.
- **A playbook is delivery enablement, not a tool.** Its absence is why a commercial label can exist with nothing runnable beneath it.

### 1c. The four-question gate

The same four questions govern two promotions — **"is this agent safe to run?"** and **"is this commercial package sellable as delivered?"** — because both ask whether a thing can operate without a person standing over it.

1. **Can you run it with guardrails?** — does bounded operation exist at all?
2. **What are the guardrails?** — the leash, tool permissions, stop conditions.
3. **Can you execute it on your own?** — autonomy level.
4. **Who owns it?** — accountability when it runs or ships.

Until all four are answered, the thing is **Concept-state**: a direction, a pitch, a prototype. It may be named and positioned. It may not be sold or run as though it's Commitment-state. Deliverables referencing it must reflect that confidence level.

### 1d. Ownership tags

Every build carries one, orthogonal to type:
- **Sponsored** — has an owner and a team; a standing project.
- **One-off** — one person can clear it.

### 1e. Naming guardrail

Naming a thing that doesn't exist defines it for everyone. Any component name below marked *working name* or *proposed* is a label, not a constructed thing; referencing it as if it exists is a commitment act disguised as a description. Treat it as Concept-state until deliberately adopted.

---

## 2. Effort / Value matrix

Value = leverage toward making the constraint system infrastructure instead of a person. Effort = build cost, roughly.

| | **Low effort** | **High effort** |
|---|---|---|
| **High value** | Risk→Assumption (A) · Slice Qualifier (B) · Signal Definer (C) · Polish/Confidence Linter (H) · Tripwire Monitor (J) | Capability Model MCP (E) · Evidence Substrate (D) · Artifact-Generation skills (G) · Canonical Source of Truth (F) · Pricing Composer (L) · Evidence Loop Agent (Q) |
| **Lower value (now)** | Onboarding Skill (P) · Decision Ledger seed | Client Confidence View (N) · Retrieval Surface / SPOT · Live-comms drift detection |

Reading the top row left-to-right gives the default build order.

---

## 3. Build inventory

Each item: **Pain · Solution · Type (nature + autonomy) · Effort · Value · Owner tag · Sequencing (usually-after / usually-before).** Sequencing is default gravity, not a gate — any item can be picked up out of order if signal demands.

### Intake layer — runs today, no substrate required

**A. Risk-to-Assumption Structurer**
- *Pain:* Assumptions stay implicit — the #1 gap from Imagine Studios. Conversations produce opinions and direction, not testable statements.
- *Solution:* Skill that takes a vague risk and emits a declarative, testable assumption with explicit success/failure criteria and a linked decision consequence.
- *Type:* SKILL (human-invoked) · *Effort:* S · *Value:* High · *Owner:* one-off
- *After:* nothing — the front door. *Before:* Slice Qualifier (B).

**B. Slice Qualifier**
- *Pain:* Slices silently become features ("does AR measurement work AND feel intuitive AND integrate with pricing…"). False confidence follows.
- *Solution:* Skill that rejects a proposed slice unless it tests exactly one assumption, has predefined signal, is time-boxed, and is disposable-unless-promoted.
- *Type:* SKILL (human-invoked) · *Effort:* S · *Value:* High · *Owner:* one-off
- *After:* A. *Before:* Signal Definer (C).

**C. Signal / Instrumentation Definer**
- *Pain:* "Without predefined signal criteria, slices degrade into demos." Signal isn't instrumented before building.
- *Solution:* Skill that, given an assumption, defines what gets measured, success/failure, capture method, and the promotion threshold — before any build.
- *Type:* SKILL (human-invoked) · *Effort:* S · *Value:* High · *Owner:* one-off
- *After:* B. *Before:* Spike Runner (O) / any build.

### Substrate layer — earned, not assumed

**D. Evidence Substrate** *(currently the Evidence Operating Kit, a spreadsheet; working name for the app form: "Stacks" — un-adopted)*
- *Pain:* Evidence lives across docs, transcripts, sheets, Cursor context, Jira. Traceability is partial and manual. Nothing else — artifact generation, retrieval/SPOT, confidence tracking — can be real until this is.
- *Solution:* The persistent store for Risk → Assumption → Slice → Signal → Confidence → Decision, per engagement. The kit already exists as v0 and is filled for Imagine. Promote to an app only once A–C have populated it by hand enough to prove the schema holds.
- *Type:* APP (substrate; currently spreadsheet-v0) · *Effort:* L · *Value:* Highest, but gated · *Owner:* sponsored
- *After:* A, B, C have run against real engagements. *Before:* generation skills (G), Confidence Gate (I), retrieval/SPOT.

**E. Capability Model MCP Server**
- *Pain:* The capability model is a website humans read. Agents can't consult it mid-work, so the stable layer can't enforce anything programmatically.
- *Solution:* Wrap the YAML (capabilities, levels, risk shapes, dials, seams) behind an MCP server so any skill or agent can ask "which capabilities does this risk shape fire, and at what dial?" Highest-leverage moderate-effort build on the list.
- *Type:* TOOL (exposes stable layer) · *Effort:* M · *Value:* Very High · *Owner:* **one-off — James**
- *After:* model YAML is stable (it is). *Before:* everything that reasons against the model — Change Runner (M) extension, Pricing (L), Gate checks (I).

**F. Canonical Source of Truth** *(working name: Nucleus)*
- *Pain:* Definitions drift. Substrate / generation layer / retrieval, capability/role/title, Seam/Fabric get conflated, producing real architectural errors.
- *Solution:* The entity/definition store of record. Everything else references it.
- *Type:* APP (substrate) · *Effort:* L · *Value:* High, later · *Owner:* sponsored
- *After:* Capability Model MCP (E) — may share a spine. *Before:* Conflict Detector (K).

### Generation layer — skills, not a platform

**G. Confidence-Tiered Artifact Generation** *(proposed name VERA — un-adopted; do not reference as if it exists)*
- *Pain:* Humans re-synthesize the same evidence into overlapping artifacts; confidence isn't reflected in the language.
- *Solution:* A skill *per artifact* (strategy, roadmap, epic backlog, milestone plan, cost model, scope check) that reads the substrate and writes with language tied to actual confidence: high → definitive, medium → directional, low → explicit hypothesis, missing → says so. Build as separate stateless skills, not one platform — a platform here recreates polished-fiction risk at the tooling layer.
- *Type:* SKILL family (human-invoked) · *Effort:* M each · *Value:* High · *Owner:* sponsored (family); individual artifact skills can be one-offs
- *After:* substrate (D) holds real evidence. *Before:* Polish Linter (H) has something to check.

### Enforcement layer — where "infrastructure not supervision" gets real

**H. Polish-vs-Confidence Linter**
- *Pain:* Polish gets mistaken for confidence — the core failure mode. Clean roadmap, confident architecture, untested underneath.
- *Solution:* Skill that reads a draft artifact against substrate confidence states and flags every place the language asserts more than the evidence supports.
- *Type:* SKILL (human-invoked) · *Effort:* S–M · *Value:* Very High · *Owner:* one-off
- *After:* substrate (D) + at least one generated artifact (G). *Before:* any client-facing send.

**I. Confidence Gate Checker**
- *Pain:* Promotion from Concept→Validation→Commitment happens on enthusiasm or calendar, not earned signal.
- *Solution:* Evaluates a capability against the gate guidelines and returns promote / iterate / pivot / stop with the rationale required to be logged.
- *Type:* SKILL, or TOOL against the substrate (human-invoked) · *Effort:* S–M · *Value:* High · *Owner:* one-off
- *After:* substrate (D) + Signal Definer (C). *Before:* Decision Ledger entry.

**J. Two-Week Tripwire Monitor**
- *Pain:* The two-week tripwire is a principle no one is watching. Evidence work stalls silently.
- *Solution:* Scheduled check against the substrate; if no evidence slice has started by end of week 2 of a discovery engagement, it pings the SparqOS Slack channel. Pure structural enforcement.
- *Type:* TOOL (watcher; human-on-the-loop) · *Effort:* S · *Value:* Medium–High · *Owner:* one-off
- *After:* substrate-v0 (D). *Before:* nothing — a standing watcher.

**K. Conflict Detector**
- *Pain:* Conversations and artifacts rub against defined entities and no one notices until it's an architectural error.
- *Solution:* Skill that runs a live artifact or transcript against the canonical source of truth (F) and surfaces conflicts with defined entities.
- *Type:* SKILL (human-invoked) · *Effort:* M · *Value:* High · *Owner:* one-off
- *After:* F. *Before:* forward-facing drift detection.

### Commercial layer

**L. Confidence-Tiered Pricing Composer**
- *Pain:* Fixed-fee scope relocates risk downstream into change orders and margin erosion. Pricing doesn't distinguish validated from directional from unvalidated.
- *Solution:* Reads capability confidence states and composes pricing: tight on validated, risk buffer on directional, explicit spike window on unvalidated. E-09 (the AI epic) is the canonical test case.
- *Type:* TOOL, or SKILL against MCP (E) + substrate (D) · *Effort:* M · *Value:* High · *Owner:* sponsored (commercial owner needed)
- *After:* Capability Model MCP (E) + Confidence Gate (I). *Before:* SOW / change-order generation.

**M. Engagement Change Runner** — *exists as a skill.*
- Reference implementation of the pattern: reads the model + engagement state + change event → re-fires risks, shifts dials, re-opens the go/redirect/stop call, re-staffs, re-prices.
- *Type:* SKILL (human-invoked) · *Owner:* tbd
- *Next:* extend it to call the MCP server (E) once that exists, rather than carrying the model inline.

### Client-experience layer — careful

**N. Client Confidence View (read-only)**
- *Pain:* Clients need honest confidence without seeing internal methodology vocabulary.
- *Solution:* Read-only view generated from the substrate with client-safe language — confidence over time, decision ledger, risk signal. Scope as a thin generated view, not a product. The full version is a separate commercial product and should not be coupled to the internal substrate yet.
- *Type:* APP · *Effort:* M–L · *Value:* Medium (now) · *Owner:* sponsored (deferred)
- *After:* substrate (D) + generation (G) + Polish Linter (H). *Before:* any client-product commercialization decision.

### SDLC plug-point + enablement

**O. Spike Runner / Slice Executor**
- *Pain:* The gap between a defined assumption and an actually-instrumented spike in code is manual.
- *Solution:* Claude Code skill that takes a qualified slice + defined signal and scaffolds the instrumented, time-boxed, disposable spike. The SKILL.md plug point between the capability model and the AI-Native SDLC.
- *Type:* SKILL now (human-invoked); candidate to become an agent later — see Q · *Effort:* M · *Value:* Medium–High · *Owner:* one-off
- *After:* Signal Definer (C). *Before:* Confidence Gate (I) — it produces the signal the gate reads.

**P. Model Onboarding Skill**
- *Pain:* The system depends on one person holding the mental model. Enablement is the missing connector.
- *Solution:* Skill that walks a new person through the model using their live engagement as the worked example.
- *Type:* SKILL (human-invoked) · *Effort:* S · *Value:* Medium · *Owner:* one-off
- *After:* enough of A–I exist to demonstrate. *Before:* wider rollout.

### Agent layer — skills wrapped in a loop, gated by §1c

**Q. Evidence Loop Agent**
- *Pain:* Running the intake loop (structure risk → qualify slice → define signal → capture → update confidence) by hand is where evidence work stalls under delivery pressure.
- *Solution:* An agent that wraps skills A, B, C (and reads/writes the substrate) into a loop over an engagement. Must pass the four-question gate before it runs: bounded scope, defined guardrails, and — non-negotiable — a human signs off on every confidence update. Humans govern interpretation; the agent runs the loop.
- *Type:* AGENT (skills A/B/C + substrate access + loop; human-in-the-loop on confidence) · *Effort:* L · *Value:* High · *Owner:* sponsored
- *After:* A, B, C exist and substrate (D) is real. *Before:* forward-facing autonomous slice loops.

---

## 4. Sequencing spine

Default gravity, not gates:

```
Risk→Assumption(A) ─▶ Slice Qualifier(B) ─▶ Signal Definer(C) ─▶ [substrate v0 seeded by hand (D)]
        │                                                              │
        │                        Capability Model MCP(E) ─▶ substrate app(D) ─▶ generation(G) ─▶ Polish Linter(H)
        │                               │                        │                                   │
        ▼                               ▼                        ▼                                   ▼
   (feeds all)                  Pricing Composer(L)       Confidence Gate(I)                Client View(N)
                                     │                        │
                                     ▼                        ▼
                               Change Runner(M)        Decision Ledger + Tripwire(J)
                                                              │
                          Canonical Source(F) ─▶ Conflict Detector(K)   Evidence Loop Agent(Q) wraps A/B/C
                                                              │
                                                              ▼
                                          (fwd) drift detection · retrieval/SPOT
```

The load-bearing move is the top row left-to-right: the intake skills seed the substrate by hand, and that hand-seeding is the evidence slice that earns the real substrate build.

---

## 5. Deliberately not yet (and why)

- **Artifact generation as a platform** — recreates polished-fiction risk at the tooling layer. Keep it a skill family (G).
- **Full client workspace / client product** — separate commercial product. Coupling it to the internal substrate now violates the stable/volatile rule.
- **Retrieval Surface (SPOT) as general retrieval** — the substrate-coupled vs substrate-agnostic question is still open and correctly deferred pending demo signal.
- **Numeric confidence scoring** — confidence stays qualitative for now, by design.

---

## 6. Forward-facing (≤ 6 months — horizon caveat: things change)

- **Live-comms drift detection** — run transcripts against logged assumptions in the substrate; flag when what's said in the room contradicts what's on the record. The Conflict Detector (K) pointed at live conversation. After F + K exist.
- **Cross-engagement pattern surface (retrieval/SPOT, compounding version)** — "this risk resembles one we tested before; here was the signal." The compounding idea for internal delivery. Natural endpoint of the substrate.
- **Autonomous slice loops** — Spike Runner (O) promoted from skill to agent: qualifies the slice, scaffolds the spike, captures signal into the substrate, drafts the confidence update for human sign-off. Passes the four-question gate first.
- **MCP-native everything** — once E and F exist, any agent in any surface (Cowork, Cursor, Slack) reasons against the same model and substrate. The version where the constraint system is genuinely infrastructure.

---

## 7. Summary table (machine-legible)

| ID | Name | Nature | Autonomy | Layer | Effort | Value | Owner | State |
|---|---|---|---|---|---|---|---|---|
| A | Risk-to-Assumption Structurer | Skill | human-invoked | Intake | S | High | one-off | buildable now |
| B | Slice Qualifier | Skill | human-invoked | Intake | S | High | one-off | buildable now |
| C | Signal / Instrumentation Definer | Skill | human-invoked | Intake | S | High | one-off | buildable now |
| D | Evidence Substrate (kit → app; name un-adopted) | App | n/a | Substrate | L | Highest (gated) | sponsored | v0 exists (spreadsheet) |
| E | Capability Model MCP Server | Tool | n/a | Tooling | M | Very High | one-off — James | claimed |
| F | Canonical Source of Truth (name un-adopted) | App | n/a | Substrate | L | High (later) | sponsored | Concept |
| G | Confidence-Tiered Artifact Generation (name un-adopted) | Skill family | human-invoked | Generation | M each | High | sponsored | Concept |
| H | Polish-vs-Confidence Linter | Skill | human-invoked | Generation | S–M | Very High | one-off | Concept |
| I | Confidence Gate Checker | Skill/Tool | human-invoked | Enforcement | S–M | High | one-off | Concept |
| J | Two-Week Tripwire Monitor | Tool | human-on-the-loop | Enforcement | S | Med–High | one-off | Concept |
| K | Conflict Detector | Skill | human-invoked | Enforcement | M | High | one-off | Concept |
| L | Confidence-Tiered Pricing Composer | Tool/Skill | human-invoked | Commercial | M | High | sponsored | Concept |
| M | Engagement Change Runner | Skill | human-invoked | Commercial | — | — | tbd | exists |
| N | Client Confidence View | App | n/a | Client | M–L | Medium (now) | sponsored | deferred |
| O | Spike Runner / Slice Executor | Skill (→agent later) | human-invoked | SDLC | M | Med–High | one-off | Concept |
| P | Model Onboarding Skill | Skill | human-invoked | Enablement | S | Medium | one-off | Concept |
| Q | Evidence Loop Agent | Agent | human-in-the-loop | Agent | L | High | sponsored | Concept |

---

*Structural note: nearly every high-value item is a skill or agent reading a substrate. The two substrates worth owning are the evidence substrate and the capability model (via MCP). If those two are real and everything else is stateless skills or gated agents against them, the architecture stays honest — the stable layer stays fixed, the volatile layer stays disposable, and the constraint system stops depending on one person.*
