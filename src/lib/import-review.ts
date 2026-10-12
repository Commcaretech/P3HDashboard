export type Reviewable = {
  existingId?: string;
  action: string;
  errors: string[];
  warnings: string[];
};
export function reviewCategory(r: Reviewable, category: string) {
  return (
    category === "All" ||
    (category === "Ready" && !r.errors.length) ||
    (category === "Warnings" && r.warnings.length > 0) ||
    (category === "Errors" && r.errors.length > 0) ||
    (category === "Duplicates" &&
      (Boolean(r.existingId) ||
        r.errors.some((e) => e.includes("Duplicate")))) ||
    (category === "Existing" && Boolean(r.existingId)) ||
    (category === "New" && !r.existingId)
  );
}
export function bulkReview<T extends Reviewable & { rowNumber: number }>(
  rows: T[],
  action: "new" | "errors" | "duplicates" | "existing",
  selected: Set<number> = new Set(),
) {
  return rows.map((r) => ({
    ...r,
    action:
      action === "new" && !r.existingId && !r.errors.length
        ? "Import"
        : action === "errors" && r.errors.length
          ? "Skip"
          : action === "duplicates" &&
              (r.existingId || r.errors.some((e) => e.includes("Duplicate")))
            ? "Skip"
            : action === "existing" &&
                r.existingId &&
                !r.errors.length &&
                selected.has(r.rowNumber)
              ? "Update existing"
              : r.action,
  }));
}
