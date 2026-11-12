/**
 * Makes user text safe to use inside a RegExp, so a search for "a.b" matches only "a.b"
 * (not "axb"), and text like ".*" can't match everything.
 */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
