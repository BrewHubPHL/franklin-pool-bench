/**
 * Build the two Kaggle Benchmarks notebooks from cases.jsonl, SPEC.md and
 * franklin_core.py. Both run the same 220 prompts; the "python" one also
 * hands the model a run_python tool.
 *
 * Usage: node kaggle/build.mjs [cases.jsonl]
 * Writes kaggle/out/franklin_pool_{bare,python}.{py,ipynb}.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const casesPath = process.argv[2] ?? join(root, "cases.jsonl");
const cases = readFileSync(casesPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const rules = readFileSync(join(root, "SPEC.md"), "utf8").split("<!-- rules -->")[1].trim();
const core = readFileSync(join(here, "franklin_core.py"), "utf8");
const data = cases.map(({ id, category, tie_decides, answer, input }) => ({ id, category, tie_decides, answer, ...input }));

const VARIANTS = {
  bare: {
    name: "Franklin Pool: tip-split payout math",
    blurb: "The model answers directly, with no tools.",
    call: "llm.prompt(c[\"prompt\"])",
  },
  python: {
    name: "Franklin Pool: tip-split payout math (Python tool)",
    blurb: "Same prompts, but the model may call a `run_python` tool. The prompt does not mention it; the tool is only offered.",
    call: "llm.prompt(c[\"prompt\"], tools=[run_python])",
  },
};

function cells(v) {
  const fn = v === "bare" ? "franklin_pool" : "franklin_pool_python";
  const { name, blurb, call } = VARIANTS[v];
  return [
    ["markdown", `# ${name}

Split a coffee shop's tip pool (20% of online-order revenue) across staff by minutes worked, in whole cents, with the largest-remainder method. There is exactly one right answer per case, and a case passes only if every worker's cents match.

${blurb}

220 cases in 11 categories. 40 of them turn on an email tie-break that locale-aware sort, natural sort and table order all get wrong. Source and answer key: franklin-pool-bench (\`generate.mjs\`, seed 20260923).`],
    ["code", `import json

import pandas as pd
import kaggle_benchmarks as kbench`],
    ["code", `# Answer key, prompt builder and grader (franklin_core.py).\n${core.replace(/^"""[\s\S]*?"""\n/, "").trim()}`],
    ["code", `RULES = ${JSON.stringify(rules)}

CASES = json.loads(${JSON.stringify(JSON.stringify(data))})
for c in CASES:
    c["prompt"] = build_prompt(RULES, c["workers"], c["orders"])
    assert allocate(c["workers"], c["orders"]) == c["answer"], c["id"]  # answer key self-check
BY_ID = {c["id"]: c for c in CASES}
print(len(CASES), "cases,", sum(c["tie_decides"] for c in CASES), "tie-decided")`],
    ["code", `@kbench.task(name=${JSON.stringify(v === "bare" ? "franklin_pool_case" : "franklin_pool_case_python")}, store_task=False)
def solve_case(llm, case_id: str) -> dict:
    c = BY_ID[case_id]
    ${v === "python" ? `calls = []

    def run_python(code: str) -> str:
        """Run a Python 3 script and return what it prints (stdout, then stderr). Use print() to see values. 30 second limit."""
        calls.append(code)
        return run_python_script(code)

    try:
        response = ${call}
    except kbench.tools.base.ToolInvocationLimitExhausted:
        response = ""  # kept calling the tool and never answered: a failed case, not an API error` : `response = ${call}`}
    got = parse_output(str(response))
    passed, sums = grade(c["answer"], got)
    kbench.assertions.assert_true(passed, expectation="Every worker's cents match the answer key exactly.")
    return {
        "id": c["id"], "category": c["category"], "tie_decides": c["tie_decides"],
        "pass": passed, "parsed": got is not None, "sums_to_pool": sums,${v === "python" ? `\n        "tool_calls": len(calls), "tool_limit": response == "",` : ""}
    }`],
    ["code", `EVAL = pd.DataFrame({"case_id": [c["id"] for c in CASES]})


@kbench.task(name=${JSON.stringify(name)})
def ${fn}(llm) -> float:
    """Share of the 220 cases where every worker's cents are exactly right. Errored runs count as failures."""
    # Nested evaluate() allows one attempt, so retry cases that errored (API
    # timeouts, rate limits) here; the cache skips cases already answered.
    results, pending = {}, EVAL
    with kbench.client.enable_cache():
        for _ in range(3):
            runs = solve_case.evaluate(
                llm=[llm], evaluation_data=pending, n_jobs=4, timeout=600, on_failure="continue",
            )
            results.update((r.result["id"], r.result) for r in runs.completed_runs)
            pending = EVAL[~EVAL.case_id.isin(results)]
            if pending.empty:
                break
    rows = pd.DataFrame(list(results.values()))
    errored = len(CASES) - len(rows)
    by_cat = rows.groupby("category")["pass"].agg(["sum", "count"])
    print(by_cat.to_string())
    tie = rows[rows.tie_decides]
    print(f"tie-decided: {int(tie['pass'].sum())}/{len(tie)}")
    print(f"unparseable: {int((~rows.parsed).sum())}  sum != pool: {int((rows.parsed & ~rows.sums_to_pool).sum())}  errored: {errored}")${v === "python" ? `
    print(f"used the tool: {int((rows.tool_calls > 0).sum())}/{len(rows)}  "
          f"pass with tool: {int(rows[rows.tool_calls > 0]['pass'].sum())}  without: {int(rows[rows.tool_calls == 0]['pass'].sum())}  "
          f"hit the tool-round limit: {int(rows.tool_limit.sum())}")` : ""}
    return float(rows["pass"].sum()) / len(CASES)


run = ${fn}.run(kbench.llm)
run`],
    ["code", `%choose ${fn}`],
  ];
}

function toPy(cs) {
  return cs.map(([kind, src]) =>
    kind === "markdown"
      ? `# %% [markdown]\n${src.split("\n").map((l) => (l ? `# ${l}` : "#")).join("\n")}`
      : `# %%\n${src.replace(/^%choose/m, "# Kaggle notebook magic; uncomment there:\n# %choose")}`,
  ).join("\n\n") + "\n";
}
function toIpynb(cs) {
  const lines = (s) => s.split("\n").map((l, i, a) => (i < a.length - 1 ? `${l}\n` : l));
  return JSON.stringify({
    cells: cs.map(([kind, src]) => ({
      cell_type: kind, metadata: {}, source: lines(src),
      ...(kind === "code" ? { execution_count: null, outputs: [] } : {}),
    })),
    metadata: { kernelspec: { name: "python3", display_name: "Python 3", language: "python" }, language_info: { name: "python" } },
    nbformat: 4, nbformat_minor: 5,
  }, null, 1) + "\n";
}

const out = join(here, "out");
mkdirSync(out, { recursive: true });
for (const v of Object.keys(VARIANTS)) {
  const cs = cells(v);
  writeFileSync(join(out, `franklin_pool_${v}.py`), toPy(cs));
  writeFileSync(join(out, `franklin_pool_${v}.ipynb`), toIpynb(cs));
}
console.log(`${cases.length} cases → ${out}/franklin_pool_{${Object.keys(VARIANTS)}}.{py,ipynb}`);
