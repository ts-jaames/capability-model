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
4. Capabilities omit `status` in YAML; tooling treats them as draft. L1-floor capabilities require `l1_guardrails`. L2-floor capabilities use `not_at_l1: TBD`.

## Layout

- `levels.yaml` — agency-wide L1 / L2 / L3 / Owner legend
- `domains/*.yaml` — six closed domains
- `capabilities/<domain-slug>/<kebab-id>.yaml` — capabilities nested by domain
- `skills/*.yaml` — methods used inside capabilities (`agent_skills`)
- `roles/interface-lead.yaml` — staffing bound example (not rendered on the site yet)
