# Franklin Pool payout benchmark — rules spec

Everything after the marker below is embedded verbatim in every prompt. It
describes the production payroll allocation exactly; `allocate.mjs` implements
it and is the answer key.

<!-- rules -->
# Task: split a tip pool in integer cents

A coffee shop shares 20% of its online-order revenue with staff in proportion to minutes worked. Compute each worker's payout in whole cents using these rules exactly.

1. **Funding.** An order counts only if its `source`, after trimming whitespace and lowercasing, is exactly `online` or `agent_api`. Any other source, including a missing (null) one, does not count. Each counted order contributes `max(0, subtotal_cents)`.
2. **Pool.** `pool = floor(total_counted_subtotal × 2000 / 10000)` cents (20%, rounded down).
3. **Minutes.** A worker's minutes = regular + overtime + sunday_regular + sunday_overtime. Workers with 0 minutes get 0 cents and are left out of every step below. `team_minutes` = the sum over the remaining workers.
4. **If the pool is 0 or no one has minutes,** everyone gets 0.
5. **Base share.** For each worker, `base = floor(minutes × pool / team_minutes)` and `remainder = (minutes × pool) mod team_minutes` (an integer).
6. **Leftover.** `leftover = pool − sum of base shares`. Sort workers by `remainder` descending; break exact ties by email ascending in plain character order — compare character codes left to right (ASCII: `+` < `-` < `.` < digits < `@` < `_` < lowercase letters), a shorter string sorts first if it is a prefix of the longer one. No locale, natural-number or case-insensitive ordering. Give 1 extra cent to each of the first `leftover` workers in that order.
7. The payouts must add up to exactly `pool`.
