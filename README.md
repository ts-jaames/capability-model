# Capability taxonomy

This repository is the operating-model source of truth. Domains, capabilities, skills, proficiency levels, and roles live as YAML. CI validates them. A read-only site is generated for executives.

Do not edit `site/`. It is build output.

## Run locally

Node 20 or newer.

```bash
npm install
npm run validate
npm run build          # writes site/index.html
npm run dev            # build + preview at http://localhost:4173
```

On merge to `main`, CI validates, rebuilds the site, and deploys it to GitHub Pages. Set the repository Pages source to **GitHub Actions** once.

## How to contribute

You do not need to edit YAML.

1. Open a GitHub Issue using one of the forms: **Propose a skill**, **Propose a capability**, or **Define a role**.
2. Or describe the change in natural language to Claude CoWork / Cursor. Point the assistant at `CLAUDE.md`. It will draft YAML at `status: draft`.
3. A human reviews the pull request. Only a human may set `status: reviewed` or `status: ratified`.
4. A capability cannot be `ratified` until `l1_guardrails` is non-empty.

## Worked example

The scaffold includes one end-to-end example plus two Framing stubs so the role can validate:

- `levels.yaml`
- `domains/*.yaml` — six domain shells
- `capabilities/product-interface-building.yaml` — full example
- `capabilities/problem-framing.yaml`, `capabilities/stakeholder-alignment.yaml` — stubs
- `skills/component-tokenization.yaml`, `state-architecture.yaml`, `ui-motion-tuning.yaml`
- `roles/interface-lead.yaml`

Further taxonomy content belongs in later passes, still as `draft` until signed off.
