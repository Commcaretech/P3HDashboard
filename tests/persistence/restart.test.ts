import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { DatabaseSync } from "node:sqlite";
import { spawn, execFileSync, ChildProcess } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { hashPassword } from "../../src/lib/auth";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
test(
  "records and authenticated sessions survive a complete production-server restart",
  { timeout: 45000 },
  async () => {
    const path = resolve("data", `restart-${randomUUID()}.db`);
    const url = `file:${path.replace(/\\/g, "/")}`;
    const blank = new DatabaseSync(path);
    blank.close();
    execFileSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" },
    );
    const db = new PrismaClient({ datasourceUrl: url });
    const password = randomBytes(24).toString("base64url");
    await db.user.create({
      data: {
        username: "restart.fake",
        name: "Fictional Staff",
        role: "Admin",
        passwordHash: hashPassword(password),
      },
    });
    await db.person.create({
      data: {
        kind: "Member",
        memberId: "PERSISTENCE-FAKE",
        name: "Fictional Persistent Record",
      },
    });
    const person = await db.person.findUniqueOrThrow({
      where: { memberId: "PERSISTENCE-FAKE" },
    });
    const staff = await db.user.findUniqueOrThrow({
      where: { username: "restart.fake" },
    });
    const batch = await db.surveyImportBatch.create({
      data: {
        filename: "fictional-survey.csv",
        language: "English",
        centre: "",
        uploadedBy: staff.id,
        summary: { saved: 1 },
      },
    });
    await db.surveyResponse.create({
      data: {
        batchId: batch.id,
        sourceKey: "restart-survey",
        contentHash: "fictional-source",
        rowNumber: 2,
        centre: "",
        language: "English",
        submittedName: "Fictional",
        cleanedName: "Fictional",
        timestampText: "2026-11-13",
        surveyDate: new Date("2026-11-13"),
        phase: "Baseline",
        personId: person.id,
        confirmedMemberId: person.memberId,
        matchStatus: "Linked",
        rawAnswers: { Q1: "3" },
        answers: { Q1: "3" },
        method: "P3H_WHOQOL_ZBI6_v1_complete_domains",
        warnings: [],
        physical: 50,
        psychological: 50,
        social: 50,
        environment: 50,
        overall: 50,
        zbi: 12,
      },
    });
    await db.$disconnect();
    const reservation = createServer();
    await new Promise<void>((r) => reservation.listen(0, "127.0.0.1", r));
    const address = reservation.address();
    assert.ok(address && typeof address !== "string");
    const port = address.port;
    await new Promise<void>((r) => reservation.close(() => r()));
    const origin = `http://127.0.0.1:${port}`;
    let child: ChildProcess | undefined;
    const start = async () => {
      child = spawn(
        process.execPath,
        [
          "node_modules/next/dist/bin/next",
          "start",
          "--hostname",
          "127.0.0.1",
          "--port",
          String(port),
        ],
        {
          env: {
            ...process.env,
            DATABASE_URL: url,
            NEXT_TELEMETRY_DISABLED: "1",
          },
          stdio: "ignore",
        },
      );
      for (let i = 0; i < 100; i++) {
        try {
          if ((await fetch(origin + "/api/auth")).ok) return;
        } catch {}
        await delay(100);
      }
      throw new Error("Local test server failed to start");
    };
    const stop = async () => {
      if (child && child.exitCode === null) {
        const current = child;
        await new Promise<void>((r) => {
          current.once("exit", () => r());
          current.kill();
        });
      }
    };
    try {
      await start();
      const login = await fetch(origin + "/api/auth", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          username: "restart.fake",
          password,
        }),
      });
      assert.equal(login.status, 200);
      const cookie = login.headers.get("set-cookie")!.split(";")[0];
      let snapshot = await (
        await fetch(origin + "/api/data", { headers: { Cookie: cookie } })
      ).json();
      assert.equal(snapshot.people[0].memberId, "PERSISTENCE-FAKE");
      await stop();
      await start();
      const read = await fetch(origin + "/api/data", {
        headers: { Cookie: cookie },
      });
      assert.equal(read.status, 200);
      snapshot = await read.json();
      assert.equal(snapshot.people.length, 1);
      assert.equal(snapshot.people[0].name, "Fictional Persistent Record");
      const surveys = await (
        await fetch(origin + "/api/surveys?view=records", {
          headers: { Cookie: cookie },
        })
      ).json();
      assert.equal(surveys.total, 1);
      assert.equal(surveys.rows[0].confirmedMemberId, "PERSISTENCE-FAKE");
      assert.equal(surveys.rows[0].zbi, 12);
    } finally {
      await stop();
    }
  },
);
