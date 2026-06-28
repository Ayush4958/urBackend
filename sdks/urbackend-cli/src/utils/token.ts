/**
 * Validates the format of a Personal Access Token.
 * urBackend PATs always start with "ubpat_" followed by at least 10 characters.
 */
export function isValidPAT(token: string): boolean {
  return typeof token === "string" && /^ubpat_\S{10,}$/.test(token);
}
