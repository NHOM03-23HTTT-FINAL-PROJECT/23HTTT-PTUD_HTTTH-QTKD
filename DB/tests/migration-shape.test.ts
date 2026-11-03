import assert from "node:assert/strict";
import { test } from "node:test";
import { migrationColumns, migrationEnums, migrationPrimaryKeys } from "../scripts/migration-shape.ts";

test("migration comparison handles qtkd qualification and Windows line endings", () => {
  const plain = 'CREATE TABLE "example" (\n "role" "user_role" NOT NULL\n);';
  const qualified = 'CREATE TABLE "qtkd"."example" (\r\n "role" "qtkd"."user_role" NOT NULL\r\n);';
  assert.deepEqual(migrationColumns(plain), migrationColumns(qualified));
});
test("additive columns followed by SET NOT NULL match a fresh schema", () => {
  const base = 'CREATE TABLE "example" (\n "id" UUID NOT NULL\n);';
  const migrated = base + '\nALTER TABLE "qtkd"."example" ADD COLUMN "code" VARCHAR(16);\nALTER TABLE "qtkd"."example" ALTER COLUMN "code" SET NOT NULL;';
  const target = 'CREATE TABLE "example" (\n "id" UUID NOT NULL,\n "code" VARCHAR(16) NOT NULL\n);';
  assert.deepEqual(migrationColumns(migrated), migrationColumns(target));
});
test("column types and nullability remain significant", () => {
  const expected = 'CREATE TABLE "example" (\n "code" VARCHAR(16) NOT NULL\n);';
  assert.notDeepEqual(migrationColumns(expected), migrationColumns(expected.replace('VARCHAR(16)', 'TEXT')));
  assert.notDeepEqual(migrationColumns(expected), migrationColumns(expected.replace(' NOT NULL', '')));
});

test("future assignee can become nullable through an additive migration", () => {
  const base = 'CREATE TABLE "example" (\n "assignee_id" UUID NOT NULL\n);';
  const migrated = base + '\nALTER TABLE "qtkd"."example" ALTER COLUMN "assignee_id" DROP NOT NULL;';
  assert.deepEqual(migrationColumns(migrated), migrationColumns(base.replace(' NOT NULL', '')));
  assert.deepEqual(migrationColumns(migrated + '\nALTER TABLE "example" ALTER COLUMN "assignee_id" SET NOT NULL;'), migrationColumns(base));
  assert.throws(() => migrationColumns(base + '\nALTER TABLE "example" ALTER COLUMN "missing" DROP NOT NULL;'), /example\.missing/);
});
test("an ALTER for a missing column is rejected with its location", () => {
  assert.throws(() => migrationColumns('CREATE TABLE "example" (\n "id" UUID\n);\nALTER TABLE "example" ALTER COLUMN "missing" SET NOT NULL;'), /example\.missing/);
});
test("primary key list spacing is insignificant but column order is significant", () => {
  const compact = 'CONSTRAINT "example_pkey" PRIMARY KEY ("role","permission_code")';
  assert.deepEqual(migrationPrimaryKeys(compact), migrationPrimaryKeys(compact.replace(',', ', ')));
  assert.notDeepEqual(migrationPrimaryKeys(compact), migrationPrimaryKeys('CONSTRAINT "example_pkey" PRIMARY KEY ("permission_code","role")'));
});
test("a dropped table no longer appears in the migrated shape", () => {
  const created = 'CREATE TABLE "example" (\n "id" UUID NOT NULL\n);\nCREATE TABLE "qtkd"."gone" (\n "id" UUID NOT NULL\n);';
  assert.deepEqual(migrationColumns(created + '\nDROP TABLE IF EXISTS "qtkd"."gone";'), migrationColumns('CREATE TABLE "example" (\n "id" UUID NOT NULL\n);'));
});
test("enum values added by ALTER TYPE match the final schema order", () => {
  const base = 'CREATE TYPE "qtkd"."role" AS ENUM (\'A\', \'B\', \'C\');';
  const migrated = base + '\nALTER TYPE "qtkd"."role" ADD VALUE IF NOT EXISTS \'A2\' AFTER \'A\';';
  assert.deepEqual(migrationEnums(migrated), migrationEnums('CREATE TYPE "role" AS ENUM (\'A\', \'A2\', \'B\', \'C\');'));
  assert.notDeepEqual(migrationEnums(migrated), migrationEnums('CREATE TYPE "role" AS ENUM (\'A\', \'B\', \'C\', \'A2\');'));
});
