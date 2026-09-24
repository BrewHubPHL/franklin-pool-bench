"""Franklin Pool answer key, prompt builder and output parser, ported from
allocate.mjs, generate.mjs and parse.mjs. build.mjs inlines this file into
the Kaggle notebooks; test_port.py checks it against cases.jsonl."""
import json
import subprocess
import sys

FUNDING_SOURCES = {"online", "agent_api"}


def minutes_of(w):
    return max(0, w["regular"] + w["overtime"] + w["sunday_regular"] + w["sunday_overtime"])


def allocate(workers, orders):
    """Every worker's cents (0 if excluded). Python ints never lose precision."""
    subtotal = 0
    for o in orders:
        if str(o["source"] if o["source"] is not None else "").strip().lower() not in FUNDING_SOURCES:
            continue
        subtotal += max(0, round(o["subtotal_cents"]))
    pool = subtotal * 2000 // 10000

    out = {w["email"]: 0 for w in workers}
    active = [(w["email"], minutes_of(w)) for w in workers if minutes_of(w) > 0]
    total = sum(m for _, m in active)
    if pool <= 0 or total <= 0:
        return out
    shares = [[e, m * pool // total, m * pool % total] for e, m in active]
    leftover = pool - sum(s[1] for s in shares)
    shares.sort(key=lambda s: (-s[2], s[0]))  # str order is plain code-point order
    for s in shares[:leftover]:
        s[1] += 1
    for e, cents, _ in shares:
        out[e] = cents
    return out


def build_prompt(rules, workers, orders):
    wl = "\n".join(
        f"| {w['email']} | {w['regular']} | {w['overtime']} | {w['sunday_regular']} | {w['sunday_overtime']} |"
        for w in workers
    )
    if orders:
        ol = "\n".join(
            f"| {'(null)' if o['source'] is None else json.dumps(o['source'], ensure_ascii=False)} | {o['subtotal_cents']} |"
            for o in orders
        )
    else:
        ol = "| (no orders) | |"
    return f"""{rules}

## Workers (minutes)
| email | regular | overtime | sunday_regular | sunday_overtime |
|---|---|---|---|---|
{wl}

## Orders
| source | subtotal_cents |
|---|---|
{ol}

Reply with only a JSON object mapping every worker email above to their integer cents, e.g. {{"a@x.com": 120, "b@x.com": 0}}."""


def _reject_constant(name):
    raise ValueError(name)


def _is_answer(o):
    return (
        isinstance(o, dict) and len(o) > 0
        and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in o.values())
    )


def _matching_brace(text, start):
    depth, in_string, i = 0, False, start
    while i < len(text):
        ch = text[i]
        if in_string:
            if ch == "\\":
                i += 1
            elif ch == '"':
                in_string = False
        elif ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def parse_output(text):
    """The last balanced {...} block that parses as a JSON object of numbers, or None."""
    found, found_end = None, -1
    start = text.find("{")
    while start >= 0:
        end = _matching_brace(text, start)
        if end >= 0:
            try:
                obj = json.loads(text[start : end + 1], parse_constant=_reject_constant)
            except ValueError:
                obj = None
            if _is_answer(obj) and end > found_end:
                found, found_end = obj, end
        start = text.find("{", start + 1)
    return found


def grade(answer, got):
    """(passed, sums_to_pool) for a parsed output against the answer key."""
    if got is None:
        return False, False
    passed = all(got.get(e) == v and not isinstance(got.get(e), bool) for e, v in answer.items())
    got_sum = sum(got[e] for e in answer if isinstance(got.get(e), (int, float)) and not isinstance(got.get(e), bool))
    return passed, got_sum == sum(answer.values())


def run_python_script(code: str) -> str:
    """Run a Python 3 script and return what it prints (stdout, then stderr). Use print() to see values. 30 second limit."""
    try:
        p = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, timeout=30)
    except subprocess.TimeoutExpired:
        return "error: timed out after 30 seconds"
    return (p.stdout + p.stderr)[-8000:] or "(no output)"
