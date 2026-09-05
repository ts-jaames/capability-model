---
name: engagement-change-runner
description: Re-runs an engagement against the operating model after a scope shift lands mid-delivery. Use when a change event arrives and someone has to say what it does to risk, staffing, price, and the next slice. Reads the model through the capability-model MCP server, proposes, and leaves every decision to owners.
---

# engagement-change-runner

A big change just landed mid-delivery. This skill says what it does to the shape of the work.

It **proposes**. Owners decide. It never silently re-scopes, re-prices, or proceeds across a product-vision change.

## The rule that makes this work

**Do not carry the model in this file.** Every claim about what a capability promises, what a level means, what a dial means, what must cross a seam, or what a term means comes from a tool call against the `capability-model` MCP server.

If the server is unavailable, say so and stop. Do not reconstruct the model from memory — a remembered model is a stale model, and a stale model asserted confidently is the exact failure this whole system exists to prevent.

Every claim in the output cites the id it came from (`shape-ai-reliability`, `pricing-under-uncertainty`, `seam-building-proof`).

## Inputs

1. **Engagement state** — what is in flight, who is staffed on what, what has been priced and promised.
2. **The change event** — what actually changed, in the client's words.

If either is missing, ask for it. Do not infer an engagement state.

## The pass

### 1. Re-read the risk mix

Call `list_risk_shapes`, then `capabilities_for_risk_shape` for each shape you believe is now live.

Name which shapes the change **turns up**, which it **turns down**, and which it **introduces**. A shape that was never live and still isn't is not worth listing.

Dial values come back with `dials_reviewed`. Where it is `false`, carry the caveat into the output: the *set* of capabilities a shape fires is firmer than the *dial* on each one. Do not launder a draft dial into a staffing number without saying it was a draft.

### 2. Test the product-vision line

Call `get_capability` for `direction-qualification`.

Ask whether the change alters what the product is *for*, not just what it costs. If it does, the go / redirect / stop call is **re-opened** and everything below is provisional until an owner closes it. Say that first, not last.

### 3. Re-staff

For each capability whose dial moved, call `get_capability` and read `levels`.

- `level_floor: L1` means it can be run at L1 against the guardrails the record lists. Name them.
- `level_floor: L2` means it cannot, and the record says why. Quote the reason rather than paraphrasing it.
- `levels.L2.source` and `levels.L3.source` tell you whether the level copy is authored for that capability or inherited from the firm ladder. Do not present inherited ladder text as a capability-specific standard.

Staff capabilities at levels, never headcount. Call `get_levels` if you need the ladder itself.

### 4. Re-price

Call `get_capability` for `commercial-scoping-envelope-shaping`, `confidence-based-estimation`, and `pricing-under-uncertainty`.

Tier the re-estimate by what the evidence currently supports: tight where a signal has been captured, buffered where the direction is set but unproven, an explicit spike window where nothing has been tested. Say which tier each line is in.

### 5. Check the seams

Call `list_seams`. For each handoff the change disturbs, state what must now cross and what would count as a violation. A change that moves work across a seam without changing what crosses it is a smaller change than it looks.

### 6. Name the next slice

One slice, testing one assumption, with the signal defined before it is built.

## Before asserting a word

Call `get_definition` before using **capability**, **level**, **seat**, **title**, **intensity dial**, **risk shape**, or **seam** in a way that carries weight. These are the terms that get conflated, and the definitions exist to say what each one is not.

## Output

```
CHANGE          one paragraph, the client's change in your words
VISION LINE     crossed / not crossed — and what that re-opens
RISK MIX        shapes up, down, introduced — each with its id
DIALS           capability @ dial, per shape, flagged where unreviewed
STAFFING        capability @ level, with the floor and its reason
PRICE           per line: tight / buffered / spike window
SEAMS           handoffs disturbed, and what must cross
NEXT SLICE      one assumption, one signal, time-boxed
OPEN CALLS      what an owner has to decide before any of this is real
```

`OPEN CALLS` is never empty. If it is, you have quietly made a decision that was not yours.
