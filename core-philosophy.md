# Core Philosophy

The site's landing page. Published as `index.html` by `npm run build`.

The page itself is rendered by `renderCorePhilosophyMain` in `scripts/build-site.mjs`, and its counts (domains, capabilities, risk shapes, seams, titles) are read from the YAML at build time. This file is the same argument in prose, for editing and discussion. If the two disagree, the renderer is what ships.

---

Most firms describe themselves with job titles. Titles drift, mean different things at different companies, and tell a client nothing about what they are buying. This model describes the firm by what it promises instead.

A capability is a named outcome a client would pay for as a result — not a task, not a tool, not a job title. There are 26 of them, grouped into 6 types of work. That list is the model. Everything else on the site points at it: how deeply a capability is run, how hard it is running on a given engagement, who keeps it fit, and what the client is charged for.

The reason to work this way is that the list outlasts the labels. Job names churn every couple of years; "prove it works before we build it" does not.

---

## The one list

```
DOMAIN  ──contains──▸  CAPABILITY  ──executed at──▸  LEVEL (L1–L4)
```

**Domains** are types of work. There are six and the set is closed: Commercial, Framing, Building, Proof, Enablement, Continuity. They never carry levels.

**Capabilities** are the promises inside a domain. Each one answers what we commit to and what the client walks away with.

**Levels** are how deeply a capability is executed. L1 to L3 are depth of judgment against the same promise — the client gets the same outcome with more or less supervision behind it. L4 is different in kind: owning the capability for the whole firm, keeping it fit, rather than executing it harder.

---

## What an engagement needs

The list says what the firm can do. It does not say what this engagement needs this week. That is the other half of the model.

A **risk shape** is a recurring kind of riskiest unknown. One of the eight asks "Are we solving the right thing?" A shape is not a phase: several are live at once, they recur, and each one turns a set of capabilities up or down.

How hard a capability is running is its **dial**: Dormant, Low, Active, Peak. Every capability sits somewhere on the dial at all times. Dormant means idle, not absent.

Two questions get confused and shouldn't:

| Question | Sets | Behaviour |
|---|---|---|
| How much rides on this? | the **level** | stops moving once the work is scoped |
| How sure are we? | the **dial** | keeps moving as the work proves things out |

---

## Where work changes hands

Delivery fails at handoffs more often than inside them. A **seam** names one load-bearing handoff: what has to cross between two capabilities or two domains, and in what form.

A seam is a floor, not a ceremony. It is not a meeting, a document template, or a phase gate. It says what must arrive for the next capability to start honestly, and how you would know it hadn't. There are five.

---

## How people attach

Title, ownership, and seat are **not three more lists** — they are three ways a person attaches to the same capabilities, and all three stay internal.

```
                        CAPABILITY (@ level)
                         ▲       ▲        ▲
           grouped under │       │ keeps  │ executes
                         │       │  fit   │
                       TITLE  OWNERSHIP  SEAT
```

| Binding | What it points at | Scope |
|---|---|---|
| **Title** | a *bundle* of capabilities one person is accountable for | internal · coarse · stable |
| **Ownership** | the *capability* you keep fit and write guardrails for (L4) | internal · permanent |
| **Seat** | *one capability at one level*, this engagement | internal · dynamic |

There are five titles, and between them they cover every capability exactly once. That is what stops a title becoming a grab-bag and a capability becoming an orphan.

How many seats is a separate question from how deep. **Level is set by what happens if the work is wrong; count is set by how much of the work there is.** A bigger project does not raise the level — it raises the count at the level the risk already fixed. L3×1, L1×5, and L2×3 are all coherent.

What one seat can hold is modelled rather than measured. Capacity is expected to fall as the level rises `[UNTESTED; to be calibrated from a real engagement]`, and whether the unit of work counts the same way outside engineering is `[UNTESTED]`. Both markers are read from `capacity-model.yaml`; the page never claims more confidence than the model records.

---

## What the client buys

```
SOW  ──sells──────────▸  OUTCOME
        priced from   ▸  CAPABILITIES @ LEVELS × COUNT
        never shows   ▸  SEATS · TITLES
```

- ✅ **Outcome** — what's sold and priced. "We'll build the integration hub."
- ✅ **Capabilities at levels, with counts** — the price justification, surfaced if the client asks how the number was reached. The demanded shape, not named bodies.
- ❌ **Seats and titles** — how we assemble the count. Internal. Never on the SOW.

The level carries the seniority a title used to imply, and carries it precisely. The client buys an outcome, the firm fulfils it with people in seats, and the shorthand between the two stays on our side of the table.

The layers are authored in `doctrine/commercial-stack.yaml` and rendered from it.

---

## How settled this is

The model is drafted, not proven. Every entry is at draft status, the numbers behind seat counts are placeholders no one has checked against real delivery, and the dial settings on the risk shapes are judgment calls rather than observations.

`confidence-map.yaml` records where each part sits, from thinking time through mapping against a current engagement to actual pilot use. Parts move right when real work holds them up, and back left when real work breaks them.
