/**
 * Express 5's installed @types (express-serve-static-core 5.x) type every
 * req.params/req.query value as `string | string[]` (params) or
 * `string | string[] | ParsedQs | ParsedQs[] | undefined` (query) — this
 * covers Express's repeated-key/array-style routing and query parsing, but
 * every route in this app only ever expects a single scalar value. Rather
 * than `as string` at ~150 call sites (silently trusting an assumption that
 * could be wrong), these narrow the same way at every call site: take the
 * first element if an array genuinely showed up, otherwise pass the string
 * through — same real-world behavior `as string` would have assumed, but
 * type-checked instead of asserted.
 */

/** A route param (e.g. req.params.id) — Express guarantees it's present when the route matched, so this never returns undefined. */
export function paramString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** A query param (e.g. req.query.search) — genuinely optional, and could in principle be a nested object (ParsedQs) for a query string this app never sends itself; only the plain-string/string-array shapes are meaningful here. */
export function queryString(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : undefined;
  return typeof value === "string" ? value : undefined;
}
