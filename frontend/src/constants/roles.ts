/** Phân hệ (collection "Phân hệ" trên Figma) quyết định màu nhấn và trang làm việc mặc định. */
export type WorkspaceKey = 'kinh-doanh' | 'khai-thac' | 'ke-toan' | 'phap-che' | 'bgd' | 'quan-tri';

export type DepartmentCode = 'KD' | 'KT' | 'KTOAN' | 'PC' | 'BGD' | 'QTHT';

export type Department = {
  code: DepartmentCode;
  name: string;
  shortName: string;
  workspace: WorkspaceKey;
};

export const DEPARTMENTS: Record<DepartmentCode, Department> = {
  KD: { code: 'KD', name: 'Phòng Kinh doanh', shortName: 'Kinh doanh', workspace: 'kinh-doanh' },
  KT: { code: 'KT', name: 'Phòng Khai thác', shortName: 'Khai thác', workspace: 'khai-thac' },
  KTOAN: { code: 'KTOAN', name: 'Phòng Kế toán', shortName: 'Kế toán', workspace: 'ke-toan' },
  PC: { code: 'PC', name: 'Phòng Pháp chế', shortName: 'Pháp chế', workspace: 'phap-che' },
  BGD: { code: 'BGD', name: 'Ban Giám đốc', shortName: 'Ban Giám đốc', workspace: 'bgd' },
  QTHT: { code: 'QTHT', name: 'Quản trị hệ thống', shortName: 'Quản trị hệ thống', workspace: 'quan-tri' },
};

export type Permission =
  | 'customers.view'
  | 'customers.create'
  | 'contracts.view'
  | 'contracts.create'
  | 'approvals.track'
  | 'approvals.review-legal'
  | 'approvals.approve'
  | 'areas.view'
  | 'areas.manage'
  | 'payments.view'
  | 'users.manage'
  | 'roles.manage'
  | 'workflows.manage'
  | 'audit.view'
  | 'catalogs.manage';

export type RoleCode = 'NV_KD' | 'TP_KD' | 'TP_KT' | 'NV_KTOAN' | 'NV_PC' | 'GD' | 'QTHT';

export type Role = {
  code: RoleCode;
  name: string;
  department: DepartmentCode;
  permissions: Permission[];
};

/*
 * Bảng quyền dùng cho prototype FE. Ẩn menu/nút ở FE chỉ phục vụ hiển thị; khi có BE,
 * BE vẫn là nơi quyết định quyền (AGENTS.md).
 */
export const ROLES: Record<RoleCode, Role> = {
  NV_KD: {
    code: 'NV_KD',
    name: 'Nhân viên Kinh doanh',
    department: 'KD',
    permissions: ['customers.view', 'customers.create', 'contracts.view', 'contracts.create', 'approvals.track', 'areas.view'],
  },
  TP_KD: {
    code: 'TP_KD',
    name: 'Trưởng phòng Kinh doanh',
    department: 'KD',
    permissions: ['customers.view', 'contracts.view', 'approvals.track', 'approvals.approve', 'areas.view'],
  },
  TP_KT: {
    code: 'TP_KT',
    name: 'Trưởng phòng Khai thác',
    department: 'KT',
    permissions: ['areas.view', 'areas.manage'],
  },
  NV_KTOAN: {
    code: 'NV_KTOAN',
    name: 'Nhân viên Kế toán',
    department: 'KTOAN',
    // Sprint 1 chưa cấp chức năng nghiệp vụ cho Kế toán (ghi chú màn 05.3).
    permissions: [],
  },
  NV_PC: {
    code: 'NV_PC',
    name: 'Nhân viên Pháp chế',
    department: 'PC',
    permissions: ['contracts.view', 'approvals.track', 'approvals.review-legal'],
  },
  GD: {
    code: 'GD',
    name: 'Giám đốc',
    department: 'BGD',
    permissions: ['contracts.view', 'approvals.track', 'approvals.approve'],
  },
  QTHT: {
    code: 'QTHT',
    name: 'Quản trị hệ thống',
    department: 'QTHT',
    permissions: ['users.manage', 'roles.manage', 'workflows.manage', 'audit.view', 'catalogs.manage'],
  },
};

/** Người dùng nhiều vai trò được hợp nhất quyền (ghi chú hàng "Trang làm việc theo phòng ban"). */
export function mergePermissions(roleCodes: RoleCode[]): Set<Permission> {
  return new Set(roleCodes.flatMap((code) => ROLES[code].permissions));
}
