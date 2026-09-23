/**
 * Grade model answers for the Franklin Pool benchmark.
 *
 * Usage: node grade.mjs cases.jsonl answers.jsonl
 * answers.jsonl lines: {"id": "...", "output": "<raw model text>"}
 * A case passes only on an exact match for every worker (missing = wrong).
 */
import { readFileSync } from "node:fs";

const [casesPath, answersPath] = process.argv.slice(2);
if (!casesPath || !answersPath) {
  console.error("usage: node grade.mjs cases.jsonl answers.jsonl");
  process.exit(2);
}
const readJsonl = (p) => readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const cases = new Map(readJsonl(casesPath).map((c) => [c.id, c]));

function parseOutput(text) {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}


const byCat = new Map();
const failures = [];
for (const { id, output } of readJsonl(answersPath)) {
  const c = cases.get(id);
  if (!c) continue;
  const t = byCat.get(c.category) ?? { n: 0, pass: 0, tieN: 0, tiePass: 0, badJson: 0, wrongSum: 0 };
  byCat.set(c.category, t);
  t.n += 1;
  if (c.tie_decides) t.tieN += 1;
  const got = parseOutput(String(output));
  if (!got) { t.badJson += 1; failures.push(`${id}: unparseable`); continue; }
  const want = c.answer;
  const wrong = Object.keys(want).filter((e) => got[e] !== want[e]);
  const pool = Object.values(want).reduce((a, b) => a + b, 0);
  const gotSum = Object.keys(want).reduce((a, e) => a + (typeof got[e] === "number" ? got[e] : 0), 0);
  if (gotSum !== pool) t.wrongSum += 1;
  if (wrong.length === 0) { t.pass += 1; if (c.tie_decides) t.tiePass += 1; continue; }
  failures.push(`${id}: ${wrong.map((e) => `${e} want ${want[e]} got ${JSON.stringify(got[e])}`).join("; ")}`);
}

let n = 0, pass = 0;
console.log("category            pass/n    tie-decided pass/n   sum≠pool  bad json");
for (const [cat, t] of [...byCat].sort()) {
  n += t.n; pass += t.pass;
  console.log(`${cat.padEnd(18)} ${`${t.pass}/${t.n}`.padStart(7)}   ${`${t.tiePass}/${t.tieN}`.padStart(12)}        ${String(t.wrongSum).padStart(4)}  ${String(t.badJson).padStart(8)}`);
}
console.log(`\nTOTAL ${pass}/${n} (${n ? ((100 * pass) / n).toFixed(1) : "0"}%)`);
if (failures.length) console.log(`\nfirst failures:\n  ${failures.slice(0, 15).join("\n  ")}`);
