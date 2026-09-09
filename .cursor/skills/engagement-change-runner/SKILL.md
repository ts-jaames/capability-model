---
name: engagement-change-runner
description: Re-runs an engagement against the operating model after a scope shift lands mid-delivery. Use when a change event arrives and someone has to say what it does to risk, staffing, price, and the next slice. Reads the model through the capability-model MCP server, proposes, and leaves every decision to owners.
---

# engagement-change-runner

A big change just landed mid-delivery. This skill says what it does to the shape of the work.

It **proposes**. Owners decide. It never silently re-scopes, re-prices, or proceeds across a product-vision change.

## The rule that makes this work

**Do not carry the model in this file.** Every claim about what a capability promises, what a level means, what a dial means, what must cross a seam, or what a term means comes from a tool call against the `capability-model` MCP server.

That rule now covers the procedure itself. The six moves below live in `doctrine/change-response.yaml` and are read with `get_doctrine`. What this file adds is operating notes — which tools to reach for at each move, and what to watch for. Where the two ever disagree, the doctrine is right and this file is stale.

If the server is unavailable, say so and stop. Do not reconstruct the model from memory — a remembered model is a stale model, and a stale model asserted confidently is the exact failure this whole system exists to prevent.

Every claim in the output cites the id it came from (`shape-ai-reliability`, `pricing-under-uncertainty`, `seam-building-proof`).

## Inputs

1. **Engagement state** — what is in flight, who is staffed on what, what has been priced and promised.
2. **The change event** — what actually changed, in the client's words.

If either is missing, ask for it. Do not infer an engagement state.

## The pass

Open with `get_doctrine` for `change-response`. It returns the six moves in order, each with the capabilities it invokes and the thing it must never do. Work them in that order — the order is load-bearing, and the pass ends on the next slice because that is the point of running it.

### 1 · Re-read the risk

`list_risk_shapes`, then `capabilities_for_risk_shape` for each shape you believe is now live.

Name which shapes the change **turns up**, which it **turns down**, and which it **introduces**. A shape that was never live and still isn't is not worth listing.

### 2 · Re-set the dials

`get_intensity` for what each step means.

Two questions, and they answer to different scales: how much rides on it is the **level**, and it does not move; how sure we are is the **intensity**, and it does. The dial labels the capability — never the risk, never the product item.

Watch the two transitions that get missed: `dormant` to `active`, a capability surfacing that nobody is staffed for, and `peak` to `low`, work in flight that may now be throwaway.

Dial values come back with `dials_reviewed`. Where it is `false`, carry the caveat: the *set* of capabilities a shape fires is firmer than the *dial* on each one. Do not launder a draft dial into a staffing number without saying it was a draft.

### 3 · Test the decision gate

`get_capability` for `direction-qualification`.

Ask whether the change alters what the product is *for*, not just what it costs. If it does, the go / redirect / stop call is **re-opened** and everything below is provisional until an owner closes it. Say that first, not last.

### 4 · Re-staff

For each capability whose dial moved, `get_capability` and read `levels`.

- `level_floor: L1` means it can be run at L1 against the guardrails the record lists. Name them.
- `level_floor: L2` means it cannot, and the record says why. Quote the reason rather than paraphrasing it.
- `levels.L2.source` and `levels.L3.source` tell you whether the level copy is authored for that capability or inherited from the firm ladder. Do not present inherited ladder text as a capability-specific standard.

Staff capabilities at levels, never headcount. `get_levels` for the ladder itself. Where the needed level is not on the bench, name the gap as a delivery risk instead of staffing under it.

### 5 · Re-price and re-time

`get_capability` for `commercial-scoping-envelope-shaping`, `confidence-based-estimation`, and `pricing-under-uncertainty`.

One question in two currencies. Tier the re-estimate by what the evidence supports: tight where a signal has been captured, buffered where the direction is set but unproven, an explicit spike window where nothing has been tested. Say which tier each line is in.

Then the timeline consequence, which is derived and not negotiated — the date holds and scope flexes, the date moves by the validation spike, or the date holds and confidence drops. Name which one. The third is never the default and never silent.

### 6 · Name the next slice

`get_capability` for `slice-building` and `signal-design`.

One slice, testing one assumption, with the signal defined before it is built.

## Before asserting a word

Call `get_definition` before using **capability**, **level**, **seat**, **title**, **intensity dial**, **risk shape**, or **seam** in a way that carries weight. These are the terms that get conflated, and the definitions exist to say what each one is not.

Titles in particular: they are internal groupings of owned capabilities. Never put one in a price or a client-facing line.

## Output

```
CHANGE          one paragraph, the client's change in your words
VISION LINE     crossed / not crossed — and what that re-opens
RISK MIX        shapes up, down, introduced — each with its id
DIALS           capability @ dial, per shape, flagged where unreviewed
STAFFING        capability @ level, with the floor and its reason
PRICE & TIME    per line: tight / buffered / spike window, then the date consequence
SEAMS           handoffs disturbed, and what must cross
NEXT SLICE      one assumption, one signal, time-boxed
OPEN CALLS      what an owner has to decide before any of this is real
```

`SEAMS` is an output requirement rather than a move. Call `list_seams` while working the passes above and fill it as you go: a change that moves work across a seam without changing what crosses it is a smaller change than it looks, and that is worth saying wherever you notice it.

`OPEN CALLS` is never empty. If it is, you have quietly made a decision that was not yours.
