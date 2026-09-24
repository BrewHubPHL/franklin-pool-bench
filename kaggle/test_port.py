"""Check the Python port against the JS answer key: every prompt byte for byte,
every answer, and the same parser cases as test.mjs.

Usage: python3 kaggle/test_port.py [cases.jsonl]"""
import json
import pathlib
import sys

from franklin_core import allocate, build_prompt, grade, parse_output, run_python_script

root = pathlib.Path(__file__).resolve().parent.parent
rules = (root / "SPEC.md").read_text().split("<!-- rules -->")[1].strip()
cases = [json.loads(l) for l in pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else root / "cases.jsonl").read_text().splitlines() if l]

for c in cases:
    w, o = c["input"]["workers"], c["input"]["orders"]
    assert build_prompt(rules, w, o) == c["prompt"], f"{c['id']}: prompt differs"
    assert allocate(w, o) == c["answer"], f"{c['id']}: answer differs"
    assert list(allocate(w, o)) == list(c["answer"]), f"{c['id']}: key order differs"
    assert grade(c["answer"], parse_output(json.dumps(c["answer"]))) == (True, True)

ans = {"a@x.com": 120, "b@x.com": 0}
parses = [
    ('{"a@x.com": 120, "b@x.com": 0}', ans),
    ('pool = {sum of subtotals} / 5 → 600. Shares: {a: 120}.\n{"a@x.com": 120, "b@x.com": 0}', ans),
    ('```json\n{"a@x.com": 120, "b@x.com": 0}\n```\nCheck: {120 + 0 = 120} ✓', ans),
    ('draft {"a@x.com": 119, "b@x.com": 1}\nfinal {"a@x.com": 120, "b@x.com": 0}', ans),
    ('{"answer": {"a@x.com": 120, "b@x.com": 0}}', ans),
    ('{"note": "use } carefully", "a@x.com": 1}', None),
    ('{"a@x.com": "120"}', None),
    ('{"a@x.com": true}', None),
    ('{"a@x.com": NaN}', None),
    ("no json here", None),
    ("{unclosed", None),
]
for text, want in parses:
    assert parse_output(text) == want, text
assert grade(ans, {"a@x.com": 119, "b@x.com": 1}) == (False, True)
assert run_python_script("print(6 * 7)").strip() == "42"
print(f"python port: {len(cases)} prompts and answers match; {len(parses)} parser cases ok")
