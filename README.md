# Capability taxonomy

This repository is the operating-model source of truth. Domains, capabilities, skills, proficiency levels, and roles live as YAML. CI validates them. A read-only site is generated for executives.

Do not edit `site/`. It is build output.

## Run locally

Node 20 or newer.

```bash
npm install
npm run validate
npm run build          # writes site/ (landing is index.html, plus drawings)
npm run dev            # build + preview at http://127.0.0.1:4173
```

Open **http://127.0.0.1:4173** (IPv4). `site/` is gitignored, so there is nothing to open until you run `build` or `dev`.

If the page never loads, an old process is probably still bound to 4173:

```bash
lsof -ti :4173 | xargs kill
npm run dev
```

On merge to `main`, CI validates, runs the MCP smoke test, rebuilds the site, and deploys it to GitHub Pages. Set the repository Pages source to **GitHub Actions** once.

## MCP server

The site is for people. The MCP server is the same model for agents, so a skill or assistant can consult it mid-work instead of guessing or carrying a stale copy.

```bash
npm run mcp          # speaks JSON-RPC over stdio
npm run mcp:smoke    # boots it as a client would and checks the tool contract
```

Point a client at it:

```json
{
  "mcpServers": {
    "capability-model": {
      "command": "npx",
      "args": ["-y", "github:ts-jaames/capability-model"]
    }
  }
}
```

Thirteen tools, all read-only: `list_domains`, `list_capabilities`, `get_capability`, `get_levels`, `get_intensity`, `list_risk_shapes`, `get_risk_shape`, `capabilities_for_risk_shape`, `list_seams`, `get_seam`, `list_definitions`, `get_definition`, `search`. The headline query is `capabilities_for_risk_shape` — which capabilities does this risk shape fire, and at what dial. Nothing writes; humans still change the model through pull requests.

`mcp/core.mjs` holds the queries and knows nothing about transports or callers; `mcp/stdio.mjs` is the local transport. It speaks JSON-RPC directly rather than depending on the MCP SDK, which pulls 91 packages including two HTTP frameworks and an OAuth stack that a local process reading YAML cannot use. A hosted transport would live beside `stdio.mjs` and import the same core — that is when the SDK earns its place.

Set `CAPABILITY_MODEL_SCOPE` (default `public`) to widen the visibility tiers the server will return.

## How to contribute

You do not need to edit YAML.

1. Open a GitHub Issue using one of the forms: **Propose a skill**, **Propose a capability**, or **Define a role**.
2. Or describe the change in natural language to Claude CoWork / Cursor. Point the assistant at `CLAUDE.md`. It will draft YAML at `status: draft`.
3. A human reviews the pull request. Only a human may set `status: reviewed` or `status: ratified`.
4. Capabilities omit `status` in YAML; tooling treats them as draft. L1-floor capabilities require `l1_guardrails`. L2-floor capabilities carry a one-sentence `not_at_l1` reason. Every capability sets `levels_mode` (`standard-ladder` or `specific`).

## Layout

- `how-it-all-relates.md` — landing-page argument (published as `index.html`)
- `levels.yaml` — agency-wide L1 / L2 / L3 / Owner legend
- `intensity.yaml` — agency-wide Dormant / Low / Active / Peak dial legend
- `domains/*.yaml` — six closed domains
- `capabilities/<domain-slug>/<kebab-id>.yaml` — capabilities nested by domain
- `skills/*.yaml` — methods used inside capabilities (`agent_skills`)
- `risk-shapes/*.yaml` — recurring riskiest unknowns, and the capabilities each fires at a dial
- `seams/*.yaml` — load-bearing handoffs between capabilities or domains
- `definitions/*.yaml` — canonical terms and the confusions each one rules out (not rendered on the site)
- `roles/interface-lead.yaml` — staffing bound example (not rendered on the site yet)
- `schema/*.json` — the shape rules CI enforces
- `scripts/model.mjs` — the single loader the validator, the site build, and the MCP server share

## Overlays

`scripts/model.mjs` reads a list of roots, not one directory. Set `CAPABILITY_MODEL_OVERLAY` to a colon-separated list of directories laid out like this repo, and a later root extends or overrides an earlier one by id:

```bash
CAPABILITY_MODEL_OVERLAY=/path/to/private npm run validate
```

Nothing uses this yet. It exists so entries that cannot be published can later layer on top of this public base without either side knowing about the other. Two files claiming the same id inside one root is still an error; the same id in a later root is a deliberate override.

Every entity may carry `visibility: public | internal | confidential`, defaulting to `public`. Readers filter by tier, never by who is asking. `npm run build` renders the public tier only, so an overlay of non-public entries can be loaded without anything reaching `site/` — including references: a risk shape drops fires it may not show, and a seam disappears if either end is out of scope.
