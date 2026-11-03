import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSeedData } from "../prisma/seed-data.js";
import { buildIdentitySeed } from "../prisma/identity-catalog.js";
import { validateSeedData } from "../scripts/validate-seed.js";

test("all demo users have one role and matching department; zero grants is valid", () => {
  const data = buildSeedData("OFFLINE_ONLY_NOT_A_PASSWORD_HASH");
  assert.equal(data.roleDefinition.length, 10);
  assert(data.userAccount.every(user => typeof user.role === "string"));
  assert.equal(data.rolePermission.filter(grant => grant.role === "Accountant").length, 0);
  validateSeedData(data);
});
test("role/department mismatch is rejected before seeding", () => {
  const data = buildSeedData("OFFLINE_ONLY_NOT_A_PASSWORD_HASH");
  data.userAccount[0].departmentId = data.department.find(department => department.code === "KTOAN")!.departmentId;
  assert.throws(() => validateSeedData(data), /role\/department/);
});
test("grants reference catalog permissions and preserve administrative capabilities", () => {
  const seed = buildIdentitySeed();
  const permissions = new Set(seed.permission.map(permission => permission.code));
  for (const grant of seed.rolePermission) assert(permissions.has(grant.permissionCode));
  for (const code of ["users.manage", "roles.manage", "departments.manage"])
    assert(seed.rolePermission.some(grant => grant.role === "SystemAdmin" && grant.permissionCode === code));
});
