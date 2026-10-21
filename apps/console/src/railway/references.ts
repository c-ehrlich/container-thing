/**
 * Which services a variable points at, from Railway's `Variable.references`. The schema doesn't say
 * how references are written and none were checked live yet, so this accepts `service.VARIABLE`
 * with or without `${{ }}`, by service name or ID, and skips anything else (shared variables, the
 * environment's own). If the format turns out different, diagrams just lose their lines.
 */
export function referencedServices(
  references: string[],
  services: { id: string; name: string }[],
): string[] {
  return references.flatMap((reference) => {
    const target = reference
      .replace(/^\$\{\{\s*/, "")
      .split(".")[0]
      ?.trim()
      .toLowerCase();
    const service = services.find((s) => s.id === target || s.name.toLowerCase() === target);
    return service ? [service.name] : [];
  });
}
