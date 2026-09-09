// Visibility scoping is the one place a mistake leaks something that was meant
// to be hidden, and the leak would be silent: the site still builds, the server
// still answers. The public model carries no non-public entries to test
// against, so these exercise scopeView directly against a synthetic model.
import assert from "node:assert/strict";
import { test } from "node:test";
import { PUBLIC_SCOPE, scopeView } from "../scripts/model.mjs";

function view({ domainVisibility, capVisibility } = {}) {
  return {
    levels: null,
    intensity: null,
    domains: [
      { id: "building", name: "Building" },
      { id: "enablement", name: "Enablement", visibility: domainVisibility },
    ],
    capabilities: [
      { id: "slice-building", name: "Slice building", domain: "building" },
      {
        id: "capability-transfer",
        name: "Capability transfer",
        domain: "enablement",
        visibility: capVisibility,
        agent_skills: [{ name: "open-skill" }, { name: "secret-skill" }],
      },
    ],
    skills: [
      { id: "open-skill", name: "Open" },
      { id: "secret-skill", name: "Secret", visibility: "confidential" },
    ],
    roles: [
      {
        id: "interface-lead",
        owned_capabilities: ["capability-transfer"],
        executable_capabilities: [{ id: "slice-building", required_level: "L2" }],
      },
    ],
    riskShapes: [
      {
        id: "shape-adoption",
        fires: [{ capability: "slice-building" }, { capability: "capability-transfer" }],
      },
    ],
    seams: [
      {
        id: "seam-building-enablement",
        from: { domain: "building" },
        to: { domain: "enablement" },
      },
    ],
    definitions: [
      { id: "seat", see_also: ["level"] },
      { id: "level", visibility: "internal" },
    ],
    titles: [
      {
        id: "forward-deployed-engineer",
        name: "Forward Deployed Engineer",
        owns: [{ capability: "slice-building" }, { domain: "enablement" }],
      },
    ],
    doctrine: [
      {
        id: "change-response",
        name: "When the work changes",
        steps: [
          { name: "Re-read the risk", description: "..." },
          {
            name: "Name the next slice",
            description: "...",
            capabilities: ["slice-building", "capability-transfer"],
          },
        ],
      },
    ],
    profiles: {
      id: "capability-profiles",
      visibility: "internal",
      people: [
        {
          person: "TODO",
          certifications: [
            { capability: "slice-building", certified_level: "L3" },
            { capability: "capability-transfer", certified_level: "L2" },
          ],
        },
      ],
    },
  };
}

const ids = (items) => items.map((item) => item.id);

test("a confidential domain takes its capabilities with it", () => {
  const scoped = scopeView(view({ domainVisibility: "confidential" }), PUBLIC_SCOPE);
  assert.deepEqual(ids(scoped.domains), ["building"]);
  assert.deepEqual(ids(scoped.capabilities), ["slice-building"]);
});

test("a hidden capability disappears from the shapes that fire it", () => {
  const scoped = scopeView(view({ domainVisibility: "confidential" }), PUBLIC_SCOPE);
  assert.deepEqual(
    scoped.riskShapes[0].fires.map((item) => item.capability),
    ["slice-building"],
  );
});

test("a seam drops when either end is out of scope", () => {
  const scoped = scopeView(view({ domainVisibility: "confidential" }), PUBLIC_SCOPE);
  assert.deepEqual(ids(scoped.seams), []);
});

test("a role cannot name a capability the caller may not see", () => {
  const scoped = scopeView(view({ domainVisibility: "confidential" }), PUBLIC_SCOPE);
  assert.deepEqual(scoped.roles[0].owned_capabilities, []);
  assert.deepEqual(
    scoped.roles[0].executable_capabilities.map((item) => item.id),
    ["slice-building"],
  );
});

test("hiding one capability leaves its domain in place", () => {
  const scoped = scopeView(view({ capVisibility: "confidential" }), PUBLIC_SCOPE);
  assert.deepEqual(ids(scoped.domains), ["building", "enablement"]);
  assert.deepEqual(ids(scoped.capabilities), ["slice-building"]);
});

test("agent skills and see_also drop references the caller may not follow", () => {
  const scoped = scopeView(view(), PUBLIC_SCOPE);
  const cap = scoped.capabilities.find((item) => item.id === "capability-transfer");
  assert.deepEqual(
    cap.agent_skills.map((item) => item.name),
    ["open-skill"],
  );
  assert.deepEqual(scoped.definitions.find((item) => item.id === "seat").see_also, []);
});

test("widening the scope brings the hidden entries back", () => {
  const scoped = scopeView(view({ domainVisibility: "confidential" }), [
    "public",
    "internal",
    "confidential",
  ]);
  assert.deepEqual(ids(scoped.domains), ["building", "enablement"]);
  assert.deepEqual(ids(scoped.capabilities), ["slice-building", "capability-transfer"]);
  assert.deepEqual(ids(scoped.seams), ["seam-building-enablement"]);
  assert.deepEqual(scoped.roles[0].owned_capabilities, ["capability-transfer"]);
});

test("the default scope is public only", () => {
  const scoped = scopeView(view({ domainVisibility: "internal" }));
  assert.deepEqual(ids(scoped.domains), ["building"]);
});

test("a title stops owning what the caller cannot see", () => {
  const scoped = scopeView(view({ domainVisibility: "confidential" }), PUBLIC_SCOPE);
  assert.deepEqual(scoped.titles[0].owns, [{ capability: "slice-building" }]);
});

test("a doctrine step stops citing capabilities the caller cannot see", () => {
  const scoped = scopeView(view({ domainVisibility: "confidential" }), PUBLIC_SCOPE);
  assert.deepEqual(scoped.doctrine[0].steps[1].capabilities, ["slice-building"]);
});

// capability-profiles is the one file that will hold person data, so its
// absence at public scope is the check that matters most here.
test("an internal legend is absent at public scope and present when widened", () => {
  assert.equal(scopeView(view(), PUBLIC_SCOPE).profiles, null);
  const wide = scopeView(view(), ["public", "internal"]);
  assert.equal(wide.profiles.id, "capability-profiles");
  assert.deepEqual(
    wide.profiles.people[0].certifications.map((item) => item.capability),
    ["slice-building", "capability-transfer"],
  );
});

test("a visible profile still drops certifications for hidden capabilities", () => {
  const wide = scopeView(view({ domainVisibility: "confidential" }), [
    "public",
    "internal",
  ]);
  assert.deepEqual(
    wide.profiles.people[0].certifications.map((item) => item.capability),
    ["slice-building"],
  );
});
