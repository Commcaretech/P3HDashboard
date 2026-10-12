/** SQLite contains is case-insensitive for ASCII. PostgreSQL needs an explicit mode. */
export function searchText(value: string) {
  return {
    contains: value,
    ...(process.env.DATABASE_URL?.startsWith("postgres")
      ? { mode: "insensitive" as const }
      : {}),
  };
}
