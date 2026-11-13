import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import {
  AccessUser,
  centreAllowed,
  personScope,
  programmeScope,
  grantScope,
  surveyScope,
} from "./access";
import { can } from "./domain";
import { audit } from "./records";
import { reconcileAlerts } from "./alerts";
import { searchText } from "./query";
export const trashTypes = ["person", "programme", "grant", "survey"] as const;
export type TrashType = (typeof trashTypes)[number];
type Tx = Prisma.TransactionClient;
export type TrashRow = {
  id: string;
  type: TrashType;
  label: string;
  kind: string;
  centre: string;
  deletedAt: string | null;
  deletedBy: string | null;
  version: string;
  parentTrashed: boolean;
  impact: string[];
};
async function manager(tx: Tx, u: AccessUser) {
  const actor = await tx.user.findUnique({
    where: { id: u.id },
    include: { allowedCentres: true },
  });
  if (!actor?.active || !can(actor.role, "audit"))
    throw new Error("Your role does not permit this action.");
  return actor;
}
async function record(
  tx: Tx,
  u: AccessUser,
  type: TrashType,
  id: string,
): Promise<TrashRow> {
  const missing = () =>
    new Error("Your centre permissions do not permit this record.");
  const base = (r: {
    id: string;
    deletedAt: Date | null;
    deletedBy: string | null;
    updatedAt: Date;
  }) => ({
    id: r.id,
    type,
    deletedAt: r.deletedAt?.toISOString() ?? null,
    deletedBy: r.deletedBy,
    version: r.updatedAt.toISOString(),
  });
  if (type === "person") {
    const r = await tx.person.findFirst({
      where: { AND: [{ id }, personScope(u, true)] },
      include: {
        _count: {
          select: {
            grants: true,
            surveyResponses: true,
            assessments: true,
            participations: true,
            caregiverLinks: true,
            recipientLinks: true,
            alerts: true,
          },
        },
      },
    });
    if (!r) throw missing();
    return {
      ...base(r),
      kind: r.kind === "Member" ? "Caregiver" : "Care Recipient",
      label: [r.name || r.alias || "Unnamed record", r.memberId]
        .filter(Boolean)
        .join(" / "),
      centre: r.centre,
      parentTrashed: false,
      impact: [
        `${r._count.grants} grants, ${r._count.surveyResponses} surveys and ${r._count.alerts} reminders stay stored and are hidden while this person is in Trash.`,
        `${r._count.assessments} assessments, ${r._count.participations} programme records and ${r._count.caregiverLinks + r._count.recipientLinks} care relationships are retained. Linked people and programmes are not moved to Trash.`,
      ],
    };
  }
  if (type === "programme") {
    const r = await tx.programme.findFirst({
      where: { AND: [{ id }, programmeScope(u, true)] },
      include: {
        _count: { select: { participations: true } },
        external: { select: { _count: { select: { occurrences: true } } } },
      },
    });
    if (!r || !centreAllowed(u, r.centre)) throw missing();
    return {
      ...base(r),
      kind: "Programme",
      label: r.name,
      centre: r.centre,
      parentTrashed: false,
      impact: [
        `${r._count.participations} participation records and ${r.external?._count.occurrences || 0} imported sessions are retained.`,
        "The programme is excluded from the catalogue and matching. Synced programmes stay in Trash on subsequent syncs; no source programme is deleted.",
      ],
    };
  }
  if (type === "grant") {
    const r = await tx.grantApplication.findFirst({
      where: { AND: [{ id }, grantScope(u, true)] },
      include: {
        person: {
          select: { centre: true, name: true, memberId: true, deletedAt: true },
        },
        scheme: true,
        _count: { select: { followUps: true, alerts: true } },
      },
    });
    if (!r) throw missing();
    return {
      ...base(r),
      kind: "Grant / Referral",
      label: `${r.scheme.name} / ${r.person.name || r.person.memberId || "Person"}`,
      centre: r.person.centre,
      parentTrashed: Boolean(r.person.deletedAt),
      impact: [
        `${r._count.followUps} completed follow-ups and ${r._count.alerts} reminders remain stored.`,
        "This application is excluded from normal lists, totals and reminders. Its caregiver and other applications are retained.",
      ],
    };
  }
  const r = await tx.surveyResponse.findFirst({
    where: { AND: [{ id }, surveyScope(u, true)] },
    include: { person: { select: { deletedAt: true } } },
  });
  if (!r) throw missing();
  return {
    ...base(r),
    kind: "Survey",
    label: r.cleanedName || r.confirmedMemberId || "Unnamed survey",
    centre: r.centre,
    parentTrashed: Boolean(r.person?.deletedAt),
    impact: [
      "Original answers, scores, identity links and review history remain stored.",
      "This response is excluded from records, caregiver history, outcome statistics and exports. Reimporting it does not create a replacement; restore the original instead.",
    ],
  };
}
export async function previewTrash(
  u: AccessUser,
  type: unknown,
  id: string,
  tx: Tx = db,
) {
  const actor = await manager(tx, u);
  return record(tx, actor, z.enum(trashTypes).parse(type), id);
}
export const trashInput = z.object({
  action: z.enum(["move", "restore"]),
  type: z.enum(trashTypes),
  id: z.string().min(1),
  version: z.string(),
  confirmed: z.literal(true),
  reason: z.string().trim().max(2000).default(""),
});
export async function changeTrash(tx: Tx, u: AccessUser, input: unknown) {
  const v = trashInput.parse(input),
    actor = await manager(tx, u),
    r = await record(tx, actor, v.type, v.id);
  if (r.version !== v.version)
    throw new Error(
      "This record changed. Reload its Trash preview before continuing.",
    );
  if (v.action === "move" && r.deletedAt)
    throw new Error("This record is already in Trash.");
  if (v.action === "restore" && !r.deletedAt)
    throw new Error("This record has already been restored.");
  if (v.action === "restore" && r.parentTrashed)
    throw new Error("Restore the linked caregiver or care recipient first.");
  const at = new Date(Math.max(Date.now(), Date.parse(r.version) + 1));
  const where = {
    id: v.id,
    updatedAt: new Date(r.version),
    deletedAt: v.action === "move" ? null : new Date(r.deletedAt!),
  };
  const data = {
    deletedAt: v.action === "move" ? at : null,
    deletedBy: v.action === "move" ? actor.id : null,
    updatedAt: at,
  };
  const result =
    v.type === "person"
      ? await tx.person.updateMany({ where, data })
      : v.type === "programme"
        ? await tx.programme.updateMany({ where, data })
        : v.type === "grant"
          ? await tx.grantApplication.updateMany({ where, data })
          : await tx.surveyResponse.updateMany({ where, data });
  if (result.count !== 1)
    throw new Error(
      "This record changed. Reload its Trash preview before continuing.",
    );
  if (v.type === "person") await reconcileAlerts(tx, { personIds: [v.id] });
  if (v.type === "grant") await reconcileAlerts(tx, { grantIds: [v.id] });
  const entity = {
    person: "person",
    programme: "Programme",
    grant: "Grant",
    survey: "SurveyResponse",
  }[v.type];
  await audit(
    tx,
    actor.id,
    v.action === "move" ? "Moved to Trash" : "Restored from Trash",
    entity,
    v.id,
    { deletedAt: r.deletedAt },
    { deletedAt: data.deletedAt, reason: v.reason, relatedRecords: "Retained" },
  );
  return { id: v.id, type: v.type, action: v.action };
}
const cursorSchema = z.object({
  at: z.iso.datetime(),
  type: z.enum(trashTypes),
  id: z.string().min(1).max(200),
});
export async function listTrash(
  u: AccessUser,
  f: Record<string, string>,
  tx: Tx = db,
) {
  const actor = await manager(tx, u),
    type =
      f.type && f.type !== "all" ? z.enum(trashTypes).parse(f.type) : "all",
    q = (f.q || "").slice(0, 150);
  let cursor: z.infer<typeof cursorSchema> | null = null;
  if (f.cursor) {
    if (f.cursor.length > 600) throw new Error("Invalid Trash page.");
    try {
      cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(f.cursor, "base64url").toString("utf8")),
      );
    } catch {
      throw new Error("Invalid Trash page.");
    }
  }
  const after = (t: TrashType) =>
    !cursor
      ? {}
      : {
          OR: [
            { deletedAt: { lt: new Date(cursor.at) } },
            ...(t >= cursor.type
              ? [
                  {
                    deletedAt: new Date(cursor.at),
                    ...(t === cursor.type ? { id: { gt: cursor.id } } : {}),
                  },
                ]
              : []),
          ],
        };
  const all: TrashRow[] = [];
  let total = 0;
  for (const t of trashTypes.filter((t) => type === "all" || t === type)) {
    if (t === "person") {
      const where: Prisma.PersonWhereInput = {
        AND: [
          personScope(actor, true),
          { deletedAt: { not: null } },
          ...(q
            ? [
                {
                  OR: [
                    { name: searchText(q) },
                    { memberId: searchText(q) },
                    { alias: searchText(q) },
                  ],
                },
              ]
            : []),
        ],
      };
      total += await tx.person.count({ where });
      const rows = await tx.person.findMany({
        where: { AND: [where, after(t)] },
        take: 21,
        orderBy: [{ deletedAt: "desc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          alias: true,
          memberId: true,
          kind: true,
          centre: true,
          deletedAt: true,
          deletedBy: true,
          updatedAt: true,
        },
      });
      all.push(
        ...rows.map((r) => ({
          id: r.id,
          type: t,
          kind: r.kind === "Member" ? "Caregiver" : "Care Recipient",
          label: [r.name || r.alias || "Unnamed record", r.memberId]
            .filter(Boolean)
            .join(" / "),
          centre: r.centre,
          deletedAt: r.deletedAt!.toISOString(),
          deletedBy: r.deletedBy,
          version: r.updatedAt.toISOString(),
          parentTrashed: false,
          impact: [],
        })),
      );
    } else if (t === "programme") {
      const where: Prisma.ProgrammeWhereInput = {
        AND: [
          programmeScope(actor, true),
          { deletedAt: { not: null } },
          ...(q ? [{ name: searchText(q) }] : []),
          ...(actor.role !== "Admin" && !actor.allCentres
            ? [{ centre: { in: actor.allowedCentres.map((c) => c.centre) } }]
            : []),
        ],
      };
      total += await tx.programme.count({ where });
      const rows = await tx.programme.findMany({
        where: { AND: [where, after(t)] },
        take: 21,
        orderBy: [{ deletedAt: "desc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          centre: true,
          deletedAt: true,
          deletedBy: true,
          updatedAt: true,
        },
      });
      all.push(
        ...rows.map((r) => ({
          id: r.id,
          type: t,
          kind: "Programme",
          label: r.name,
          centre: r.centre,
          deletedAt: r.deletedAt!.toISOString(),
          deletedBy: r.deletedBy,
          version: r.updatedAt.toISOString(),
          parentTrashed: false,
          impact: [],
        })),
      );
    } else if (t === "grant") {
      const where: Prisma.GrantApplicationWhereInput = {
        AND: [
          grantScope(actor, true),
          { deletedAt: { not: null } },
          ...(q
            ? [
                {
                  OR: [
                    { scheme: { name: searchText(q) } },
                    { person: { name: searchText(q) } },
                    { person: { memberId: searchText(q) } },
                  ],
                },
              ]
            : []),
        ],
      };
      total += await tx.grantApplication.count({ where });
      const rows = await tx.grantApplication.findMany({
        where: { AND: [where, after(t)] },
        take: 21,
        orderBy: [{ deletedAt: "desc" }, { id: "asc" }],
        include: {
          scheme: { select: { name: true } },
          person: {
            select: {
              name: true,
              memberId: true,
              centre: true,
              deletedAt: true,
            },
          },
        },
      });
      all.push(
        ...rows.map((r) => ({
          id: r.id,
          type: t,
          kind: "Grant / Referral",
          label: `${r.scheme.name} / ${r.person.name || r.person.memberId || "Person"}`,
          centre: r.person.centre,
          deletedAt: r.deletedAt!.toISOString(),
          deletedBy: r.deletedBy,
          version: r.updatedAt.toISOString(),
          parentTrashed: Boolean(r.person.deletedAt),
          impact: [],
        })),
      );
    } else {
      const where: Prisma.SurveyResponseWhereInput = {
        AND: [
          surveyScope(actor, true),
          { deletedAt: { not: null } },
          ...(q
            ? [
                {
                  OR: [
                    { cleanedName: searchText(q) },
                    { confirmedMemberId: searchText(q) },
                  ],
                },
              ]
            : []),
        ],
      };
      total += await tx.surveyResponse.count({ where });
      const rows = await tx.surveyResponse.findMany({
        where: { AND: [where, after(t)] },
        take: 21,
        orderBy: [{ deletedAt: "desc" }, { id: "asc" }],
        select: {
          id: true,
          cleanedName: true,
          confirmedMemberId: true,
          centre: true,
          deletedAt: true,
          deletedBy: true,
          updatedAt: true,
          person: { select: { deletedAt: true } },
        },
      });
      all.push(
        ...rows.map((r) => ({
          id: r.id,
          type: t,
          kind: "Survey",
          label: r.cleanedName || r.confirmedMemberId || "Unnamed survey",
          centre: r.centre,
          deletedAt: r.deletedAt!.toISOString(),
          deletedBy: r.deletedBy,
          version: r.updatedAt.toISOString(),
          parentTrashed: Boolean(r.person?.deletedAt),
          impact: [],
        })),
      );
    }
  }
  all.sort(
    (a, b) =>
      b.deletedAt!.localeCompare(a.deletedAt!) ||
      a.type.localeCompare(b.type) ||
      a.id.localeCompare(b.id),
  );
  const rows = all.slice(0, 20),
    last = rows.at(-1);
  return {
    rows,
    total,
    nextCursor:
      all.length > 20 && last
        ? Buffer.from(
            JSON.stringify({
              at: last.deletedAt,
              type: last.type,
              id: last.id,
            }),
          ).toString("base64url")
        : null,
  };
}
