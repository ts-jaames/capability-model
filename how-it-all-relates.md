# How it all relates — the one-page map

The site's snapshot landing page. Published as `index.html` by `npm run build`. This file is the same argument, for editing.

Domains, capabilities, levels, roles, titles, seats. That looks like six lists. It is one list. Everything else is a way of pointing at it.

The convolution comes from treating those six words as six things to keep. Domains and capabilities are the list. Levels are how a capability is executed. Roles, titles, and seats are people pointing at it — not parallel inventories.

![One list](assets/how-it-all-relates-illustrations/01-one-list.png)

---

## The only real list (source of truth)

```
DOMAIN  ──contains──▸  CAPABILITY  ──executed at──▸  LEVEL (L1–L3)
```

This is the model. A capability is the named outcome we promise. It can be delivered at L1, L2, or L3 — same promise, different depth of judgment. The capability is the whole piece; the level is which piece you slot in to assemble it. Domains and capabilities are fixed; capabilities carry levels. Nothing else below is its own list.

![The spine](assets/how-it-all-relates-illustrations/02-the-spine.png)

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

**The unlock:** a **seat is a capability-at-level with a person in it.** That is a runtime instance, not a second list. We sell the capability at a level, not a headcount. One person can staff it, or several people together can make up that capability at the level needed, depending on resources.

"Eval Harness Engineer" = someone executing *Validation & testing @ L2* on this engagement. That's why seats "pertain to a capability at a level" — that's literally their definition. Likewise: ownership = a capability + a person (permanent); title = a bundle of owned capabilities (internal coverage).

So seats and capabilities aren't two parallel lists to reconcile. A seat is the *runtime instance* of a capability-at-level. The seat vocabulary can churn (Context Engineer, Red Teamer) without touching the capability list underneath.

![Seat is runtime](assets/how-it-all-relates-illustrations/04-seat-is-runtime.png)

---

## What the SOW shows

Three layers, one of them hidden.

```
SOW  ──sells──────────▸  OUTCOME
        priced from   ▸  CAPABILITIES @ LEVELS
        never shows   ▸  SEATS · TITLES
```

- ✅ **Outcome** — what's sold, and priced. "We'll build the integration hub."
- ✅ **Capabilities @ levels** — the price justification, surfaced if the client asks how the number was reached (Framing L3, Interface L2, Signal design L2).
- ❌ **Seats** — how we assemble it. Internal. Never on the SOW.
- ❌ **Titles** — internal coverage groupings. Never on the SOW and never on the rate card.

The title never appears here. The level carries the seniority a title used to imply — and carries it precisely.

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
  bundle, grouped            capabilities, kept fit        capability@level, staffed
   (internal)                  (permanent)                    (dynamic)
        │                                                          │
        └───────── SOW sells an OUTCOME, priced from ──────────────┘
                        CAPABILITIES@LEVELS
             (titles and seats = never shown)
```

Six words that were blurring together, three of them are just people-to-capability bindings, and the SOW only ever sells an outcome priced from the capability spine. Nothing else is a list you have to maintain.
