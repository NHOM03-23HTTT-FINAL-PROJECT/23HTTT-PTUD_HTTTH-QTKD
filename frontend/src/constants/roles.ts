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
  | 'customers.update'
  /** Tạm ngưng / kích hoạt lại khách hàng (UC-CUS-03 / 04) – chỉ Trưởng phòng Kinh doanh. */
  | 'customers.change-status'
  | 'contracts.view'
  | 'contracts.create'
  | 'approvals.track'
  | 'approvals.review-legal'
  | 'approvals.approve'
  /** Phân công người duyệt cho bước của bộ phận mình (SYS-CTR-10) – trưởng bộ phận; BE kiểm tra department.manager_id. */
  | 'approvals.assign'
  | 'areas.view'
  /** Tạo mới khu vực (UC-ARE-01) – Trưởng phòng và Nhân viên Khai thác được phân quyền. */
  | 'areas.create'
  /** Cập nhật thông tin, điều chỉnh phân cấp (UC-ARE-04 / UC-ARE-02) – Trưởng phòng và Nhân viên Khai thác được giao quyền. */
  | 'areas.update'
  /** Phân công nhân sự, gán dịch vụ, tạm ngưng/mở lại khu vực – chỉ Trưởng phòng Khai thác (13.1 / 13.3 / 13.4). */
  | 'areas.manage'
  | 'payments.view'
  | 'users.manage'
  | 'departments.manage'
  | 'roles.manage'
  | 'workflows.manage'
  | 'audit.view'
  | 'catalogs.manage';

export type RoleCode = 'NV_KD' | 'TP_KD' | 'TP_KT' | 'NV_KT' | 'NV_KTOAN' | 'NV_PC' | 'TP_PC' | 'GD' | 'TGD' | 'QTHT';

/** Vai trò duyệt từng bước: nhân viên và trưởng phòng của bộ phận đó (trưởng phòng có thêm tab phân công). */
export const LEGAL_ROLES: RoleCode[] = ['NV_PC', 'TP_PC'];
export const BOARD_ROLES: RoleCode[] = ['GD', 'TGD'];

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
    permissions: ['customers.view', 'customers.create', 'customers.update', 'contracts.view', 'contracts.create', 'approvals.track', 'areas.view'],
  },
  TP_KD: {
    code: 'TP_KD',
    name: 'Trưởng phòng Kinh doanh',
    department: 'KD',
    permissions: [
      'customers.view',
      'customers.update',
      'customers.change-status',
      'contracts.view',
      'approvals.track',
      'approvals.approve',
      'approvals.assign',
      'areas.view',
    ],
  },
  TP_KT: {
    code: 'TP_KT',
    name: 'Trưởng phòng Khai thác',
    department: 'KT',
    permissions: ['areas.view', 'areas.create', 'areas.update', 'areas.manage'],
  },
  NV_KT: {
    code: 'NV_KT',
    name: 'Nhân viên Khai thác',
    department: 'KT',
    // Tác nhân "Nhân viên Khai thác được phân quyền" của UC-ARE-01/02/04; không có thao tác chỉ dành cho Trưởng phòng.
    permissions: ['areas.view', 'areas.create', 'areas.update'],
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
  TP_PC: {
    code: 'TP_PC',
    name: 'Trưởng phòng Pháp chế',
    department: 'PC',
    // Giao diện như Nhân viên Pháp chế, thêm tab "Phân công người duyệt" (SYS-CTR-10).
    permissions: ['contracts.view', 'approvals.track', 'approvals.review-legal', 'approvals.assign'],
  },
  GD: {
    code: 'GD',
    name: 'Giám đốc',
    department: 'BGD',
    permissions: ['contracts.view', 'approvals.track', 'approvals.approve'],
  },
  TGD: {
    code: 'TGD',
    name: 'Tổng Giám đốc',
    department: 'BGD',
    // Giao diện như thành viên Ban Giám đốc, thêm tab "Phân công người duyệt" (SYS-CTR-10).
    permissions: ['contracts.view', 'approvals.track', 'approvals.approve', 'approvals.assign'],
  },
  QTHT: {
    code: 'QTHT',
    name: 'Quản trị hệ thống',
    department: 'QTHT',
    permissions: ['users.manage', 'departments.manage', 'roles.manage', 'workflows.manage', 'audit.view', 'catalogs.manage'],
  },
};

/** Adapter mock nhận đúng một role; API mode lấy permissions từ BE thay vì hàm này. */
export function mergePermissions(roleCodes: RoleCode[]): Set<Permission> {
  return new Set(roleCodes.flatMap((code) => ROLES[code].permissions));
}
