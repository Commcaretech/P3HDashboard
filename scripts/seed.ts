import { PrismaClient } from "@prisma/client";
import { savePerson, saveProgramme } from "../src/lib/records";
import { hashPassword } from "../src/lib/auth";
const db = new PrismaClient();
async function main() {
  if (process.env.ALLOW_FAKE_SEED !== "yes")
    throw new Error(
      "Set ALLOW_FAKE_SEED=yes explicitly to add fictional demo records.",
    );
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 12)
    throw new Error("Set DEMO_PASSWORD to at least 12 characters.");
  await db.$transaction(
    async (tx) => {
      const u = await tx.user.upsert({
        where: { username: "demo.admin" },
        create: {
          username: "demo.admin",
          name: "Demo Administrator",
          role: "Admin",
          passwordHash: hashPassword(password),
        },
        update: {},
      });
      if (await tx.person.findUnique({ where: { memberId: "DEMO-001" } }))
        return;
      const m = await savePerson(tx, u.id, {
        kind: "Member",
        memberId: "DEMO-001",
        name: "Fictional Caregiver",
        centre: "Demo Centre",
        languages: "English, Mandarin",
        interests: "Exercise, Music",
        status: "Active",
      });
      const cr = await savePerson(tx, u.id, {
        kind: "Care Recipient",
        alias: "Fictional Recipient",
        languages: "Mandarin",
        conditions: "Dementia",
        interests: "Exercise",
        mobility: "Assisted",
        dob: "1950-10-18",
      });
      await tx.careRelationship.create({
        data: { memberId: m.id, recipientId: cr.id, relationship: "Spouse" },
      });
      await saveProgramme(tx, u.id, {
        name: "Demo Supported Exercise",
        languages: "English, Mandarin",
        conditions: "Dementia",
        interests: "Exercise",
        mobility: "Assisted",
        centre: "Demo Centre",
        venue: "Demo Activity Room",
        day: "Tuesday",
        startTime: "10:00",
        endTime: "11:00",
        frequency: "Weekly",
        capacity: 12,
        registrationStatus: "Open",
        status: "Active",
      });
      for (const name of [
        "HCG",
        "SSS",
        "PioneerDAS",
        "Home Therapy",
        "EASE",
        "Financial assistance",
      ])
        await tx.supportScheme.upsert({
          where: { name },
          create: { name },
          update: {},
        });
    },
    { timeout: 60000 },
  );
  console.log("Fictional demo seed added. No workbook data used.");
}
main().finally(() => db.$disconnect());
