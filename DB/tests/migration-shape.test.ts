import assert from "node:assert/strict";
import { test } from "node:test";
import { migrationColumns, migrationPrimaryKeys } from "../scripts/migration-shape.ts";

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
test("an ALTER for a missing column is rejected with its location", () => {
  assert.throws(() => migrationColumns('CREATE TABLE "example" (\n "id" UUID\n);\nALTER TABLE "example" ALTER COLUMN "missing" SET NOT NULL;'), /example\.missing/);
});
test("primary key list spacing is insignificant but column order is significant", () => {
  const compact = 'CONSTRAINT "example_pkey" PRIMARY KEY ("role","permission_code")';
  assert.deepEqual(migrationPrimaryKeys(compact), migrationPrimaryKeys(compact.replace(',', ', ')));
  assert.notDeepEqual(migrationPrimaryKeys(compact), migrationPrimaryKeys('CONSTRAINT "example_pkey" PRIMARY KEY ("permission_code","role")'));
});
