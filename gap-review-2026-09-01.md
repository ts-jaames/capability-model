# Gap review — 1 September 2026

A pass over the model looking for missing definition, non-definition, operating gaps, and
loopholes. Below: what was found, what was closed and why, and what is now tracked rather
than closed.

The rule followed throughout: **fix the machinery, surface the judgment.** Anything that was
objectively broken got fixed. Anything that needs an owner's decision got made impossible to
ignore instead of being quietly filled in with plausible-sounding content.

---

## The core problem

The model had strong bones and no immune system. Schema kept files *valid*; nothing kept them
*meaningful*. A placeholder was as acceptable as an answer, forever, and the published site
asserted things the source of truth could not back.

Three failure modes ran through everything:

1. **Placeholders that never expire.** `not_at_l1: TBD` was pinned as a schema constant, so
   "we haven't decided" was permanently valid. 22 of 26 capabilities had L1/L2/L3 text
   copy-pasted from the agency legend — level was a field that said nothing, while the SOW
   claims to sell capability-at-level.
2. **Assertions with nothing behind them.** A capability could claim any status. A role could
   staff a level the capability doesn't offer. The site's Operating View and Roles pages were
   hardcoded prose in the build script, checked by nothing.
3. **Loops with no memory.** `capability-critic` defines `critic-passed`, `locked`, and a FLAG
   list with nowhere to store any of them. Every review restarted from zero.

---

## Loopholes closed (hard failures now)

### 1. A capability could never be ratified — and could claim anything

`schema/capability.json` had `additionalProperties: false` and no `status` property, so
`status: ratified` was rejected outright, while `validate.mjs` carried an unreachable
`statusOf(cap) === "ratified"` guard. The governance ladder was broken for the entity that
matters most, and nobody would have noticed until they tried to use it.

**Closed by** adding `status`, `owner`, `source`, and `last_updated` to the capability schema,
and making promotion evidence-backed: `reviewed` requires a review record with zero open
mechanical FAILs; `ratified` additionally requires every judgment FLAG closed by a named person
on a named date. Self-asserted promotion is now a validation error.

**Why it matters:** status is the only signal that separates "someone drafted this" from "the
firm stands behind this." An unusable ladder means every capability is permanently draft in
practice — while looking authoritative on the site.

### 2. A role could staff a level that does not exist

`executable_capabilities` checked that the capability existed and that `required_level` was one
of L1–L3. It never checked the two against each other, so a role could require L1 on a
capability whose floor is L2 — nine capabilities are in that state.

**Closed by** a fatal check that a required level is a level the capability actually offers.

**Why it matters:** this is the loophole that reaches a client. The whole commercial argument is
that a SOW buys capability-at-level; staffing a floor that does not exist sells judgment nobody
has agreed can be delegated.

### 3. Honest gaps were unrecordable, so the model looked complete

`agent_skills[].status` offered `live | building | gap`, but referential integrity required every
named skill to resolve to a file. A gap has no file — so `gap` was unusable, and the only way to
record a missing method was to leave the list empty. 25 of 26 capabilities had `agent_skills: []`,
which reads as "no methods needed" rather than "nobody has assessed this."

**Closed by** letting a `gap` entry name a method with no file (and failing if something marked
`gap` actually has one, which would be dishonest the other way). Empty lists are now counted as
debt.

**Why it matters:** the critic skill's own fabrication test demands methods be marked honestly.
The schema made honesty impossible.

### 4. The operating model existed only as hardcoded HTML

`engagement-change-runner` — the skill that makes this an operable model rather than a deck —
reads "the operating-view YAML (risk shapes · dial weightings)." That file did not exist. The
eight risk shapes and the four-step intensity dial lived as string literals inside
`scripts/build-site.mjs`, referencing capabilities by prose name, validated by nothing.

**Closed by** promoting them into the source of truth: `risk-shapes/*.yaml` (8 shapes, each
resolving its pushed capabilities by id) and `dials.yaml` (the intensity legend, alongside
`levels.yaml`). The Operating View page is now generated from that YAML instead of from prose.

**Why it matters:** two things at once. The skill now has real data to read instead of inventing
dials, and the site can no longer drift from the model — if a capability is renamed, the risk
shape referencing it fails the build instead of quietly going stale on a published page.

### 5. The two capability-critic copies could diverge silently

`.claude/skills/capability-critic/SKILL.md` and `.cursor/skills/capability-critic/SKILL.md` are
duplicates with nothing keeping them in sync — so Claude and Cursor could enforce different
standards on the same model without anyone noticing.

**Closed by** a fatal byte-identity check between the two copies.

---

## The debt register — what is now counted rather than hidden

Everything above is objectively broken and now fails the build. The rest are real holes that
need a person's judgment. Filling them in with invented content would be worse than leaving
them open, so they are **counted and ratcheted** instead.

`npm run validate` prints a Debt section and compares it to `debt-baseline.json`. Debt never
blocks a commit on its own, but the build fails if any count grows or a new kind of hole
appears. That is the mechanism that stops a placeholder from becoming permanent.

| Code | Count | What it means |
|---|---|---|
| `generic-level-copy` | 66 | Level text repeats the agency legend, so the level says nothing specific |
| `dial-weighting-missing` | 32 | A risk shape pushes a capability without saying how hard |
| `capability-owner-missing` | 26 | No person is accountable for the capability staying fit |
| `capability-freshness-missing` | 26 | No `last_updated`, so staleness is invisible |
| `no-review-record` | 26 | The capability has never been through the critic loop |
| `unowned-capability` | 25 | No role owns it |
| `no-method-recorded` | 25 | No method claimed and no gap named |
| `unstaffed-capability` | 24 | No role can execute it |
| `placeholder-l2-floor` | 9 | `not_at_l1` still reads TBD; the missing L1 floor has no stated reason |
| `published-but-unmodelled` | 2 | Readers are told about a concept the source of truth cannot answer |

**261 items.** The number looks alarming and should. It was always true; it just wasn't visible.

Two entries deserve calling out:

- **`unowned` 25 of 26 and `unstaffed` 24 of 26.** One role file exists. On paper the firm can
  sell twenty-six outcomes and can demonstrably staff two of them. This is the gap with the
  shortest path to a client problem.
- **`generic-level-copy` 66.** Level is load-bearing in the commercial argument and currently
  carries no information on 22 capabilities. "Framing L3" and "Interface L2" are priced
  differently and defined identically.

### Paying it down

```bash
npm run validate                        # see the Debt section
# ... author the content ...
npm run validate -- --update-baseline   # lock in the lower number, commit it
```

The validator tells you when a count has dropped and prompts you to re-baseline. Raising a
count is a human decision that belongs in the PR description, never a silent re-baseline to
turn a red build green.

---

## Deferrals — the site/model contradiction

`CLAUDE.md` says titles are "not in this model yet." The generated site publishes three named
title lines (Product Architect, AI Architect, Forward Deployed Engineer) whose owned and
executed capabilities are hardcoded English in the build script, and tells readers the seat
catalog "lives in the operating view," where no seat catalog exists.

Rather than mint entity types nobody has designed, this is now recorded in `deferred.yaml`:
what the concept is, why it is deferred, what would unblock it, and — critically — that readers
are *already being told about it*. Published-but-unmodelled is tracked debt, not an accepted
state.

**Why record instead of build:** a title is a commercial packaging decision. Minting the entity
first would freeze a rate-card shape by accident. But leaving the contradiction undocumented
means the next person reads `CLAUDE.md`, reads the site, and cannot tell which one is lying.

---

## A related find

`how-it-all-relates.md` describes itself as "the same argument, for editing" — but `npm run build`
never reads it. The published `index.html` is generated from separate prose hardcoded in the
build script. Editing the markdown changes nothing a reader sees. A warning now sits at the top
of that file, and `CLAUDE.md` bans adding new hardcoded model content to the generator.

Moving that prose into YAML is the obvious next cleanup, and is not done here.

---

## Recommended order of work

1. **Assign owners** (26). Everything else needs someone to decide it. Cheapest, unblocks the rest.
2. **Write the nine L2-floor reasons.** Each is one sentence: what judgment can't a guardrail carry?
3. **Define more roles**, or accept in writing that 24 capabilities are currently unstaffable.
4. **Author level copy**, highest-value capabilities first. Anything on a live SOW leads.
5. **Set the dial weightings** (32), which makes `engagement-change-runner` fully operable.
6. **Run `capability-critic`** and record the results, which starts the promotion ladder moving.
7. **Decide the title bundles**, or leave the deferral open on purpose — but stop publishing
   three title lines the model cannot back.

---

## Files added

- `dials.yaml`, `risk-shapes/*.yaml` (8) — the operating view, promoted out of the build script
- `deferred.yaml` — title and seat, recorded as deliberate deferrals
- `debt-baseline.json` — the agreed size of every known hole
- `reviews/README.md` — how critic memory works
- `schema/{dials,risk-shape,review,deferrals}.json`
- `.github/ISSUE_TEMPLATE/propose-risk-shape.yml`

## Files changed

- `schema/capability.json` — status, owner, source, last_updated; `not_at_l1` accepts a real reason
- `schema/common.json` — intensity scale
- `scripts/validate.mjs` — new fatal checks, debt register, ratchet
- `scripts/build-site.mjs` — Operating View generated from YAML
- `CLAUDE.md`, `README.md`, `how-it-all-relates.md`, `propose-capability.yml`

Every new check was verified by deliberately introducing the violation and confirming the build
fails, then confirming the clean tree still passes and the site still builds.
