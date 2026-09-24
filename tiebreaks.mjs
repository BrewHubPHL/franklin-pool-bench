/**
 * Plausible but wrong tie-breaks. A tie case only counts if every one of these
 * gets it wrong, so a model can't pass the tie categories with any of them.
 *
 * Needs a Node built with full ICU (the default since Node 13); assertIcu()
 * fails loudly otherwise, because the generated set would change.
 */
export const WRONG_TIE_BREAKS = {
  locale: new Intl.Collator("en").compare,                   // a.localeCompare(b)
  natural: new Intl.Collator("en", { numeric: true }).compare, // "natural" sort
  input_order: () => 0,                                      // no tie-break: keep table order (stable sort)
};

export function assertIcu() {
  const { locale, natural } = WRONG_TIE_BREAKS;
  const ok = locale("a_b@x", "a-b@x") < 0 && locale("jo@x", "jo+pos@x") < 0 && natural("mo2@x", "mo11@x") < 0;
  if (!ok) throw new Error("this Node lacks full ICU collation; the generated set would not match the committed one");
}
