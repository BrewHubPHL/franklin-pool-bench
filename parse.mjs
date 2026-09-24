/**
 * Pull the answer out of raw model text: the last balanced {…} block that
 * parses as a JSON object whose values are all numbers. Braces in shown work,
 * code, or prose before the answer are skipped instead of breaking the parse.
 */
export function parseOutput(text) {
  let found = null;
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    const end = matchingBrace(text, start);
    if (end < 0) continue;
    let obj;
    try { obj = JSON.parse(text.slice(start, end + 1)); } catch { continue; }
    if (isAnswer(obj) && (!found || end > found.end)) found = { end, obj };
  }
  return found ? found.obj : null;
}

const isAnswer = (o) =>
  o !== null && typeof o === "object" && !Array.isArray(o) &&
  Object.keys(o).length > 0 && Object.values(o).every((v) => typeof v === "number");

/** Index of the `}` closing the `{` at `start`, skipping braces inside JSON strings; -1 if none. */
function matchingBrace(text, start) {
  let depth = 0, inString = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i += 1;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}" && --depth === 0) return i;
  }
  return -1;
}
