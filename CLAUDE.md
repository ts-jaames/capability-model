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

**The standard ladder is the default definition.** L1 executes against guardrails · L2 executes solo and handles edge cases · L3 builds the guardrails and sets the standard others follow. For most capabilities that ladder *is* what the level means, and repeating it is correct. Those capabilities carry `levels_mode: standard-ladder`, which is a recorded decision, not a hole.

Author capability-specific level text (`levels_mode: specific`) only when one of these is true:

1. **Sold at level** — it appears on a live SOW and its levels are priced differently, so "L2" versus "L3" has to mean something specific or the price has nothing behind it.
2. **Risky to delegate** — the L1→L2 boundary is subtle enough that a non-specialist could get it wrong, and the consequence lands on the client rather than on rework.

A capability marked `specific` whose levels still read as the ladder is tracked as `level-undefined-but-should-be-specific` debt, and only its owner should write that text. A capability marked `standard-ladder` that carries capability-specific text is a validation error — fix the flag, not the text.

**Per-domain level definitions are out of scope, deliberately.** Levels vary by capability or default to the ladder. A domain-level definition would be either the ladder restated or a false average across capabilities that differ. Do not add one.

### Title

A market or HR label (Design Strategist, AI Engineer, Context Engineer, Forward Deployed Engineer, AI Evals Engineer). **Not in this model yet, deliberately** — see `deferred.yaml`, which also records that the generated site already shows three title lines whose capability bundles are hardcoded prose in `scripts/build-site.mjs` and are validated by nothing. Do not add titles as capabilities. Do not add titles as roles. If someone wants titles modelled, that is a decision to close the deferral, not a file to add quietly.

### Staffing bound (`roles/`)

Which capabilities a seat **owns** (max 2, Owner accountability) vs can **execute** (max 7, L1–L3). Not a title. `Interface Lead` is an example of a bound — owns Product & interface building, executes Problem framing and Stakeholder alignment — not a job name. The executive site does not render roles until titles and bounds are designed on purpose.

A role may only require a level the capability actually offers. Asking for `required_level: L1` on a capability whose floor is L2 is a validation error, not a staffing preference.

### Risk shape (`risk-shapes/`)

A kind of unknown an engagement can be carrying, phrased as a question ("Can it be built within the hard limits?"). A risk shape is the **input** to the capability dials: it names the capabilities it pushes and, once authored, how hard (`intensity`: dormant / low / active / peak, defined in `dials.yaml`).

A risk shape is not a capability, not a phase, and not a risk register entry for one client. It is agency-wide. `pushes[].capability` must resolve to a real capability id.

### Review (`reviews/`)

The memory of the `capability-critic` loop: one file per capability, named for the capability id. It records the last critic run, the count of open mechanical FAILs, and the judgment FLAGs only the capability owner may close.

This is the only thing that can promote a capability. Do not write `status: reviewed` or `status: ratified` on a capability without the matching review record — the validator will reject it.

### Deferral (`deferred.yaml`)

A concept the model talks about publicly but does not represent as data yet. Recording one is how a known hole stops being an accidental contradiction. A deferral must say why it is deferred, what would unblock it, and whether readers are already being told about it.

## Do

- Read this file, `levels.yaml`, and existing YAML before adding files.
- Filename stem must equal `id` (kebab-case). Capabilities omit `id`; the stem **is** the id.
- Capability files live at `capabilities/<domain-slug>/<kebab-id>.yaml`. `domain` in YAML is the display name (`Building`, not `building`).
- Set `status: draft` on skills, domains, roles, and risk shapes. Capabilities may omit `status`; missing means `draft`. Never write `reviewed` or `ratified` unless a human explicitly asked to promote that file **and** a matching `reviews/<id>.yaml` supports it.
- Give every new capability an `owner`, a `source`, and a `last_updated`. These are optional in schema only so the existing files stay valid; leaving them off adds tracked debt.
- Name a method you do not have as `agent_skills: [{ name, what, status: gap }]` rather than leaving the list empty or inventing a skill file. A `gap` entry must **not** have a file in `skills/`; `live` and `building` must.
- Keep YAML readable for non-engineers. Prefer short sentences and lists.
- Run `npm run validate` after edits. Fix every error before finishing, and do not let the debt count rise.

## Do not

- Do not invent entities that fail the admission tests.
- Do not edit `site/`. It is generated by `npm run build`.
- Do not add dependencies beyond `yaml` and `ajv`.
- Do not reference skills from roles.
- Do not put a capability in more than one domain.
- Do not auto-promote status.
- Do not raise a debt count to make a change fit. Fix the hole, or get a human decision and re-baseline.
- Do not hardcode model content into `scripts/build-site.mjs`. Anything the site tells a reader must come from YAML the validator can check.
- Do not edit one copy of `capability-critic` without the other. `.claude/` and `.cursor/` must stay byte-identical.

## Invariants the validator enforces

These are shape rules. Passing them does not mean the entity should exist.

- Schema + `additionalProperties: false` for every entity.
- Unique `id` within each type (capability id = filename stem).
- Capability → domain, capability → `agent_skills[].name`, role → capabilities, risk shape → capabilities must all resolve.
- Every skill is referenced by at least one capability.
- A capability lists at most 10 `agent_skills`.
- A role owns at most 2 capabilities and executes at most 7. Owned and executable lists are disjoint.
- A role cannot require `L1` on a capability with no L1 floor.
- L1-floor capabilities include `levels.L1`, `l1_guardrails`, and `l1_l2_boundary`, and omit `not_at_l1`. L2-floor capabilities include `not_at_l1`, and omit `levels.L1`, `l1_guardrails`, and `l1_l2_boundary`.
- Execution scale is exactly L1, L2, L3, plus ownership designation `Owner`. The intensity dial is exactly dormant, low, active, peak.
- `levels_mode: standard-ladder` must not carry capability-specific level text.
- `status: reviewed` requires a review record with zero open FAILs. `status: ratified` also requires every FLAG closed, plus `ratified_by` and `ratified_on`.
- A closed FLAG must name who closed it and when.
- An `agent_skills` entry marked `gap` must not have a file in `skills/`.
- The two `capability-critic` copies are byte-identical.

## The debt register

`npm run validate` prints a **Debt** section and compares it to `debt-baseline.json`. Debt is a real hole that is not a broken file: a capability with no owner, a capability sold at level whose levels still read as the ladder, a `not_at_l1` still reading `TBD`, a capability no role can staff, a risk shape whose dial nobody has set, a concept published to readers but absent from the data.

Debt never blocks on its own. It is **ratcheted**: the build fails if any count grows or a new code appears. That is what stops a placeholder from becoming permanent.

- Paid something down? `npm run validate -- --update-baseline` and commit the lower number.
- Genuinely need a count to rise? That is a human decision, stated in the PR, then re-baselined. Never re-baseline silently to make a red build green.

## Field notes

- `source` is `sfia` | `adapted` | `original`.
- Skill `type` is `core_technique` | `transient_tool`. Some agent skills may later be listed as L1 guardrails; that is a capability fact, not a field on the skill.
- Capability `promise` is the named client outcome. `client_experience` is what they walk away with. `sparq_how` is internal methodology.
- Per-capability `levels` is how *that* capability is executed, and `levels_mode` says whether the agency ladder is the definition (`standard-ladder`, the default) or whether this capability needs its own (`specific`). See the Level admission test for which is which. `l1_l2_boundary` is required on L1-floor capabilities and carries the delegation line regardless of `levels_mode`. `levels.yaml` remains the agency-wide legend. Still no L1–L3 on domains or skill files.
- `not_at_l1` is the **reason** a capability has no L1 floor. `TBD` is accepted so existing files stay valid, and counted as debt until someone writes the reason.
- `agent_skills[].name` is a skill file stem for `live` and `building`, and a name-only placeholder for `gap`. Do not invent SKILL.md names for anything not marked `gap`.
- Role `owned_capabilities` are kebab ids (Owner accountability). `executable_capabilities` are `{ id, required_level }` with `required_level` L1–L3, and the level must exist on that capability.
- Risk shape `pushes[].intensity` is the dial weighting `engagement-change-runner` reads. Omitted means unauthored, and is counted as debt — the skill must not guess it.

## Contribution path

Non-engineers should use GitHub Issue forms or natural language. Translate those into draft YAML only when the admission tests pass; do not ask them to hand-edit schemas.
