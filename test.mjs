/**
 * Self-checks: grader parsing, answer key vs cases.jsonl, and how solvers with
 * a wrong tie-break score on the committed set.
 *
 * Usage: node test.mjs [cases.jsonl]
 */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { allocate } from "./allocate.mjs";
import { parseOutput } from "./parse.mjs";
import { WRONG_TIE_BREAKS } from "./tiebreaks.mjs";

// ---- parser ----------------------------------------------------------------
const ans = { "a@x.com": 120, "b@x.com": 0 };
const parses = [
  ['{"a@x.com": 120, "b@x.com": 0}', ans],
  ['pool = {sum of subtotals} / 5 → 600. Shares: {a: 120}.\n{"a@x.com": 120, "b@x.com": 0}', ans],
  ['```json\n{"a@x.com": 120, "b@x.com": 0}\n```\nCheck: {120 + 0 = 120} ✓', ans],
  ['draft {"a@x.com": 119, "b@x.com": 1}\nfinal {"a@x.com": 120, "b@x.com": 0}', ans],
  ['{"answer": {"a@x.com": 120, "b@x.com": 0}}', ans],
  ['{"note": "use } carefully", "a@x.com": 1}', null],
  ['{"a@x.com": "120"}', null],
  ["no json here", null],
  ["{unclosed", null],
];
for (const [text, want] of parses) assert.deepEqual(parseOutput(text), want, text);

// ---- answer key and wrong tie-breaks ---------------------------------------
const cases = readFileSync(process.argv[2] ?? "cases.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const key = (o) => JSON.stringify(o);
for (const c of cases) assert.equal(key(allocate(c.input).out), key(c.answer), `${c.id}: answer key disagrees`);

const ties = cases.filter((c) => c.tie_decides);
console.log(`parser: ${parses.length} ok; answer key: ${cases.length} ok`);
console.log(`wrong tie-break      total   tie-decided`);
for (const [name, cmp] of Object.entries(WRONG_TIE_BREAKS)) {
  const pass = (c) => key(allocate(c.input, cmp).out) === key(c.answer);
  const total = cases.filter(pass).length, tie = ties.filter(pass).length;
  console.log(`${name.padEnd(18)} ${`${total}/${cases.length}`.padStart(7)}   ${`${tie}/${ties.length}`.padStart(11)}`);
  assert.equal(tie, 0, `${name} passes ${tie} tie-decided cases`);
}
