// Isolated PostgreSQL SQL validation using a separately installed PGlite WASM
// engine. This does not test the deployed Prisma TCP/pooler connection.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
const moduleFile =
  process.argv[2] ||
  resolve(
    tmpdir(),
    "p3h-postgres-check/node_modules/@electric-sql/pglite/dist/index.js",
  );
const { PGlite } = await import(pathToFileURL(moduleFile).href);
const pg = new PGlite();
try {
  const folders = readdirSync("prisma/cloud/migrations")
    .filter((n) => n.startsWith("20"))
    .sort();
  for (const name of folders.filter((n) => n < "202611130001_surveys_outcomes"))
    await pg.exec(
      readFileSync(`prisma/cloud/migrations/${name}/migration.sql`, "utf8"),
    );
  await pg.exec(`INSERT INTO "User"(id,username,name,"passwordHash") VALUES('fake-user','fictional','Fictional','unused');
    INSERT INTO "Person"(id,kind,"memberId",name,"updatedAt") VALUES('fake-person','Member','FAKE-ONLY','Fictional',CURRENT_TIMESTAMP),('fake-recipient','Care Recipient',NULL,'Fictional Recipient',CURRENT_TIMESTAMP);
    INSERT INTO "CareRelationship"(id,"memberId","recipientId",relationship) VALUES('fake-link','fake-person','fake-recipient','Family');
    INSERT INTO "SupportScheme"(id,name) VALUES('fake-scheme','CHAS');
    INSERT INTO "GrantApplication"(id,"schemeId","personId","updatedAt") VALUES('fake-grant','fake-scheme','fake-person',CURRENT_TIMESTAMP);
    INSERT INTO "Programme"(id,name,"updatedAt") VALUES('fake-programme','Fictional',CURRENT_TIMESTAMP);
    INSERT INTO "Alert"(id,title,type,"dueDate","personId","grantId") VALUES('fake-alert','Fictional','Grant review',CURRENT_TIMESTAMP,'fake-person','fake-grant');
    INSERT INTO "AuditLog"(id,"userId",action,"entityType","entityId",changes) VALUES('fake-audit','fake-user','Fictional','Member','fake-person','{}');`);
  const tables = (
    await pg.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows.map((r) => r.tablename);
<<<<<<< HEAD
  const originalColumns = new Map();
  for (const table of tables)
    originalColumns.set(
      table,
      (
        await pg.query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
          [table],
        )
      ).rows.map((r) => r.column_name),
    );
=======
>>>>>>> 60d3afc9e4413702748b4ab0a3577b1dea7bece4
  const before = new Map();
  for (const table of tables)
    before.set(
      table,
      JSON.stringify((await pg.query(`SELECT * FROM "${table}"`)).rows),
    );
  await pg.exec(
    readFileSync(
      "prisma/cloud/migrations/202611130001_surveys_outcomes/migration.sql",
      "utf8",
    ),
  );
<<<<<<< HEAD
  for (const name of folders.filter((n) => n > "202611130001_surveys_outcomes"))
    await pg.exec(
      readFileSync(`prisma/cloud/migrations/${name}/migration.sql`, "utf8"),
    );
  for (const table of tables)
    assert.equal(
      JSON.stringify(
        (
          await pg.query(
            `SELECT ${originalColumns
              .get(table)
              .map((c) => `"${c}"`)
              .join(",")} FROM "${table}"`,
          )
        ).rows,
      ),
=======
  for (const table of tables)
    assert.equal(
      JSON.stringify((await pg.query(`SELECT * FROM "${table}"`)).rows),
>>>>>>> 60d3afc9e4413702748b4ab0a3577b1dea7bece4
      before.get(table),
      `Preserve ${table}`,
    );
  await pg.exec(`INSERT INTO "SurveyImportBatch"(id,filename,language,centre,"uploadedBy",summary) VALUES('batch','fictional.csv','English','Centre A','fake-user','{"saved":1}');
    INSERT INTO "SurveyResponse"(id,"batchId","sourceKey","contentHash","rowNumber",centre,language,"submittedName","cleanedName","timestampText","personId","rawAnswers",answers,method,warnings,physical,"updatedAt") VALUES('survey','batch','source','hash',2,'Centre A','English','Fictional','Fictional','2026-11-13','fake-person','{"Q1":"3"}','{"Q1":3}','P3H_WHOQOL_ZBI6_v1_complete_domains','[]',50,CURRENT_TIMESTAMP);
    INSERT INTO "PersonAlias"(id,"personId",text,normalized,"verifiedBy") VALUES('alias','fake-person','Fictional Alias','fictional alias','fake-user');
    INSERT INTO "SurveyIdentityReview"(id,"responseId",action,"reviewedBy") VALUES('review','survey','Linked','fake-user');`);
  assert.equal(
    (
      await pg.query(
        "SELECT AVG(physical) AS score FROM \"SurveyResponse\" WHERE warnings='[]'::jsonb",
      )
    ).rows[0].score,
    50,
  );
  await assert.rejects(
    pg.exec(
      `INSERT INTO "PersonAlias"(id,"personId",text,normalized,"verifiedBy") VALUES('bad','missing','Alias','alias','fake-user')`,
    ),
  );
  await assert.rejects(
    pg.exec(
<<<<<<< HEAD
      `INSERT INTO "SurveyResponse"(id,"batchId","sourceKey","contentHash","sourceResponseId","rowNumber",centre,language,"submittedName","cleanedName","timestampText","surveyDate","dobText",dob,"phaseText",phase,"personId","confirmedMemberId","matchStatus","rawAnswers",answers,method,warnings,physical,psychological,social,environment,overall,zbi,"createdAt","updatedAt") SELECT 'duplicate',"batchId","sourceKey","contentHash","sourceResponseId","rowNumber",centre,language,"submittedName","cleanedName","timestampText","surveyDate","dobText",dob,"phaseText",phase,"personId","confirmedMemberId","matchStatus","rawAnswers",answers,method,warnings,physical,psychological,social,environment,overall,zbi,"createdAt","updatedAt" FROM "SurveyResponse" WHERE id='survey'`,
=======
      `INSERT INTO "SurveyResponse" SELECT 'duplicate',"batchId","sourceKey","contentHash","sourceResponseId","rowNumber",centre,language,"submittedName","cleanedName","timestampText","surveyDate","dobText",dob,"phaseText",phase,"personId","confirmedMemberId","matchStatus","rawAnswers",answers,method,warnings,physical,psychological,social,environment,overall,zbi,"createdAt","updatedAt" FROM "SurveyResponse" WHERE id='survey'`,
>>>>>>> 60d3afc9e4413702748b4ab0a3577b1dea7bece4
    ),
  );
  console.log(
    JSON.stringify({
      engine: "Isolated PGlite PostgreSQL WASM",
      migrations: folders.length,
      originalTablesPreserved: tables.length,
      newTables: 4,
      foreignKeys: true,
      sourceUniqueness: true,
      jsonAndNumericAggregation: true,
      prismaNetworkConnection: "not tested",
    }),
  );
} finally {
  await pg.close();
}
