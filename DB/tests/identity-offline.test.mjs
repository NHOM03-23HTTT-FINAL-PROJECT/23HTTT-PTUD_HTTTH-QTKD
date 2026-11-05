import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { ROLES } from '../../frontend/src/constants/roles.ts';

const text = file => readFileSync(new URL(file, import.meta.url), 'utf8');
// Identity catalog = role_definition / permission / role_permission rows of the demo fixture used by QTKD.DbTool seed.
const fixture = JSON.parse(text('../../backend/src/QTKD.Infrastructure/Persistence/Seed/demo-seed.json'));
const roles = fixture.tables.role_definition;
const grants = fixture.tables.role_permission;
const permissionsOf = code => grants.filter(grant => grant.role === code).map(grant => grant.permission_code).toSorted();

test('seed grants, FE role display and BE role codes match the accepted matrix', () => {
  const contracts = text('../../backend/src/QTKD.Application/Features/Identity/Contracts.cs');
  const mapping = Object.fromEntries([...contracts.matchAll(/\[UserRole\.(\w+)\] = "(\w+)"/g)].map(match => [match[1], match[2]]));
  assert.equal(roles.length, 10);
  for (const role of roles) {
    const frontend = ROLES[mapping[role.code]];
    assert.equal(frontend.department, role.department_code);
    assert.deepEqual(frontend.permissions.toSorted(), permissionsOf(role.code));
  }
  assert.equal(permissionsOf('Accountant').length, 0);
});
test('migration bootstraps the same grants as seed; backend catalog contains those permissions', () => {
  // Grants bootstrapped by 0003 plus grants added later in the same `SELECT 'Role', unnest(ARRAY[...])` form.
  const sql = ['202611020003_identity', '202611030004_approval_assignment']
    .map(name => text('../../backend/src/QTKD.Infrastructure/Persistence/Migrations/Sql/' + name + '.sql')).join('\n');
  for (const role of roles) {
    const matches = [...sql.matchAll(new RegExp("SELECT '" + role.code + "', unnest\\(ARRAY\\[([^\\]]*)\\]", 'g'))];
    const permissions = matches.flatMap(match => [...match[1].matchAll(/'([^']+)'/g)].map(value => value[1]));
    assert.deepEqual(permissions.toSorted(), permissionsOf(role.code));
  }
  const policies = text('../../backend/src/QTKD.Api/Authorization/IdentityPolicies.cs');
  const codes = [...policies.match(/Codes = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(codes.toSorted(), fixture.tables.permission.map(permission => permission.code).toSorted());
});
// Dictionary column coverage moved to backend DatabaseToolingTests (EF model ↔ data-dictionary/source-columns.json).
test('FE auth source contains no normal missing-role branch or unassigned mock accounts', () => {
  const root = new URL('../../frontend/src/', import.meta.url);
  function inspect(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) inspect(file);
      else if (/\.tsx?$/.test(entry.name)) assert.doesNotMatch(readFileSync(file, 'utf8'), /NO_ROLE|no-role/);
    }
  }
  inspect(root);
  assert.doesNotMatch(text('../../frontend/src/mocks/seed/users.ts'), /u-thao-nt|u-khoa-pv/);
});
