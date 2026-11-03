import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { buildIdentitySeed } from '../prisma/identity-catalog.ts';
import { ROLES } from '../../frontend/src/constants/roles.ts';

const text = file => readFileSync(new URL(file, import.meta.url), 'utf8');
test('seed grants, FE role display and BE role codes match the accepted matrix', () => {
  const seed = buildIdentitySeed();
  const contracts = text('../../backend/src/QTKD.Application/Features/Identity/Contracts.cs');
  const mapping = Object.fromEntries([...contracts.matchAll(/\[UserRole\.(\w+)\] = "(\w+)"/g)].map(match => [match[1], match[2]]));
  assert.equal(seed.roleDefinition.length, 10);
  for (const role of seed.roleDefinition) {
    const frontend = ROLES[mapping[role.code]];
    assert.equal(frontend.department, role.departmentCode);
    assert.deepEqual(frontend.permissions.toSorted(), seed.rolePermission.filter(grant => grant.role === role.code).map(grant => grant.permissionCode).toSorted());
  }
  assert.equal(seed.rolePermission.filter(grant => grant.role === 'Accountant').length, 0);
});
test('migration bootstraps the same grants as seed; backend catalog contains those permissions', () => {
  const seed = buildIdentitySeed();
  // Grants bootstrapped by 0003 plus grants added later in the same `SELECT 'Role', unnest(ARRAY[...])` form.
  const sql = ['202611020003_identity', '202611030004_approval_assignment'].map(name => text('../prisma/migrations/' + name + '/migration.sql')).join('\n');
  for (const role of seed.roleDefinition) {
    const matches = [...sql.matchAll(new RegExp("SELECT '" + role.code + "', unnest\\(ARRAY\\[([^\\]]*)\\]", 'g'))];
    const permissions = matches.flatMap(match => [...match[1].matchAll(/'([^']+)'/g)].map(value => value[1]));
    assert.deepEqual(permissions.toSorted(), seed.rolePermission.filter(grant => grant.role === role.code).map(grant => grant.permissionCode).toSorted());
  }
  const policies = text('../../backend/src/QTKD.Api/Authorization/IdentityPolicies.cs');
  const codes = [...policies.match(/Codes = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(codes.toSorted(), seed.permission.map(permission => permission.code).toSorted());
});
test('dictionary columns remain present and Identity additions do not remove mandatory role', () => {
  const schema = text('../prisma/schema.prisma');
  const models = new Map([...schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)].map(match => [match[1], match[2]]));
  assert.equal(models.size, 29);
  const tables = new Map([...models.values()].map(body => [body.match(/@@map\("([^"]+)"\)/)[1], body]));
  const source = JSON.parse(text('../data-dictionary/source-columns.json'));
  for (const [table, columns] of Object.entries(source.tables))
    for (const column of columns) assert(tables.get(table).includes('@map("' + column + '")'), table + '.' + column);
  assert.match(models.get('UserAccount'), /^\s*role\s+UserRole\s+@map/m);
  assert.deepEqual([...tables.keys()].filter(table => !source.tables[table]).toSorted(), ['permission', 'role_definition', 'role_permission']);
});
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
