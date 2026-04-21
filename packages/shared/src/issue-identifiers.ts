const ISSUE_IDENTIFIER_REF_RE = /^[A-Z][A-Z0-9]*-\d+$/i;

export function isIssueIdentifierRef(value: string): boolean {
  return ISSUE_IDENTIFIER_REF_RE.test(value.trim());
}

