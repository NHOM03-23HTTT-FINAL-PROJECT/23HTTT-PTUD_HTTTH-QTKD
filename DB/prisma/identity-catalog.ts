import type { Prisma, UserRole } from "../generated/prisma/client.ts";
export const IDENTITY_ROLES: { code: UserRole; name: string; departmentCode: string; permissions: string[] }[] = [
  { code: "SalesStaff", name: "Nhân viên Kinh doanh", departmentCode: "KD", permissions: ["customers.view", "customers.create", "customers.update", "contracts.view", "contracts.create", "approvals.track", "areas.view"] },
  { code: "SalesManager", name: "Trưởng phòng Kinh doanh", departmentCode: "KD", permissions: ["customers.view", "customers.update", "customers.change-status", "contracts.view", "approvals.track", "approvals.approve", "areas.view"] },
  { code: "OperationsStaff", name: "Nhân viên Khai thác", departmentCode: "KT", permissions: ["areas.view", "areas.create", "areas.update"] },
  { code: "OperationsManager", name: "Trưởng phòng Khai thác", departmentCode: "KT", permissions: ["areas.view", "areas.create", "areas.update", "areas.manage"] },
  { code: "Accountant", name: "Nhân viên Kế toán", departmentCode: "KTOAN", permissions: [] },
  { code: "LegalStaff", name: "Nhân viên Pháp chế", departmentCode: "PC", permissions: ["contracts.view", "approvals.track", "approvals.review-legal"] },
  { code: "BoardMember", name: "Ban Giám đốc", departmentCode: "BGD", permissions: ["contracts.view", "approvals.track", "approvals.approve"] },
  { code: "SystemAdmin", name: "Quản trị hệ thống", departmentCode: "QTHT", permissions: ["users.manage", "departments.manage", "roles.manage", "workflows.manage", "audit.view", "catalogs.manage"] },
];
export function buildIdentitySeed() {
  return {
    roleDefinition: IDENTITY_ROLES.map(({ permissions: _, ...role }) => role) satisfies Prisma.RoleDefinitionCreateManyInput[],
    permission: [...new Set([...IDENTITY_ROLES.flatMap(role => role.permissions), "payments.view"])].sort().map(code => ({ code, name: code })) satisfies Prisma.PermissionCreateManyInput[],
    rolePermission: IDENTITY_ROLES.flatMap(role => role.permissions.map(permissionCode => ({ role: role.code, permissionCode }))) satisfies Prisma.RolePermissionCreateManyInput[],
  };
}
