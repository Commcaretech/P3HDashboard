import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync, backup } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
test("populated pre-upgrade SQLite snapshot restores and preserves every original value and relationship", async () => {
  const path = resolve("data", `preservation-${randomUUID()}.db`),
    d = new DatabaseSync(path);
  for (const name of [
    "202610110001_initial",
    "202610110002_assessment_dates",
    "202610120002_staff_workflows",
  ])
    d.exec(readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8"));
  d.exec(`INSERT INTO User(id,username,name,passwordHash) VALUES('u','fictional','Fictional','not-real');
 INSERT INTO Person(id,kind,memberId,dob,remarks,updatedAt) VALUES('p','Member','FICTIONAL','1950-02-28','Preserve fictional notes',CURRENT_TIMESTAMP);
 INSERT INTO Person(id,kind,name,updatedAt) VALUES('r','Care Recipient','Fictional Recipient',CURRENT_TIMESTAMP);
 INSERT INTO CareRelationship(id,memberId,recipientId,relationship) VALUES('link','p','r','Spouse');
 INSERT INTO SupportScheme(id,name) VALUES('scheme','Imported Scheme');
 INSERT INTO GrantApplication(id,schemeId,personId,status,nextReviewDate,notes,updatedAt) VALUES('grant','scheme','p','Legacy Imported Status','2027-01-05','Keep historical grant',CURRENT_TIMESTAMP);
 INSERT INTO Programme(id,name,updatedAt) VALUES('programme','Fictional programme',CURRENT_TIMESTAMP);
 INSERT INTO Participation(id,personId,programmeId,status) VALUES('participation','p','programme','Registered');
 INSERT INTO AuditLog(id,userId,action,entityType,entityId,changes) VALUES('audit','u','Historical','Member','p','{}');
 INSERT INTO Alert(id,title,personId,grantId,type,dueDate,status,notes) VALUES('alert','Fictional history','p','grant','Grant review','2026-01-01','Completed','Keep history');
 INSERT INTO Session(id,userId,expiresAt) VALUES('session','u','2027-01-01');
 INSERT INTO ImportBatch(id,filename,userId) VALUES('batch','fictional.xlsx','u');
 INSERT INTO ImportRow(id,batchId,rowNumber,action,memberId,raw) VALUES('row','batch',2,'Create','FICTIONAL','{}');`);
  const tables = d
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all()
    .map((r) => String(r.name));
  const snapshot = tables.map((table) => ({
    table,
    columns: d
      .prepare(`PRAGMA table_info("${table}")`)
      .all()
      .map((r) => String(r.name)),
    rows: d.prepare(`SELECT * FROM "${table}"`).all(),
  }));
  const restored = resolve("data", `restored-${randomUUID()}.db`);
  await backup(d, restored);
  d.close();
  const copy = new DatabaseSync(restored);
  assert.equal(
    copy.prepare("PRAGMA integrity_check").get()?.integrity_check,
    "ok",
  );
  copy.exec(
    readFileSync(
      "prisma/migrations/202610260001_follow_up_notifications/migration.sql",
      "utf8",
    ),
  );
  copy.exec(
    readFileSync(
      "prisma/migrations/202611040001_programme_sync/migration.sql",
      "utf8",
    ),
  );
  copy.exec(
    readFileSync(
      "prisma/migrations/202611040002_programme_review/migration.sql",
      "utf8",
    ),
  );
  copy.exec(
    readFileSync(
      "prisma/migrations/202611040003_interest_suggestions/migration.sql",
      "utf8",
    ),
  );
  copy.exec(
    readFileSync(
      "prisma/migrations/202611040004_workspace_maintenance/migration.sql",
      "utf8",
    ),
  );
  for (const { table, columns, rows } of snapshot)
    assert.deepEqual(
      copy
        .prepare(
          `SELECT ${columns.map((c) => `"${c}"`).join(",")} FROM "${table}"`,
        )
        .all(),
      rows,
      table,
    );
  assert.deepEqual(copy.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(
    copy.prepare("PRAGMA integrity_check").get()?.integrity_check,
    "ok",
  );
  copy.close();
});
