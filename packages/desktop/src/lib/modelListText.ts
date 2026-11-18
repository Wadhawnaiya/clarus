/** Parse the manual model-list field (comma and/or newline separated) into a
 *  deduped list of model ids. */
export function parseModelIds(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  ];
}
