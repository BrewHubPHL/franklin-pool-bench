# franklin-pool-bench

A benchmark for exact payout math. Each case asks a model to split a coffee shop's tip pool (20% of online-order revenue) across staff by minutes worked, in whole cents, with the largest-remainder method. The answer is fully determined, so grading is an exact match.

It is the allocation BrewHub PHL uses in production payroll (the "Franklin Pool"). The rules are in [`SPEC.md`](SPEC.md). They are embedded word for word in every prompt.

## What makes it hard

The arithmetic is easy. Following every rule exactly is not:

- **Exact remainder ties.** When several workers' remainders are equal, the leftover cent goes to the email that sorts first in *plain character order*. `a-b@` beats `a_b@`, `b10@` beats `b1@` and `jo+pos@` beats `jo@`. Locale-aware and "natural" sorts both get these wrong.
- **Funding filter.** Only `online` and `agent_api` orders count, after trimming whitespace and lowercasing (so `" Agent_API "` counts). Negative subtotals count as 0.
- **Zero-hours workers** get 0 and are left out of the split entirely.
- **A dominant worker** holds exactly 90% of team minutes.
- **Tiny pools** are smaller than headcount, so most of the pay comes from leftover cents.
- **Minutes are split** across four buckets (regular, overtime, Sunday regular, Sunday overtime).
- **Empty pools** come from POS-only orders, rounding to 0, or no orders at all.

## Categories

11 categories × 20 cases = 220 by default (seed `20260923`). The committed `cases.jsonl` is that default set.

| category | what it tests |
|---|---|
| `even_split` | Divides evenly, so there is no leftover |
| `simple_remainder` | Ordinary largest-remainder rounding |
| `exact_ties` | Equal minutes for everyone and look-alike emails (`ana`, `ana7`, `ana.k`, `ana_k`…), so the tie-break decides the leftover |
| `email_order_traps` | Tied pairs whose character order disagrees with locale and natural sorting |
| `zero_hours` | One worker with 0 minutes |
| `dominant_worker` | One worker has 90% of the minutes |
| `tiny_pool` | Pool smaller than headcount |
| `many_workers` | 12–16 workers, minutes split across the four buckets |
| `funding_filter` | Mixed sources, casing, whitespace, null, negatives |
| `bucket_split` | Minutes split across the four buckets |
| `empty_pool` | Pool rounds to 0 |

Each case line records `tie_decides`: whether a cent turns on the email tie-break rather than on the remainders. There are 40 such cases in the default set (every case in the two tie categories), and the grader scores them separately.

A case in the tie categories is kept only if the tie-break decides a cent *and* a solver that is correct except for its tie-break gets it wrong, for each of three wrong tie-breaks: `localeCompare`, natural (numeric) sort, and no tie-break at all (table order). Rejected draws still come from the seeded generator, so the set is still reproducible. Generation needs Node's default full-ICU build and stops if it's missing.

## Usage

Needs Node 18+ and nothing else (Python 3.10+ for the Kaggle port).

```sh
node generate.mjs [--seed N] [--per-category N] [--out cases.jsonl]
node grade.mjs cases.jsonl answers.jsonl
node test.mjs
```

The same seed always gives the same set.

Write `answers.jsonl` with one line per case: `{"id": "<case id>", "output": "<raw model text>"}`. The grader takes the last `{…}` block in the output that parses as a JSON object of numbers, so braces in shown work, code fences or a draft before the final answer don't break parsing. A case passes only if every worker's cents match exactly. The grader reports:

- pass rate per category
- pass rate on tie-decided cases
- how many answers don't add up to the pool
- how many answers weren't valid JSON

### Case format

```json
{"id": "exact_ties-003", "category": "exact_ties", "seed": 20260923,
 "prompt": "…", "answer": {"ana@brewhubphl.com": 1779, "…": 1778},
 "tie_decides": true, "input": {"workers": […], "orders": […]}}
```

`answer` lists every worker in the prompt, including 0 for anyone excluded. Emails are made up.

## Kaggle Benchmarks

`kaggle/` ports the benchmark to [Kaggle Benchmarks](https://www.kaggle.com/benchmarks) as two tasks over the same 220 prompts:

| notebook | leaderboard task | what the model gets |
|---|---|---|
| `kaggle/out/franklin_pool_bare.ipynb` | `Franklin Pool: tip-split payout math` | the prompt only |
| `kaggle/out/franklin_pool_python.ipynb` | `Franklin Pool: tip-split payout math (Python tool)` | the same prompt, plus a `run_python` tool it may call |

The prompt never mentions the tool, so the only difference between the two tasks is whether a code tool is available. Each task's score is the share of the 220 cases answered exactly. The notebook also prints pass rates per category and on tie-decided cases, plus unparseable answers and (with the tool) how many cases called it.

- `kaggle/franklin_core.py` is the Python port of the answer key, prompt builder and parser. `python3 kaggle/test_port.py` checks it against `cases.jsonl`: every prompt byte for byte and every answer.
- `node kaggle/build.mjs` rebuilds both notebooks (`.ipynb` and a `# %%` `.py` copy) with the cases embedded, so there's no Kaggle Dataset to attach. Rebuild after regenerating `cases.jsonl`.
- API errors are retried up to twice. A case that still errors counts as a failure. A model that keeps calling the tool until the library's 10-round limit is scored as a wrong answer.

To run: open https://www.kaggle.com/benchmarks/tasks/new, import the notebook (File → Import Notebook), run all cells, then add models from the task page. Do this once for each notebook, then group the two tasks into one benchmark.

## Answer key

`allocate.mjs` implements `SPEC.md` using BigInt math, so large numbers never lose precision. With a checkout of the private production repo, setting `BREWHUB_REPO=/path/to/checkout` also compares every case against the production `allocateFranklinPool` and aborts on any disagreement. The committed set passes that check against bot@adc6201 (all 220 cases, including the 40 tie cases). Re-run it after any change to the generator.

`node test.mjs` checks the parser, re-derives every answer from `input`, and scores solvers that are correct except for their tie-break:

| wrong tie-break | total | tie-decided |
|---|---|---|
| `localeCompare` | 180/220 | 0/40 |
| natural sort | 180/220 | 0/40 |
| table order | 180/220 | 0/40 |

All 40 misses per solver are in the tie categories.

## License

MIT. See [`LICENSE`](LICENSE).
