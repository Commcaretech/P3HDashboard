import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("cloud and local schemas have identical application models", () => {
  const local = readFileSync("prisma/schema.prisma", "utf8").replace(/\r\n/g, "\n");
  const cloud = readFileSync("prisma/cloud/schema.prisma", "utf8").replace(/\r\n/g, "\n");
  assert.equal(
    cloud,
    local.replace('provider = "sqlite"', 'provider = "postgresql"'),
  );
});
