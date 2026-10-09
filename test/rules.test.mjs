// Sizing & staffing rules are parts of the confidence map. Their group column
// and their glossary back-references are derived, so they are tested here.
import assert from "node:assert/strict";
import { test } from "node:test";
import { leastTestedColumn, rulesOf, rulesUsing } from "../scripts/model.mjs";

const map = {
  rows: [
    {
      id: "rules",
      name: "Rules",
      items: [
        { id: "a", name: "A", kind: "measure", position: "mapping", glossary_terms: ["level"] },
        { id: "b", name: "B", kind: "check", position: "thinking", glossary_terms: ["level", "seat"] },
      ],
    },
    { id: "other", name: "Other", position: "pilot" },
  ],
};

test("a group sits in its least tested column", () => {
  assert.equal(leastTestedColumn(map.rows[0].items), "thinking");
});

test("only parts with a kind are rules", () => {
  assert.deepEqual(rulesOf(map).map((rule) => rule.id), ["a", "b"]);
});

test("a definition lists the rules that cite it", () => {
  assert.deepEqual(rulesUsing(map, "level").map((rule) => rule.id), ["a", "b"]);
  assert.deepEqual(rulesUsing(map, "seat").map((rule) => rule.id), ["b"]);
  assert.deepEqual(rulesUsing(map, "skill"), []);
});
