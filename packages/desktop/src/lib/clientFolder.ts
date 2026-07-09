/** Basename of a path for compact sidebar display (no trailing slash). */
export function clientFolderLabel(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "");
  const parts = trimmed.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}
