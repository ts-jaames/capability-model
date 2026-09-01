# How it all relates — the one-page map

The site's snapshot landing page argument, kept here for editing.

> **Heads up:** `npm run build` does *not* read this file. The published `index.html` is
> generated from prose hardcoded in `scripts/build-site.mjs`. Editing this file alone changes
> nothing a reader sees. Change both, or move the prose into YAML the validator can check.

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

Title, ownership, and seat are **not three more taxonomies** — they're three verbs on the same capabilities. Same noun, three relationships:

```
                        CAPABILITY (@ level)
                         ▲       ▲        ▲
                sold as  │       │ keeps  │ executes
                         │       │  fit   │
                       TITLE  OWNERSHIP  SEAT
```

| Binding | Verb | What it points at | Scope |
|---|---|---|---|
| **Title** | sold as | a *bundle* of capabilities | external · coarse · stable |
| **Ownership** | keeps fit | the *capabilities* you author guardrails for | internal · permanent |
| **Seat** | executes | *one capability at one level*, this squad | internal · dynamic |

![Three verbs](assets/how-it-all-relates-illustrations/03-three-verbs.png)

**The unlock:** a **seat is a capability-at-level with a person in it.** That is a runtime instance, not a second list. We sell the capability at a level, not a headcount. One person can staff it, or several people together can make up that capability at the level needed, depending on resources.

"Eval Harness Engineer" = someone executing *Validation & testing @ L2* on this engagement. That's why seats "pertain to a capability at a level" — that's literally their definition. Likewise: ownership = a capability + a person (permanent); title = a bundle of capabilities + a person (market-facing).

So seats and capabilities aren't two parallel lists to reconcile. A seat is the *runtime instance* of a capability-at-level. The seat vocabulary can churn (Context Engineer, Red Teamer) without touching the capability list underneath.

![Seat is runtime](assets/how-it-all-relates-illustrations/04-seat-is-runtime.png)

---

## What the SOW references

```
SOW  ──guarantees──▸  CAPABILITIES @ LEVELS
        packaged as ▸  title-lines (optional)
        never shows  ▸  seats
```

- ✅ **Capabilities @ levels** — the contracted, outcome-priced deliverable (Framing L3, Interface L2, Signal design L2).
- ◐ **Title-lines** — optional commercial packaging on the rate card (1× Product Architect L3), because clients want a familiar unit to buy. Shorthand for the capabilities underneath.
- ❌ **Seats** — never on the SOW. Pure internal squad assembly.

**Rule of thumb:** client buys capabilities · firm fulfils with people in seats · title is the shorthand between them.

![SOW window](assets/how-it-all-relates-illustrations/05-sow-window.png)

---

## The whole thing in one read

```
              ┌──────────────── SOURCE OF TRUTH ────────────────┐
              │  DOMAIN ▸ CAPABILITY ▸ LEVEL                     │
              └──────────────────────┬──────────────────────────┘
                                     │  (everything points here)
        ┌────────────────────────────┼────────────────────────────┐
      TITLE                       OWNERSHIP                        SEAT
   bundle, sold              capabilities, kept fit        capability@level, staffed
   (external)                  (permanent)                    (dynamic)
        │                                                          │
        └───────── SOW buys CAPABILITIES@LEVELS ───────────────────┘
             (titles = packaging · seats = never shown)
```

Six words that were blurring together, three of them are just people-to-capability bindings, and the SOW only ever buys the capability spine. Nothing else is a list you have to maintain.
