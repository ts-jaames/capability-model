# AI operating rules

This repo is the consultancy operating-model SSOT. Assistants (Claude, Cursor, CoWork) follow these rules without exception.

Schema keeps files valid. This file keeps **meaning** valid. If a request fails an admission test, **do not write the YAML**. Say what the thing actually is and which bucket it belongs in.

## Classify first

When someone asks to add X, classify it before creating a file:

1. Domain?
2. Capability?
3. Skill?
4. Level?
5. Title?
6. Staffing bound (today stored as `roles/`)?
7. Risk shape, intensity dial, or seam?
8. Definition?
9. Doctrine?

If it is not a capability, say so. Do not create a capability file to be helpful.

## Admission tests

### Domain

A type of work. The six are **closed**: Commercial, Framing, Building, Proof, Enablement, Continuity. Do not add a seventh. Do not rename them without an explicit human decision. Domains have **no** L1–L3. Levels never attach to a domain.

### Capability

A named **client outcome**. It must answer: what do we promise, and what do they walk away with?

Pass only if a client would pay for this as a **result**, not as an activity.

Fail — and reclassify — if it is:

- a tool or platform (Figma, LangChain, Jira)
- a title (Design Strategist, AI Engineer, Forward Deployed Engineer)
- a task or ceremony (“run a workshop”, “write a PRD”)
- a skill or method used inside delivery (tokenization, eval design)
- a domain restated (“do Framing”, “do enablement”)
- a staffing pattern or seat

A capability belongs to **exactly one** of the six domains. Prefer extending an existing capability over minting a near-duplicate. Note overlap in `promise` instead of splitting hairs into a new file.

### Skill

An atomic method (`core_technique`) or specific tool (`transient_tool`) used **inside** a capability. Skills are never referenced from roles. A capability lists at most 10 `agent_skills`. After adding a skill, attach it to at least one capability.

### Level

How a **capability** is executed: L1 Guided Execution, L2 Practitioner, L3 Advanced Lead, plus Owner (agency-wide accountability for that capability — not a fourth execution grade).

Levels are not a property of domains, skills, titles, or people. Do not invent L4. Do not put the execution scale on a domain or a skill.

### Risk shape

A recurring kind of **riskiest unknown**. It names an unknown, fires a set of capabilities at a dial, and produces an output.

Pass only if it is a question the engagement cannot answer yet. Fail — and reclassify — if it is a phase (“discovery”), a deliverable, a capability restated, or a client complaint.

A risk shape fires capabilities it does not contain. Never move a capability into a risk shape. Shapes co-occur, recur, and persist; `reading_order` is page order, not firing order.

### Intensity dial

How hot a capability is running **right now**: Dormant, Low, Active, Peak. The four steps are **closed**.

Dials are not levels. A level is how deeply a capability is executed and is a property of the capability; a dial is how hard it is running on this engagement and is a property of the moment. Never put a dial on a capability file, and never put a level on a risk shape. A shape may not fire a capability at `dormant` — firing means turning it up.

### Seam

The **load-bearing handoff** between two capabilities or two domains: what must cross, in what form. It is the floor for a valid handoff, not a process step.

Pass only if you can state what crosses, what it is not, and how it is violated. Fail if it is a meeting, a ceremony, a document template, or a phase gate. A seam joins two different endpoints; its name is derived from those endpoints, never authored separately.

### Definition

A **canonical term** in this model, plus the confusions it exists to prevent. This is the definition store of record — the thing every other artefact should agree with.

Pass only if the term is already load-bearing in this repo **and** gets conflated with something else. The `not` list is the point of the file; a definition with nothing to rule out is a glossary entry, not a definition.

Fail — and reclassify — if the thing is really a capability, a title, a skill, or a tool. Writing a definition file is not a way around the admission test for those. A definition never carries a level or a dial, and defining a term does not make the thing it names exist.

### Title (`titles/`)

An **internal grouping of owned capabilities** — shorthand for a coherent bundle one person can be accountable for. Product Architect, Experience Architect, AI Architect, Forward Deployed Engineer, Adoption Architect.

A title is **not a commercial artefact**. It never appears on a SOW or a rate card. The client buys the outcome, priced from the capabilities-at-levels underneath. Titles are peer categories, not a ladder; seniority lives on the consultant band and the level.

Pass only if it names a bundle of capabilities that already exist and that someone can own together. Fail — and reclassify — if it is a seat name, a market label with no ownership behind it, or a seniority grade.

`owns` is a list of `{domain}` or `{capability}` refs, the same shape a seam endpoint uses. Owning a domain owns every capability in it. **Every capability must be owned by exactly one title** — that is what stops a title becoming a grab-bag and stops a capability becoming an orphan. Do not add a sixth title without moving ownership to make room for it.

Distinct from a staffing bound: a title is who owns what, agency-wide and durable; a bound is what one seat may execute on one engagement.

### Doctrine (`doctrine/`)

A **named, ordered procedure or structure the firm follows** that is not a capability, a skill, or a definition: the commercial stack, how seats get filled, what happens when the work changes.

Pass only if it has an order that carries meaning and a reader could act on it. Fail — and reclassify — if it is a single claim (that is a definition), a client outcome (a capability), or a method used inside delivery (a skill).

`steps[]` are ordered and named. A step may cite `capabilities[]`, and those refs must resolve — a doctrine that names capability work without pointing at the capability is prose. Where a doctrine is also an agent procedure, the YAML is the source and the `SKILL.md` follows it; never author the same steps twice.

### Staffing bound (`roles/`)

Which capabilities a seat **owns** (max 2, Owner accountability) vs can **execute** (max 7, L1–L3). Not a title. `Interface Lead` is an example of a bound — owns Product & interface building, executes Problem framing and Stakeholder alignment — not a job name. Titles have now been designed on purpose and are rendered; bounds have not, so the executive site still does not render `roles/`.

## Do

- Read this file, `levels.yaml`, and existing YAML before adding files.
- Filename stem must equal `id` (kebab-case). Capabilities omit `id`; the stem **is** the id.
- Capability files live at `capabilities/<domain-slug>/<kebab-id>.yaml`. `domain` in YAML is the display name (`Building`, not `building`).
- Risk shapes live at `risk-shapes/<kebab-id>.yaml`, seams at `seams/<kebab-id>.yaml`, definitions at `definitions/<kebab-id>.yaml`, titles at `titles/<kebab-id>.yaml`, doctrine at `doctrine/<kebab-id>.yaml`. `intensity.yaml` is the dial legend, beside `levels.yaml`.
- Set `status: draft` on skills, domains, roles, risk shapes, seams, definitions, titles, and doctrine. Capabilities omit `status`; tooling treats missing status as `draft`. Never write `reviewed` or `ratified` unless a human explicitly asked to promote that file.
- `capability-profiles.yaml` records who is certified to execute what, at which level. It is `visibility: internal` and never reaches the site. Real per-person entries belong in a private overlay, not here — this repo is public. Do not invent anyone's certification.
- Leave `dials_reviewed: false` on a risk shape unless a human has explicitly reviewed that shape's dial values. The dial is a judgment call, and pretending otherwise is the failure this model exists to prevent.
- Keep YAML readable for non-engineers. Prefer short sentences and lists.
- Run `npm run validate` after edits. Fix every error before finishing. If you touched `scripts/model.mjs` or `mcp/`, run `npm test` and `npm run mcp:smoke` too.

## Do not

- Do not invent entities that fail the admission tests.
- Do not edit `site/`. It is generated by `npm run build`.
- Do not add dependencies beyond `yaml` and `ajv`. This survived the MCP server: the official SDK pulls 91 packages including two HTTP frameworks and an OAuth stack, none of which a local stdio process reading YAML can use, so `mcp/stdio.mjs` speaks JSON-RPC directly. Revisit only when a hosted HTTP transport exists and would actually use that machinery.
- Do not reference skills from roles.
- Do not put a capability in more than one domain.
- Do not auto-promote status.

## Invariants the validator enforces

These are shape rules. Passing them does not mean the entity should exist.

- Schema + `additionalProperties: false` for every entity.
- Unique `id` within each type (capability id = filename stem).
- Capability → domain, capability → `agent_skills[].name`, role → capabilities must all resolve.
- Every skill is referenced by at least one capability.
- A capability lists at most 10 `agent_skills`.
- A role owns at most 2 capabilities and executes at most 7. Owned and executable lists are disjoint.
- L1-floor capabilities include `levels.L1`, `l1_guardrails`, and `l1_l2_boundary`, and omit `not_at_l1`. L2-floor capabilities include a one-sentence `not_at_l1` reason (never `TBD`, never blank), and omit `levels.L1`, `l1_guardrails`, and `l1_l2_boundary`.
- Execution scale is exactly L1, L2, L3, plus ownership designation `Owner`.
- Every capability sets `levels_mode`: `standard-ladder` (inherits the firm ladder) or `specific` (carries authored L1/L2/L3 copy). Default is `standard-ladder`.
- Risk shape → `fires[].capability` must resolve; no duplicate capability inside one shape; no `dial: dormant`; `reading_order` unique across shapes.
- Seam → `from` and `to` each resolve to exactly one domain **or** one capability, and must differ.
- Intensity dials are exactly `dormant`, `low`, `active`, `peak`, in that order.
- Definition → every `see_also` id resolves to another definition, and never to itself.
- Title → every `owns` ref resolves to one domain or one capability; a title may not own both a domain and a capability inside it; `reading_order` unique across titles.
- **Every capability is owned by exactly one title**, counting domain ownership. An unowned capability and a doubly-owned one are both errors. This is what makes "the five titles cover everything, and none is a grab-bag" a checked claim rather than a stated one — so adding a title means moving ownership, not appending.
- Doctrine → step names unique within a file, and every `steps[].capabilities` id resolves.
- Capability profiles → every certified `capability` resolves and is listed once per person.
- Every entity may set `visibility`: `public` (default), `internal`, or `confidential`. Readers filter by tier, never by caller. Leave it unset unless a human asked for a non-public entry. Containment cascades: hiding a domain hides every capability inside it.

## Field notes

- `source` is `sfia` | `adapted` | `original`.
- Skill `type` is `core_technique` | `transient_tool`. Some agent skills may later be listed as L1 guardrails; that is a capability fact, not a field on the skill.
- Capability `promise` is the named client outcome. `client_experience` is what they walk away with. `sparq_how` is internal methodology.
- Per-capability `levels` is how that capability is executed. `levels_mode: standard-ladder` means it inherits the firm ladder (defined once in `levels.yaml`); `levels_mode: specific` means the authored L1/L2/L3 copy is the real thing. `l1_l2_boundary` is required on L1-floor capabilities. `levels.yaml` remains the agency-wide legend. Still no L1–L3 on domains or skill files.
- `agent_skills[].name` is a skill file stem. Do not invent SKILL.md names. Map only skills that already exist in `skills/`.
- Role `owned_capabilities` are kebab ids (Owner accountability). `executable_capabilities` are `{ id, required_level }` with `required_level` L1–L3.

## Contribution path

Non-engineers should use GitHub Issue forms or natural language. Translate those into draft YAML only when the admission tests pass; do not ask them to hand-edit schemas.

## Levels block — render rule

The capability detail page renders a **Levels** block: three rows (L1 · L2 · L3) plus a mode badge.

- **Badge:** `standard ladder` or `capability-specific`, from `levels_mode`.
- **L1 row:**
  - L1-floor capability → the guardrail chips + the `L1→L2` boundary line.
  - L2-floor capability → a muted row reading **No L1** followed by the `not_at_l1` reason inline. Never blank, never "TBD".
- **L2 / L3 rows:**
  - `specific` → the authored L2/L3 text, full weight.
  - `standard-ladder` → one light, de-emphasised line per level showing the ladder meaning (L2 "executes solo, handles edge cases" · L3 "sets the standard others follow").
- **The standard ladder is defined once** (Overview, or a hover from any ladder row). Light ladder rows point to it; the ladder text is never duplicated per capability.
- **Visual weight is the point:** ladder rows are de-emphasised, specific/reason rows are full weight, so the page reads honest at a glance — a reader instantly sees what's genuinely defined here versus what inherits the firm standard.
- **Ban:** do not add hardcoded per-capability level prose to the build script. Level content comes from YAML only.
