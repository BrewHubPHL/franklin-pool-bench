/**
 * The answer key: Franklin Pool allocation implemented from SPEC.md alone,
 * in BigInt so no intermediate product can lose precision.
 *
 * Returns every worker's cents (0 for excluded workers) plus `tieDecides`:
 * true when an email tie-break, not the remainders, decides who gets a cent.
 */
const FUNDING_SOURCES = new Set(["online", "agent_api"]);

export const minutesOf = (w) =>
  Math.max(0, w.regular + w.overtime + w.sunday_regular + w.sunday_overtime);

/** Plain character order (UTF-16 code units), never locale collation. */
export const compareCharOrder = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** `tieBreak` exists only so the generator can simulate wrong solvers; the answer key never passes it. */
export function allocate({ workers, orders }, tieBreak = compareCharOrder) {
  let subtotal = 0n;
  for (const o of orders) {
    if (!FUNDING_SOURCES.has(String(o.source ?? "").trim().toLowerCase())) continue;
    subtotal += BigInt(Math.max(0, Math.round(o.subtotal_cents)));
  }
  const pool = (subtotal * 2000n) / 10000n;

  const out = Object.fromEntries(workers.map((w) => [w.email, 0]));
  const active = workers
    .map((w) => ({ email: w.email, minutes: BigInt(minutesOf(w)) }))
    .filter((w) => w.minutes > 0n);
  const total = active.reduce((sum, w) => sum + w.minutes, 0n);
  if (pool <= 0n || total <= 0n) return { out, tieDecides: false };

  const shares = active.map((w) => ({
    email: w.email,
    cents: (w.minutes * pool) / total,
    remainder: (w.minutes * pool) % total,
  }));
  const leftover = Number(pool - shares.reduce((sum, s) => sum + s.cents, 0n));
  shares.sort((a, b) =>
    a.remainder !== b.remainder ? (b.remainder > a.remainder ? 1 : -1) : tieBreak(a.email, b.email),
  );
  const tieDecides =
    leftover > 0 && leftover < shares.length && shares[leftover - 1].remainder === shares[leftover].remainder;
  for (let i = 0; i < leftover; i += 1) shares[i].cents += 1n;
  for (const s of shares) out[s.email] = Number(s.cents);
  return { out, tieDecides };
}
