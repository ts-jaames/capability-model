# How it all relates — the one-page map

The site's snapshot landing page. Published as `index.html` by `npm run build`. This file is the same argument, for editing.

Domains, capabilities, levels, roles, titles, seats. That looks like six lists. It is one list. Everything else is a way of pointing at it.

The convolution comes from treating those six words as six things to keep. Domains and capabilities are the list. Levels are how a capability is executed. Roles, titles, and seats are people pointing at it — not parallel inventories.

The count we now attach to a seat is not a seventh list. It's a quantity on one entry, not a new inventory to keep.

![One list](assets/how-it-all-relates-illustrations/01-one-list.png)

---

## The only real list (source of truth)

```
DOMAIN  ──contains──▸  CAPABILITY  ──executed at──▸  LEVEL (L1–L3)
```

This is the model. A capability is the named outcome we promise. It can be delivered at L1, L2, or L3 — same promise, different depth of judgment. The capability is the whole piece; the level is which piece you slot in to assemble it. Domains and capabilities are fixed; capabilities carry levels. Nothing else below is its own list.

![The spine](assets/how-it-all-relates-illustrations/02-the-spine.png)

---

## Two questions, not one

A seat is set by two questions that do different jobs. **How much rides on this** sets the level. **How much of it there is** sets the count. Neither answers the other.

Level is depth of judgment, fixed by collapse risk. Count is volume, fixed by how much of the work there is. A bigger project does not raise the level — it raises the count at whatever level the risk already fixed. This is the answer to whether scale changes the level: it doesn't. Scale is a count question; level is a risk question. They're orthogonal.

L3×1, L1×5, and L2×3 are all coherent seats — one deep expert on the thing that can't fail, many hands on routine surface, or moderate stakes with more of it than one seat can carry.

---

## Surface area

Count comes from surface area — how much of a capability-at-level the work demands, divided by how much one seat can hold.

Surface area is the number of independently attention-demanding units at a capability×level — units that can't share one operator's attention without one of them degrading. It's a concurrency measure, set by the timeline: two things on separate critical paths are two units; the same work done serially is fewer.

What one seat holds depends on the level and on who's in it. Nominal capacity falls as the level rises — higher stakes tax attention per unit [UNTESTED; to be calibrated from a real engagement]. And an overqualified operator covers more, up to a hard ceiling, because the work is easy for them.

One flag stays open: surface area counts cleanly in engineering (services, streams), but whether the same unit survives in the judgment-heavy domains — Framing, Proof, Commercial, Enablement, Continuity — is [UNTESTED]. Named and unresolved, not assumed closed.

The markers above are read from `capacity-model.yaml`, which records the confidence for each claim. The page never states more confidence than the model does.

---

## Three ways a person binds to a capability

Title, ownership, and seat are **not three more taxonomies** — they're three verbs on the same capabilities. Same noun, three relationships, all three internal:

```
                        CAPABILITY (@ level)
                         ▲       ▲        ▲
           grouped under │       │ keeps  │ executes
                         │       │  fit   │
                       TITLE  OWNERSHIP  SEAT
```

| Binding | Verb | What it points at | Scope |
|---|---|---|---|
| **Title** | grouped under | a *bundle* of owned capabilities | internal · coarse · stable |
| **Ownership** | keeps fit | the *capabilities* you author guardrails for | internal · permanent |
| **Seat** | executes | *one capability at one level*, this squad | internal · dynamic |

**The unlock:** a **seat is a capability at a level, with a count, filled by a person or people, on this engagement.** That's a runtime instance — and the count isn't a new list, it's how many times we instantiate one entry.

The count is confidence-gated, same as everything else. Before the work can prove the load, the count is assumed — a demanded ceiling estimated at intake, the least-validated moment we have, when we don't yet know what we don't know. As surface area validates during the work, a committed floor emerges. We stand behind the floor and watch the ceiling; a surface-area update re-derives the count mid-engagement.

"Eval Harness Engineer" = someone executing *Validation & testing @ L2* on this engagement. That's why seats "pertain to a capability at a level" — that's literally their definition. Likewise: ownership = a capability + a person (permanent); title = a bundle of owned capabilities (internal coverage).

One person can hold the seat, or several people who each clear the bar can make up the count together. So seats and capabilities aren't two parallel lists to reconcile. Seat names churn (Context Engineer, Red Teamer). The capability underneath does not.

![Seat is runtime](assets/how-it-all-relates-illustrations/04-seat-is-runtime.png)

---

## What the SOW shows

Three layers, one of them hidden.

```
SOW  ──sells──────────▸  OUTCOME
        priced from   ▸  CAPABILITIES @ LEVELS × COUNT
        never shows   ▸  SEATS · TITLES
```

- ✅ **Outcome** — what's sold and priced. "We'll build the integration hub."
- ✅ **Capabilities at levels, with counts** — the price justification, surfaced if the client asks how the number was reached ("core systems engineering at L2, ×3"). The count lives here because load drives price. But it's the demanded shape, a capability at a level with a quantity, not named bodies.
- ❌ **Seats** — how we assemble the count: three L2s, or one L3 absorbing it. Internal. Never on the SOW.

The title never appears here. The level carries the seniority a title used to imply — and carries it precisely.

"Capabilities at levels, with counts" is the same person-agnostic shape we can put in front of a client; the moment it resolves to named people, it drops below the line.

**Rule of thumb:** the client buys an outcome · the firm fulfils it with people in seats · the shorthand between the two stays on our side of the table.

---

## The whole thing in one read

```
              ┌──────────────── SOURCE OF TRUTH ────────────────┐
              │  DOMAIN ▸ CAPABILITY ▸ LEVEL                     │
              └──────────────────────┬──────────────────────────┘
                                     │  (everything points here)
        ┌────────────────────────────┼────────────────────────────┐
      TITLE                       OWNERSHIP                        SEAT
  bundle, grouped            capabilities, kept fit     capability@level×count, staffed
   (internal)                  (permanent)                    (dynamic)
        │                                                          │
        └───────── SOW sells an OUTCOME, priced from ──────────────┘
                     CAPABILITIES@LEVELS × COUNT
             (titles and seats = never shown)
```

Six words that were blurring together, three of them are just people-to-capability bindings, and the SOW only ever sells an outcome priced from the capability spine. Nothing else is a list you have to maintain.
