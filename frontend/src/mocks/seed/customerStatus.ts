import type { CatalogOption } from '@/features/customers/types/customer';
import type { ImpactItem, ReactivationCheck } from '@/features/customers/types/customerStatus';

/** Nhóm lý do tạm ngưng (frame 03.1). Danh mục mẫu; danh mục thật do Quản trị hệ thống quản lý. */
export const SUSPENSION_REASON_GROUPS: CatalogOption[] = [
  { code: 'CONG_NO', label: 'Công nợ quá hạn' },
  { code: 'VI_PHAM_HD', label: 'Vi phạm điều khoản hợp đồng' },
  { code: 'TRANH_CHAP', label: 'Tranh chấp đang giải quyết' },
  { code: 'VAN_HANH', label: 'Vấn đề vận hành, an toàn' },
  { code: 'DE_NGHI_KH', label: 'Theo đề nghị của khách hàng' },
  { code: 'KHAC', label: 'Lý do khác' },
];

const CONTRACT_OPTIONS = ['Rà soát điều khoản tạm ngưng', 'Tiếp tục thực hiện đến hết hiệu lực', 'Đề xuất chấm dứt theo hợp đồng'];
const JOB_OPTIONS = ['Hoàn tất lệnh, không nhận lệnh mới', 'Dừng lệnh chưa bắt đầu'];
const SERVICE_OPTIONS = ['Lập bảng thanh toán (US-CUS-16)', 'Đối soát trước khi lập bảng thanh toán'];
const APPROVAL_OPTIONS = ['Giữ nguyên lượt duyệt', 'Người lập rút hồ sơ khỏi luồng duyệt'];

/*
 * Hồ sơ/công việc còn mở của khách hàng mà bước rà soát tạm ngưng phải hiển thị. Khi có BE, dữ liệu này lấy từ
 * các phân hệ Hợp đồng, Khai thác, Sản lượng/Thanh toán và Phê duyệt.
 */
export const SEED_IMPACTS: Record<string, ImpactItem[]> = {
  'KH-000276': [
    {
      id: 'imp-276-1',
      kind: 'contract',
      kindNote: 'Còn hiệu lực',
      code: 'HD-2025-044',
      title: 'HD-2025-044 · Vận hành thiết bị nâng',
      detail: 'Hiệu lực đến 31/12/2026',
      statusLabel: 'Active',
      statusTone: 'success',
      department: 'Pháp chế',
      options: CONTRACT_OPTIONS,
      planNote: 'Hợp đồng giữ trạng thái Active',
    },
    {
      id: 'imp-276-2',
      kind: 'job',
      kindNote: 'Đang thực hiện',
      code: 'LH-1029',
      title: 'Lệnh nâng hạ LH-1029 · Bến 2',
      detail: 'Bắt đầu 26/10/2026',
      statusLabel: 'Đang thực hiện',
      statusTone: 'info',
      department: 'Khai thác',
      options: JOB_OPTIONS,
      planNote: 'Khai thác',
    },
    {
      id: 'imp-276-3',
      kind: 'service',
      kindNote: 'Chưa tính phí',
      code: 'Sản lượng T10/2026',
      title: 'Sản lượng tháng 10/2026',
      detail: '1.240 tấn đã xác nhận',
      statusLabel: 'Chưa lập bảng TT',
      statusTone: 'warning',
      department: 'Kế toán',
      options: SERVICE_OPTIONS,
      planNote: 'Theo US-CUS-16, không cần kích hoạt lại',
    },
    {
      id: 'imp-276-4',
      kind: 'approval',
      kindNote: 'Đang duyệt',
      code: 'BG-2026-031',
      title: 'BG-2026-031 · Bảng giá dự thảo',
      detail: 'Đang ở bước Pháp chế',
      statusLabel: 'Chờ duyệt',
      statusTone: 'info',
      department: 'Kinh doanh',
      options: APPROVAL_OPTIONS,
      planNote: 'Không dùng để mở giao dịch mới',
    },
  ],
  'KH-000310': [
    {
      id: 'imp-310-1',
      kind: 'contract',
      kindNote: 'Còn hiệu lực',
      code: 'HD-2026-006',
      title: 'HD-2026-006 · Hợp đồng khung 24 tháng',
      detail: 'Hiệu lực đến 30/09/2028',
      statusLabel: 'Active',
      statusTone: 'success',
      department: 'Pháp chế',
      options: CONTRACT_OPTIONS,
      planNote: 'Hợp đồng giữ trạng thái Active',
    },
    {
      id: 'imp-310-2',
      kind: 'job',
      kindNote: 'Đang thực hiện',
      code: 'LH-1102',
      title: 'Lệnh khai thác LH-1102 · Bến 5',
      detail: 'Bắt đầu 29/10/2026',
      statusLabel: 'Đang thực hiện',
      statusTone: 'info',
      department: 'Khai thác',
      options: JOB_OPTIONS,
      planNote: 'Khai thác',
    },
  ],
  'KH-000305': [
    {
      id: 'imp-305-1',
      kind: 'service',
      kindNote: 'Chưa tính phí',
      code: 'Sản lượng T10/2026',
      title: 'Lưu kho lạnh tháng 10/2026',
      detail: '86 pallet đã xác nhận',
      statusLabel: 'Chưa lập bảng TT',
      statusTone: 'warning',
      department: 'Kế toán',
      options: SERVICE_OPTIONS,
      planNote: 'Theo US-CUS-16, không cần kích hoạt lại',
    },
  ],
};

/*
 * Giả lập tình huống của UC-CUS-03 / UC-CUS-04:
 * - KH-000310: không tải được danh sách công việc từ Khai thác ở lần rà soát đầu (03.4 – A4.4);
 * - KH-000305: lần xác nhận đầu của mỗi lượt lỗi lưu, được hoàn tác (03.8 – A8.1);
 * - KH-000311: lần xác nhận đầu đã ghi nhưng mất phản hồi (03.8 – A8.2);
 * - KH-000276: gửi thông báo cho Pháp chế thất bại, ghi nhận gửi lại (03.6 – A9);
 * - KH-000258: không tải được thông tin tạm ngưng ở lần mở đầu (04.6 – A2.1).
 */
export const SIMULATED_REVIEW_FAILURE_CODE = 'KH-000310';
export const SIMULATED_SUSPEND_SAVE_ERROR_CODE = 'KH-000305';
export const SIMULATED_SUSPEND_LOST_RESPONSE_CODE = 'KH-000311';
export const SIMULATED_NOTICE_FAILURE_CODE = 'KH-000276';
export const SIMULATED_REACTIVATION_LOAD_FAILURE_CODE = 'KH-000258';

/** Điều kiện kích hoạt lại đã có xác nhận của các bộ phận, theo khách hàng đang Tạm ngưng trong dữ liệu mẫu. */
export const SEED_REACTIVATION_CHECKS: Record<string, ReactivationCheck[]> = {
  'KH-000245': [
    { id: 'debt', label: 'Công nợ quá hạn chưa có xác nhận xử lý', status: 'unmet', detail: 'Còn kỳ 06–07/2026 chưa có xác nhận của Kế toán' },
    { id: 'dispute', label: 'Không còn tranh chấp hợp đồng', status: 'met', detail: 'Pháp chế xác nhận · Phạm Minh Đức · 24/10/2026' },
    { id: 'operation', label: 'Không còn vấn đề vận hành tồn đọng', status: 'met', detail: 'Khai thác xác nhận · Võ Thanh Sơn · 24/10/2026' },
  ],
  'KH-000233': [
    { id: 'debt', label: 'Công nợ quá hạn đã được thanh toán', status: 'met', detail: 'Kế toán xác nhận · Bùi Thu Hà · 25/10/2026' },
    { id: 'dispute', label: 'Không còn tranh chấp hợp đồng', status: 'met', detail: 'Pháp chế xác nhận · Phạm Minh Đức · 24/10/2026' },
    { id: 'operation', label: 'Không còn vấn đề vận hành tồn đọng', status: 'met', detail: 'Khai thác xác nhận · Võ Thanh Sơn · 24/10/2026' },
  ],
  'KH-000258': [
    { id: 'debt', label: 'Không có công nợ quá hạn', status: 'met', detail: 'Kế toán xác nhận · Bùi Thu Hà · 27/10/2026' },
    { id: 'dispute', label: 'Tranh chấp giao nhận đã giải quyết', status: 'met', detail: 'Pháp chế xác nhận · Phạm Minh Đức · 27/10/2026' },
    { id: 'operation', label: 'Không còn vấn đề vận hành tồn đọng', status: 'met', detail: 'Khai thác xác nhận · Võ Thanh Sơn · 26/10/2026' },
  ],
};
