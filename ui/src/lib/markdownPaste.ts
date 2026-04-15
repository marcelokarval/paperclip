const BLOCK_MARKER_PATTERNS = [
  /^#{1,6}\s+/m,
  /^>\s+/m,
  /^[-*+]\s+/m,
  /^\d+\.\s+/m,
  /^```/m,
  /^~~~/m,
  /^\|.+\|$/m,
  /^---$/m,
  /^\*\*\*$/m,
  /^___$/m,
];

export function normalizePastedMarkdown(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

export function looksLikeMarkdownPaste(text: string): boolean {
  const normalized = normalizePastedMarkdown(text).trim();
  if (!normalized) return false;

  return BLOCK_MARKER_PATTERNS.some((pattern) => pattern.test(normalized));
}

export interface PlainMarkdownPasteDecisionInput {
  hasFiles: boolean;
  plainText: string;
  selectionInsideCodeLikeElement: boolean;
}

export function shouldPreferPlainMarkdownPaste(input: PlainMarkdownPasteDecisionInput): boolean {
  if (input.hasFiles || input.selectionInsideCodeLikeElement) return false;
  return looksLikeMarkdownPaste(input.plainText);
}
