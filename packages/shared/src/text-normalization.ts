function hasFewRealNewlines(value: string): boolean {
  const realNewlines = (value.match(/\n/g) ?? []).length;
  const escapedNewlines = (value.match(/\\n|\\r\\n|\\r/g) ?? []).length;
  return escapedNewlines > 0 && realNewlines <= 1;
}

export function normalizeHumanTextInput(value: string): string {
  const normalizedLineEndings = value.replace(/\r\n?/g, "\n");
  if (!hasFewRealNewlines(normalizedLineEndings)) return normalizedLineEndings;
  return normalizedLineEndings
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n");
}
