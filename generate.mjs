/**
 * Franklin Pool payout-math benchmark generator.
 *
 * Answer key = allocate.mjs (SPEC.md, implemented in BigInt). If you have a
 * checkout of the production payroll engine, set BREWHUB_REPO to it and every
 * case is also cross-checked against the production allocateFranklinPool;
 * any disagreement aborts the run.
 *
 * Usage: node generate.mjs [--seed N] [--per-category N] [--out cases.jsonl]
 */
import { writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { allocate, minutesOf } from "./allocate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- args ------------------------------------------------------------------
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};
const SEED = Number(arg("seed", "20260923"));
const PER = Number(arg("per-category", "20"));
const OUT = arg("out", join(__dirname, "cases.jsonl"));

// ---- seeded PRNG (mulberry32) ---------------------------------------------
let state = SEED >>> 0;
function rand() {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = (xs) => xs[int(0, xs.length - 1)];
function shuffle(xs) {
  for (let i = xs.length - 1; i > 0; i -= 1) {
    const j = int(0, i);
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

// ---- building blocks -------------------------------------------------------
const NAMES = ["ana", "ben", "cy", "dee", "eli", "fay", "gus", "hana", "ivo", "jo", "kai", "lu", "mo", "nia", "oz", "pia"];
function emails(n) {
  const set = new Set();
  while (set.size < n) set.add(`${pick(NAMES)}${rand() < 0.4 ? int(1, 99) : ""}@brewhubphl.com`);
  return [...set];
}
// Pairs whose character order disagrees with locale collation / intuition.
const TRAPS = [
  ["a_b@brewhubphl.com", "a-b@brewhubphl.com"],     // '-' 0x2D < '_' 0x5F
  ["b1@brewhubphl.com", "b10@brewhubphl.com"],      // '0' 0x30 < '@' 0x40
  ["sam@brewhubphl.com", "sam.k@brewhubphl.com"],   // '.' 0x2E < '@' 0x40
  ["zoe@brewhubphl.com", "z0e@brewhubphl.com"],     // '0' 0x30 < 'o' 0x6F
  ["jo+pos@brewhubphl.com", "jo@brewhubphl.com"],   // '+' 0x2B < '@' 0x40
  ["mo2@brewhubphl.com", "mo11@brewhubphl.com"],    // '1' < '2' (not numeric order)
];

function worker(email, total, split = false) {
  if (!split) return { email, regular: total, overtime: 0, sunday_regular: 0, sunday_overtime: 0 };
  const a = int(0, total), b = int(0, total - a), c = int(0, total - a - b);
  return { email, regular: a, overtime: b, sunday_regular: c, sunday_overtime: total - a - b - c };
}
// Subtotal that funds exactly `pool` cents: floor(s * 2000 / 10000) = floor(s / 5).
const online = (pool) => ({ source: "online", subtotal_cents: pool * 5 + int(0, 4) });

// ---- categories ------------------------------------------------------------
const CATEGORIES = {
  even_split() {
    const n = int(2, 6), m = int(60, 2400);
    return { workers: emails(n).map((e) => worker(e, m)), orders: [online(n * int(100, 5000))] };
  },
  simple_remainder() {
    return { workers: emails(int(2, 5)).map((e) => worker(e, int(30, 3000))), orders: [online(int(101, 99_999))] };
  },
  exact_ties() {
    // Equal minutes for everyone; pool chosen so leftover is 1..n-1 → tie-break decides.
    const n = int(3, 7), m = int(60, 900);
    const pool = n * int(10, 2000) + int(1, n - 1);
    return { workers: emails(n).map((e) => worker(e, m)), orders: [online(pool)] };
  },
  email_order_traps() {
    const [x, y] = pick(TRAPS);
    const m = int(60, 900);
    const extra = emails(int(0, 2)).map((e) => worker(e, m * 2)); // even multiples → same remainder class
    return { workers: shuffle([worker(x, m), worker(y, m), ...extra]), orders: [online(int(3, 999) * 2 + 1)] };
  },
  zero_hours() {
    const ws = emails(int(3, 6)).map((e) => worker(e, int(30, 2400)));
    ws.push(worker(`idle${int(1, 9)}@brewhubphl.com`, 0));
    return { workers: shuffle(ws), orders: [online(int(100, 50_000))] };
  },
  dominant_worker() {
    const small = emails(int(2, 6)).map((e) => worker(e, int(10, 120)));
    const rest = small.reduce((s, w) => s + minutesOf(w), 0);
    const big = worker("boss@brewhubphl.com", rest * 9); // exactly 90% of team minutes
    return { workers: shuffle([big, ...small]), orders: [online(int(101, 20_000))] };
  },
  tiny_pool() {
    // Pool smaller than headcount: most workers floor to 0 and live on leftover cents.
    const n = int(4, 9);
    return { workers: emails(n).map((e) => worker(e, int(60, 600))), orders: [online(int(1, n - 1))] };
  },
  many_workers() {
    return { workers: emails(int(12, 16)).map((e) => worker(e, int(15, 4800), true)), orders: [online(int(10_000, 400_000))] };
  },
  funding_filter() {
    const orders = shuffle([
      { source: "online", subtotal_cents: int(500, 50_000) },
      { source: " Agent_API ", subtotal_cents: int(100, 20_000) },
      { source: "ONLINE", subtotal_cents: int(100, 20_000) },
      { source: "pos", subtotal_cents: int(1000, 90_000) },
      { source: "square_terminal", subtotal_cents: int(1000, 90_000) },
      { source: null, subtotal_cents: int(1000, 90_000) },
      { source: "online", subtotal_cents: -int(100, 5000) }, // refunds-as-negatives floor to 0
    ]);
    return { workers: emails(int(2, 5)).map((e) => worker(e, int(60, 2400))), orders };
  },
  bucket_split() {
    return { workers: emails(int(3, 6)).map((e) => worker(e, int(60, 3000), true)), orders: [online(int(1000, 80_000))] };
  },
  empty_pool() {
    const ws = emails(int(2, 4)).map((e) => worker(e, int(60, 600)));
    const orders = pick([
      [{ source: "pos", subtotal_cents: 50_000 }],
      [{ source: "online", subtotal_cents: 4 }], // floor(4 / 5) = 0
      [],
    ]);
    return { workers: ws, orders };
  },
};

// ---- optional cross-check against production ------------------------------
async function loadProduction() {
  const repo = process.env.BREWHUB_REPO;
  if (!repo) return null;
  const { createJiti } = createRequire(join(repo, "package.json"))("jiti");
  const mod = await createJiti(import.meta.url).import(join(repo, "src/lib/payroll-engine/franklin-pool.ts"));
  return mod.allocateFranklinPool;
}
const allocateFranklinPool = await loadProduction();

function production(c) {
  const rows = c.workers.map((w) => ({
    employee_email: w.email, employee_name: null, base_rate_cents: 0,
    regular_minutes: w.regular, overtime_minutes: w.overtime,
    sunday_regular_minutes: w.sunday_regular, sunday_overtime_minutes: w.sunday_overtime,
    regular_rate_minute_cents: 0, overtime_rate_minute_cents: 0,
    sunday_regular_rate_minute_cents: 0, sunday_overtime_rate_minute_cents: 0,
    rate_varied: false, warnings: [],
  }));
  const map = allocateFranklinPool(rows, c.orders);
  return Object.fromEntries(c.workers.map((w) => [w.email, map.get(w.email) ?? 0]));
}

// ---- prompt ----------------------------------------------------------------
const SPEC = readFileSync(join(__dirname, "SPEC.md"), "utf8").split("<!-- rules -->")[1].trim();
function prompt(c) {
  const wl = c.workers
    .map((w) => `| ${w.email} | ${w.regular} | ${w.overtime} | ${w.sunday_regular} | ${w.sunday_overtime} |`)
    .join("\n");
  const ol = c.orders.length
    ? c.orders.map((o) => `| ${o.source === null ? "(null)" : JSON.stringify(o.source)} | ${o.subtotal_cents} |`).join("\n")
    : "| (no orders) | |";
  return `${SPEC}

## Workers (minutes)
| email | regular | overtime | sunday_regular | sunday_overtime |
|---|---|---|---|---|
${wl}

## Orders
| source | subtotal_cents |
|---|---|
${ol}

Reply with only a JSON object mapping every worker email above to their integer cents, e.g. {"a@x.com": 120, "b@x.com": 0}.`;
}

// ---- run -------------------------------------------------------------------
const lines = [];
const counts = {};
for (const [category, make] of Object.entries(CATEGORIES)) {
  counts[category] = { cases: 0, ties: 0 };
  for (let i = 0; i < PER; i += 1) {
    const c = { id: `${category}-${String(i).padStart(3, "0")}`, category, ...make() };
    const { out: answer, tieDecides } = allocate(c);
    if (allocateFranklinPool) {
      const prod = production(c);
      if (JSON.stringify(prod) !== JSON.stringify(answer)) {
        console.error(`MISMATCH ${c.id}\n production ${JSON.stringify(prod)}\n answer key ${JSON.stringify(answer)}`);
        process.exit(1);
      }
    }
    counts[category].cases += 1;
    if (tieDecides) counts[category].ties += 1;
    lines.push(JSON.stringify({ id: c.id, category, seed: SEED, prompt: prompt(c), answer, tie_decides: tieDecides, input: { workers: c.workers, orders: c.orders } }));
  }
}
writeFileSync(OUT, lines.join("\n") + "\n");
console.log(`seed ${SEED}: ${lines.length} cases → ${OUT} ${allocateFranklinPool ? "(production == answer key on all)" : "(set BREWHUB_REPO to cross-check production)"}`);
for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(18)} ${v.cases} cases, ${v.ties} where the tie-break decides a cent`);
