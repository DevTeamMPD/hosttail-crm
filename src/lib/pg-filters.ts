// Helpers to safely build PostgREST filter strings from untrusted input.
// PostgREST parses `.or()`/`.not(col,'in',...)` filter *strings*, so raw
// interpolation lets commas / parens / wildcards corrupt or broaden the query.

/**
 * Sanitize a free-text search term for embedding in a `.or('col.ilike.%term%')`
 * filter. Strips the characters that delimit/structure a PostgREST filter
 * string (`,` `(` `)` `*` `\`) and the ilike wildcards (`%` `_`) so the term is
 * treated literally. Returns '' if nothing meaningful remains.
 */
export function sanitizeSearch(term: string): string {
  return term.replace(/[,()*\\%_]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Build a quoted PostgREST in-list, e.g. ("0812345678","0899999999").
 * Each value is double-quoted (embedded quotes/backslashes stripped) so commas
 * or parens inside a value can't break the filter.
 */
export function pgInList(values: string[]): string {
  return `(${values.map(v => `"${String(v).replace(/["\\]/g, '')}"`).join(',')})`
}
