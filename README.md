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

On merge to `main`, CI validates, rebuilds the site, and deploys it to GitHub Pages. Set the repository Pages source to **GitHub Actions** once.

## How to contribute

You do not need to edit YAML.

1. Open a GitHub Issue using one of the forms: **Propose a skill**, **Propose a capability**, or **Define a role**.
2. Or describe the change in natural language to Claude CoWork / Cursor. Point the assistant at `CLAUDE.md`. It will draft YAML at `status: draft`.
3. A human reviews the pull request. Only a human may set `status: reviewed` or `status: ratified`.
4. Capabilities omit `status` in YAML; tooling treats them as draft. L1-floor capabilities require `l1_guardrails`. L2-floor capabilities use `not_at_l1: TBD`.

## Layout

- `how-it-all-relates.md` — landing-page argument (published as `index.html`)
- `levels.yaml` — agency-wide L1 / L2 / L3 / Owner legend
- `dials.yaml` — agency-wide intensity legend (dormant / low / active / peak)
- `domains/*.yaml` — six closed domains
- `capabilities/<domain-slug>/<kebab-id>.yaml` — capabilities nested by domain
- `skills/*.yaml` — methods used inside capabilities (`agent_skills`)
- `risk-shapes/*.yaml` — the kinds of unknown that move the capability dials; the operating view is generated from these
- `reviews/<capability-id>.yaml` — capability-critic memory: last run, open FAILs, open FLAGs, ratification
- `roles/interface-lead.yaml` — staffing bound example (not rendered on the site yet)
- `deferred.yaml` — concepts we talk about publicly but deliberately do not model yet (title, seat)
- `debt-baseline.json` — the agreed size of every known hole; the build fails if one grows

## Known holes are counted, not hidden

`npm run validate` prints a **Debt** section after the errors: capabilities with no owner, level text copied from the legend, `not_at_l1` still reading `TBD`, capabilities no role can staff, risk shapes with unset dials, concepts published to readers but missing from the data.

None of it blocks a commit. All of it is ratcheted against `debt-baseline.json`, so the build fails if a count rises or a new kind of hole appears. Paid something down?

```bash
npm run validate -- --update-baseline
```

Commit the lower number. Raising one is a human decision that belongs in the PR description.
