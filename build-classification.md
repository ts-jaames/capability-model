# SparqOS — Build Classification & Promotion Rules (v0)

How to tell what a thing is before you build it, and when a thing is allowed to be called real. Companion to the tooling inventory. Definitional, meant to live next to the capability model.

---

## 1. Two axes, not one size ladder

The mistake is treating skill → tool → app as a size ramp. It isn't. There are two independent questions.

### Axis A — Nature (what kind of thing is it?)

| Kind | It… | Test |
|---|---|---|
| **Substrate / App** | holds state, is a source of truth, others depend on it | Does something break if it loses its memory? |
| **Skill** | encodes judgment, is stateless, does one job when invoked | Same inputs, same *shape* of output, no memory after it finishes? |
| **Tool** | exposes or watches something else; light or no state | Is its job to serve or check, rather than to own? |

### Axis B — Autonomy (how much does it act on its own?)

This is where **Agent** lives. An agent is not a bigger skill. An agent is:

> one or more **skills** + **tool access** + a **loop** + **guardrails** + a **leash length**

A skill invoked once by a human is low-autonomy. Wrap skills in a loop with tools and a defined leash and you have an agent. The autonomy is the thing that changes, not the size.

**An agent reads/writes substrates and calls skills. It sits between them, it doesn't replace either.**

---

## 2. The layering (where "IQ suite," "kit," and "playbook" fit)

These aren't the same kind of thing as skill/agent/app. They sit on a stack:

```
COMMERCIAL PACKAGE   ← what the client buys      (IQ suite: Blueprint.IQ, Ask.IQ…)   [volatile label]
        │  packages
CAPABILITY           ← the atomic unit, has a LEVEL                                   [stable]
        │  delivered via
PLAYBOOK             ← the how-to / delivery enablement                               [the missing piece]
        │  run/supported by
TOOLING              ← skills · agents · tools, each with guardrails + owner
        │  reads/writes
SUBSTRATE            ← evidence kit / Stacks / Nucleus / capability-model store       [stable, source of truth]
```

Key rules that fall out of this:

- **An IQ suite does not get its own level ladder.** Its maturity is a *view* over the levels of the capabilities it packages, plus whether a playbook, guardrails, and owner exist. Giving a suite its own levels couples a volatile commercial label to the stable layer — the same error the operating view avoids by referencing capabilities, not external-line names.
- **A "kit" is substrate.** The Evidence Operating Kit is app-v0 (a spreadsheet). A filled kit (e.g. Imagine) is an instance/record.
- **A playbook is not a tool.** It's the delivery enablement. Its absence is why a commercial label can exist with nothing runnable beneath it.

---

## 3. The four-question gate

The same four questions govern two different promotions. That overlap is the point: both ask whether a thing can operate without a person standing over it.

**For an agent — "is it safe to let run?"**
**For a commercial package (IQ suite) — "is it sellable as delivered?"**

1. **Can you run it with guardrails?** — does bounded operation exist at all?
2. **What are the guardrails?** — the leash, the tool permissions, the stop conditions.
3. **Can you execute it on your own?** — autonomy level: human-in-the-loop each step / human-on-the-loop reviewing / fully auto.
4. **Who owns it?** — accountability when it runs or when it ships.

Until all four are answered, the thing is **Concept-state**: a direction, a pitch, a prototype. It may be named and positioned. It may not be sold or run as though it's Commitment-state. Deliverables referencing it must reflect that confidence level, not simulate certainty.

**Blueprint.IQ today:** a label with no answers to 2, 3, or 4. Concept-state sold as Commitment-state. That's polished fiction at the product-line layer.

---

## 4. Ownership tag

Every build carries one of two tags:

- **Sponsored** — has an owner and a team; a standing project. (Substrate builds, kit→substrate, IQ playbooks, Nucleus.)
- **One-off** — one person can clear it. (Intake skills, polish/confidence check, tripwire monitor.)

The tag is orthogonal to type. A skill can be sponsored; an app-v0 can be a one-off. It's about who's accountable and whether it needs a team, not about size.

---

## 5. Applied reads

| Thing | Nature | Autonomy | Layer | Owner | State |
|---|---|---|---|---|---|
| Blueprint.IQ | — | — | Commercial package | **unassigned** | Concept (sold as Commitment) |
| Evidence Operating Kit | Substrate (spreadsheet = app-v0) | n/a | Substrate | tbd | Validation (real, in use, not yet a system) |
| "Evidence agent" (imagined) | Skills + loop | Agent (human signs off confidence) | Tooling | tbd | Concept |
| Risk→Assumption / Slice Qualifier / Signal Definer | Skill | Human-invoked | Tooling | one-off | buildable now |
| Confidence-tiered artifact generation *(name un-adopted)* | Skill family | Human-invoked | Tooling | tbd | Concept |
| Capability Model MCP Server | Tool (exposes stable layer) | n/a | Tooling | **James (one-off)** | claimed |

---

## 6. Naming guardrail

Naming a thing that doesn't exist defines it for everyone. Until a name is adopted deliberately, refer to the *function*, not the label. Concepts people liked are not constructed things. Premature naming is a commitment act disguised as a description — the same class of error as premature building.
