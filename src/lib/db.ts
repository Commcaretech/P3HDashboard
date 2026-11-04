import { PrismaClient } from "@prisma/client";
const globalDb = globalThis as unknown as { db?: PrismaClient };
export const db = globalDb.db ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalDb.db = db;
export const personInclude = {
  languages: { include: { language: true } },
  interests: { include: { interest: true } },
  conditions: { include: { condition: true } },
  assessments: true,
} as const;
export const programmeInclude = {
  external: { include: { occurrences: true } },
  languages: { include: { language: true } },
  interests: { include: { interest: true } },
  conditions: { include: { condition: true } },
  participations: true,
} as const;
