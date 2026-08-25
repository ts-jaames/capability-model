# How it all relates — the one-page map

The convolution comes from treating six things as six lists. There's **one list**. Everything else points at it.

---

## The only real list (source of truth)

```
DOMAIN  ──contains──▸  CAPABILITY  ──executed at──▸  LEVEL (L1–L3)
```

This is the model. Domains and capabilities are fixed; capabilities carry levels. Nothing else below is its own list.

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

**The unlock:** a **seat is a capability-at-level with a person in it.** "Eval Harness Engineer" = someone executing *Validation & testing @ L2* on this engagement. That's why seats "pertain to a capability at a level" — that's literally their definition. Likewise: ownership = a capability + a person (permanent); title = a bundle of capabilities + a person (market-facing).

So seats and capabilities aren't two parallel lists to reconcile. A seat is the *runtime instance* of a capability-at-level. The seat vocabulary can churn (Context Engineer, Red Teamer) without touching the capability list underneath.

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
