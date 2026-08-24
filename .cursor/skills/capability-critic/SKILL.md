---
name: capability-critic
description: Pressure-tests a Sparq capability entry against the fixed test battery. Use when reviewing, ratifying, or revising any capability definition. Returns per-test PASS / FAIL / FLAG with fixes, and never marks an entry locked.
---

# capability-critic

Run against ONE capability entry at a time. For each test return **PASS**, **FAIL**, or **FLAG**.

- **FAIL** = mechanical. You fix it inline and re-run.
- **FLAG** = human judgment. You cannot close it. It goes to the ratification list for the capability owner.

This split is the point: FAILs are objective (signal), FLAGs are judgment (the owner decides). The critic converges the objective layer and surfaces — never resolves — the judgment layer.

## Tests

1. **Plain voice** — Promise uses no jargon. Banned: telemetry, empirical, leverage, seamless, robust, holistic, unlock, cutting-edge, "-driven", "systematically". Promise is ≤2 sentences, plain, narrative. `FAIL → rewrite plain.`
2. **Altitude** — Promise names value in non-technical terms and contains no tool names. Sparq How names mechanism: ≥1 tool, ≥1 literal task, the artifact produced. `FAIL → move mechanism out of Promise / add tool+task to How.`
3. **Swap test** — Promise and Experience stay true if a different person delivers or tells them. `FAIL → strip room-specific phrasing.`
4. **Kill test (guardrails)** — For each L1 guardrail: if removed, could a non-specialist still not execute L1? If removing it changes nothing, it's dead. `FAIL → cut the dead guardrail.`
5. **Floor honesty** — Is the described L1 actual delivery of the capability, or prep for a senior call? If prep, the floor is L2. `FLAG (owner ratifies floor).`
6. **Field integrity** — L1 floor MUST carry L1 guardrails + L1→L2 boundary. L2 floor MUST NOT carry any L1 field. `FAIL → add or remove fields to match floor.`
7. **Sparq How discipline** — Names tool + task + artifact, and does NOT pin the durable surface (surface is variable). `FAIL → tighten / de-pin surface.`
8. **Fabrication** — Every tool and agent skill named is real, or marked `status: gap` / "None assessed". No invented statuses. `FAIL → mark honestly.`
9. **Three-floor test** — Capability has a client promise, a client-facing how, and an internal how. If there is no client-facing belief, it belongs in the Seam layer, not a client domain. `FLAG.`
10. **Overlap** — Could this capability be removed because siblings already cover it (swap test between capabilities)? `FLAG (owner ratifies merge/keep).`

## Output

Per entry, one line per test: `<n>. <test> — PASS | FAIL | FLAG — <one-line reason>`. Then apply every FAIL fix inline and re-run the battery until zero FAILs remain. Compile all FLAGs into the ratification list. Do not attempt to resolve FLAGs.

## Done definition

- Entry `critic-passed` = zero open FAILs.
- Model `ready-to-ratify` = all entries critic-passed AND the FLAG list compiled.
- Entry `locked` = the owner has closed every FLAG for that entry.

The critic never marks anything `locked`. Only the capability owner does. Any edit to a locked entry reverts it to `critic-passed` and re-runs the battery.

## The loop this skill runs inside

1. **Author** — Cursor / Claude Code writes or edits the entry to the schema.
2. **Critic** — run this skill against the entry; fix FAILs; re-run to zero (1–3 passes, because the tests are objective).
3. **Flag** — collect FLAGs; do not fix them.
4. **Ratify** — owner reviews the complete view + FLAG list, makes the calls, marks entries `locked`.
5. **Decay** — any edit reverts `locked` → `critic-passed` and re-runs step 2.

Start by running this manually in Claude Code. Add scheduled/agentic orchestration only if the manual loop proves too slow — not before.
