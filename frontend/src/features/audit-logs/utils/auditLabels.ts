/** Nhãn tiếng Việt cho mã hành động lưu trong nhật ký. Mã chưa biết hiển thị nguyên văn. */
const ACTIONS: Record<string, string> = {
  CONTRACT_CREATED: 'Tạo hợp đồng',
  CONTRACT_UPDATED: 'Sửa hợp đồng',
  CONTRACT_CANCELLED: 'Hủy hợp đồng',
  CONTRACT_SUBMITTED: 'Trình duyệt hợp đồng',
  CONTRACT_FILE_ADDED: 'Thêm tệp hợp đồng',
  CONTRACT_FILE_REMOVED: 'Xóa tệp hợp đồng',
  CANCELLATION_REQUESTED: 'Yêu cầu hủy hợp đồng',
  CANCELLATION_DECIDED: 'Quyết định hủy hợp đồng',
  CUSTOMER_INACTIVE: 'Ngừng hoạt động khách hàng',
  AREA_INACTIVE: 'Khu vực ngừng hoạt động',
  AREA_CREATED: 'Tạo khu vực',
  AREA_UPDATED: 'Cập nhật khu vực',
  AREA_PARENT_CHANGED: 'Đổi khu vực cha',
  AREA_STATUS_CHANGED: 'Đổi trạng thái khu vực',
  AREA_STAFF_ASSIGNED: 'Phân công nhân sự',
  AREA_STAFF_ENDED: 'Kết thúc phân công nhân sự',
  AREA_SERVICES_UPDATED: 'Cập nhật dịch vụ khai thác',
  REVIEW_ACCEPTED: 'Tiếp nhận rà soát',
  REVIEW_HANDED_OFF: 'Trình Ban Giám đốc',
  REVIEW_APPROVED: 'Chấp thuận / phê duyệt',
  REVIEW_REVISION_REQUESTED: 'Yêu cầu chỉnh sửa',
  REVIEW_REJECTED: 'Từ chối hồ sơ',
  APPROVER_ASSIGNED: 'Phân công người duyệt',
  APPROVER_REASSIGNED: 'Đổi người duyệt',
  COORDINATION_REQUESTED: 'Yêu cầu phối hợp phòng ban',
  COORDINATION_REPLIED: 'Phản hồi phối hợp',
  LOGIN_SUCCESS: 'Đăng nhập',
  LOGIN_FAILED: 'Đăng nhập thất bại',
  LOGOUT: 'Đăng xuất',
  PASSWORD_CHANGED: 'Đổi mật khẩu',
  PASSWORD_RESET: 'Đặt lại mật khẩu qua OTP',
  AUDIT_SEARCHED: 'Tra cứu nhật ký',
  AUDIT_VIEWED: 'Xem chi tiết nhật ký',
  AUDIT_MUTATION_REJECTED: 'Từ chối sửa nhật ký',
  // Tên cũ: audit_log chỉ ghi thêm, các dòng ghi trước khi đổi tên vẫn giữ mã này.
  CREATE: 'Tạo khu vực',
  UPDATE: 'Cập nhật khu vực',
  CHANGE_PARENT: 'Đổi khu vực cha',
  CHANGE_STATUS: 'Đổi trạng thái khu vực',
  ASSIGN_STAFF: 'Phân công nhân sự',
  END_STAFF: 'Kết thúc phân công nhân sự',
  SET_SERVICES: 'Cập nhật dịch vụ khai thác',
  accept: 'Tiếp nhận rà soát',
  handoff: 'Trình Ban Giám đốc',
  approve: 'Chấp thuận / phê duyệt',
  revision: 'Yêu cầu chỉnh sửa',
  reject: 'Từ chối hồ sơ',
  assign: 'Phân công người duyệt',
  reassign: 'Đổi người duyệt',
  'coordination-request': 'Yêu cầu phối hợp phòng ban',
  'coordination-reply': 'Phản hồi phối hợp',
  'audit.search': 'Tra cứu nhật ký',
  'audit.view': 'Xem chi tiết nhật ký',
  'audit.mutation-rejected': 'Từ chối sửa nhật ký',
};

/** Nhãn loại đối tượng. */
const ENTITY_TYPES: Record<string, string> = {
  Contract: 'Hợp đồng',
  ContractApproval: 'Duyệt hợp đồng',
  ContractApprovalAssignment: 'Phân công người duyệt',
  ContractCoordination: 'Phối hợp phòng ban',
  Area: 'Khu vực',
  UserAccount: 'Tài khoản',
  AuditLog: 'Nhật ký',
};

export function actionLabel(action: string): string {
  return ACTIONS[action] ?? action;
}

export function entityTypeLabel(type: string): string {
  return ENTITY_TYPES[type] ?? type;
}

/** Hiển thị một giá trị JSON trong bảng trước/sau. */
export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value, null, 2);
}
