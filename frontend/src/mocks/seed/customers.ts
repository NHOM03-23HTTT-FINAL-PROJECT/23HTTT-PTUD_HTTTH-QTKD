import type { CatalogOption, Customer } from '@/features/customers/types/customer';
import type { SuspensionRecord } from '@/features/customers/types/customerStatus';

/*
 * Danh mục dùng cho nhóm "Thông tin hợp tác" trong prototype. Danh mục thật do Quản trị hệ thống
 * quản lý (TASK-034), giá trị dưới đây chỉ là dữ liệu mẫu.
 */
export const CUSTOMER_GROUPS: CatalogOption[] = [
  { code: 'XNK', label: 'Doanh nghiệp xuất nhập khẩu' },
  { code: 'HANG_TAU', label: 'Hãng tàu / đại lý hãng tàu' },
  { code: 'SAN_XUAT', label: 'Doanh nghiệp sản xuất' },
  { code: 'FORWARDER', label: 'Công ty logistics / forwarder' },
  { code: 'THUONG_MAI', label: 'Doanh nghiệp thương mại' },
];

export const SERVICE_GROUPS: CatalogOption[] = [
  { code: 'LUU_KHO', label: 'Lưu kho' },
  { code: 'BOC_XEP', label: 'Bốc xếp' },
  { code: 'VAN_CHUYEN_ND', label: 'Vận chuyển nội địa' },
  { code: 'KHAI_THAC_CANG', label: 'Khai thác cảng' },
  { code: 'VAN_HANH_TB', label: 'Vận hành thiết bị' },
];

/*
 * Mã số thuế dùng để giả lập lỗi khi lưu (frame 01.6), mỗi biểu mẫu chỉ lỗi ở lần gửi đầu:
 * - bắt đầu bằng 0399: lỗi lưu hồ sơ/lịch sử, giao dịch được hoàn tác (A6.3);
 * - bắt đầu bằng 0388: server đã lưu nhưng mất kết nối trước khi nhận kết quả (A6.4).
 */
export const SIMULATED_SAVE_ERROR_PREFIX = '0399';
export const SIMULATED_LOST_RESPONSE_PREFIX = '0388';

/*
 * Khách hàng dùng để giả lập tình huống khi lưu cập nhật (UC-CUS-02):
 * - KH-000198: người khác lưu phiên bản mới ngay trước lần lưu đầu tiên (02.4 – A5.3), chỉ xảy ra một lần;
 * - KH-000289: lần lưu đầu của mỗi biểu mẫu lỗi, giao dịch được hoàn tác (02.8 – A6.2);
 * - KH-000301: lần lưu đầu của mỗi biểu mẫu đã ghi nhưng mất phản hồi (02.8 – A6.3).
 */
export const SIMULATED_UPDATE_CONFLICT_CODE = 'KH-000198';
export const SIMULATED_UPDATE_SAVE_ERROR_CODE = 'KH-000289';
export const SIMULATED_UPDATE_LOST_RESPONSE_CODE = 'KH-000301';

/** Thay đổi "người khác" lưu trước ở tình huống xung đột phiên bản. */
export const SIMULATED_CONCURRENT_EDIT = {
  by: 'Trần Minh Quân',
  draft: { contactName: 'Ngô Thanh Hà', email: 'ketoan@saobienport.vn' },
  reason: 'Khách hàng đổi đầu mối nhận chứng từ công nợ.',
};

type SeedHistoryEntry = Omit<Customer['history'][number], 'version'>;

type SeedCustomerInput = Omit<Customer, 'version' | 'history' | 'createdBy'> & {
  /** Các thao tác sau khi tạo; mỗi thao tác tăng một phiên bản. */
  laterHistory?: SeedHistoryEntry[];
};

function suspendedEntry(at: string, reason: string): SeedHistoryEntry {
  return { action: 'Tạm ngưng khách hàng', by: 'Lê Thị Hồng', at, reason, statusChange: { from: 'active', to: 'suspended' } };
}

function suspensionRecord(reasonGroup: string, reason: string, at: string, evidence: string): SuspensionRecord {
  return {
    reasonGroup,
    reason,
    evidence: [{ name: evidence, size: 238 * 1024 }],
    decidedBy: 'Lê Thị Hồng',
    decidedByTitle: 'Trưởng phòng Kinh doanh',
    at,
    plan: [],
    coordinationNote: '',
    notices: [{ department: 'Kế toán', status: 'sent', at }],
  };
}

function seed({ laterHistory = [], ...input }: SeedCustomerInput): Customer {
  const history: Customer['history'] = [
    { action: 'Tạo hồ sơ khách hàng', by: input.ownerName, at: input.createdAt, version: 1 },
    ...laterHistory.map((entry, index) => ({ ...entry, fromVersion: index + 1, version: index + 2 })),
  ];
  return { ...input, version: history.length, createdBy: input.ownerName, history };
}

/** Khách hàng đã có trước khi chạy prototype; tên khớp với dữ liệu mẫu trên các trang làm việc 05.x. */
export const SEED_CUSTOMERS: Customer[] = [
  seed({
    code: 'KH-000198',
    name: 'CTCP Cảng Sao Biển',
    taxCode: '0301234567',
    address: '12 Nguyễn Tất Thành, Phường Xóm Chiếu, TP. Hồ Chí Minh',
    representative: 'Đỗ Minh Khang',
    contactName: 'Phạm Thu Trang',
    contactTitle: 'Trưởng phòng Khai thác',
    phone: '02838261234',
    email: 'khaithac@saobienport.vn',
    customerGroup: 'HANG_TAU',
    serviceGroups: ['KHAI_THAC_CANG', 'BOC_XEP'],
    status: 'active',
    ownerId: 'u-an-nv',
    ownerName: 'Nguyễn Văn An',
    createdAt: '2025-11-04T10:20:00+07:00',
  }),
  seed({
    code: 'KH-000245',
    name: 'Công ty TNHH Minh Phát',
    taxCode: '0312345678',
    address: '45 Lê Lợi, Phường Bến Thành, TP. Hồ Chí Minh',
    representative: 'Trần Văn Phát',
    contactName: 'Nguyễn Thị Mai',
    contactTitle: 'Kế toán trưởng',
    phone: '0903456789',
    email: 'ketoan@minhphat.com.vn',
    customerGroup: 'XNK',
    serviceGroups: ['LUU_KHO'],
    status: 'suspended',
    ownerId: 'u-quan-tm',
    ownerName: 'Trần Minh Quân',
    createdAt: '2026-01-15T14:05:00+07:00',
    laterHistory: [suspendedEntry('2026-09-12T15:20:00+07:00', 'Nợ quá hạn kỳ 05–07/2026, chưa có kế hoạch thanh toán.')],
    suspension: suspensionRecord(
      'CONG_NO',
      'Nợ quá hạn kỳ 05–07/2026, chưa có kế hoạch thanh toán.',
      '2026-09-12T15:20:00+07:00',
      'BienBan_DoiChieuCongNo_T08-2026.pdf',
    ),
    closedRecords: [
      { code: 'HD-2025-031', title: 'Lưu kho & bốc xếp', note: 'Đã hết hiệu lực 30/09/2026 – không tự gia hạn', status: 'Expired' },
      { code: 'HD-2025-019', title: 'Thuê bãi container', note: 'Đã hủy 15/09/2026 – không tự khôi phục', status: 'Cancelled' },
    ],
  }),
  seed({
    code: 'KH-000233',
    name: 'CTCP Kho vận Bình Minh',
    taxCode: '0314455667',
    address: '27 Đường số 7, KCN Vĩnh Lộc, TP. Hồ Chí Minh',
    representative: 'Đặng Bình Minh',
    contactName: 'Lưu Thị Ngọc',
    contactTitle: 'Kế toán công nợ',
    phone: '0909887766',
    email: 'congno@binhminhlogistics.vn',
    customerGroup: 'FORWARDER',
    serviceGroups: ['LUU_KHO', 'BOC_XEP'],
    status: 'suspended',
    ownerId: 'u-an-nv',
    ownerName: 'Nguyễn Văn An',
    createdAt: '2025-12-08T09:30:00+07:00',
    laterHistory: [suspendedEntry('2026-08-28T10:10:00+07:00', 'Quá hạn thanh toán kỳ 06–07/2026, đã gửi thư nhắc lần 2.')],
    suspension: suspensionRecord(
      'CONG_NO',
      'Quá hạn thanh toán kỳ 06–07/2026, đã gửi thư nhắc lần 2.',
      '2026-08-28T10:10:00+07:00',
      'ThuNhac_CongNo_Lan2.pdf',
    ),
  }),
  seed({
    code: 'KH-000258',
    name: 'TNHH Giao nhận Phú Quý',
    taxCode: '0316677889',
    address: '102 Nguyễn Văn Linh, Phường Tân Thuận, TP. Hồ Chí Minh',
    representative: 'Phạm Phú Quý',
    contactName: '',
    contactTitle: '',
    phone: '0287654321',
    email: '',
    customerGroup: 'FORWARDER',
    serviceGroups: ['VAN_CHUYEN_ND'],
    status: 'suspended',
    ownerId: 'u-quan-tm',
    ownerName: 'Trần Minh Quân',
    createdAt: '2026-02-20T14:00:00+07:00',
    laterHistory: [suspendedEntry('2026-10-05T09:00:00+07:00', 'Tranh chấp bồi thường hàng hư hỏng lô giao nhận 09/2026.')],
    suspension: suspensionRecord(
      'TRANH_CHAP',
      'Tranh chấp bồi thường hàng hư hỏng lô giao nhận 09/2026.',
      '2026-10-05T09:00:00+07:00',
      'BienBan_GiamDinh_HangHong.pdf',
    ),
  }),
  seed({
    code: 'KH-000276',
    name: 'Vận tải Hoàng Long',
    taxCode: '0109876543',
    address: '88 Phạm Văn Đồng, Phường Cổ Nhuế, Hà Nội',
    representative: 'Hoàng Văn Long',
    contactName: 'Vũ Thị Hạnh',
    contactTitle: 'Điều phối vận tải',
    phone: '0912345678',
    email: '',
    customerGroup: 'FORWARDER',
    serviceGroups: ['VAN_CHUYEN_ND'],
    status: 'active',
    ownerId: 'u-an-nv',
    ownerName: 'Nguyễn Văn An',
    createdAt: '2026-03-02T09:00:00+07:00',
  }),
  seed({
    code: 'KH-000289',
    name: 'Logistics Đông Á',
    taxCode: '0315556677',
    address: '210 Điện Biên Phủ, Phường Xuân Hòa, TP. Hồ Chí Minh',
    representative: 'Lý Quốc Huy',
    contactName: '',
    contactTitle: '',
    phone: '',
    email: 'sales@dongalogistics.vn',
    customerGroup: 'FORWARDER',
    serviceGroups: ['LUU_KHO', 'VAN_CHUYEN_ND'],
    status: 'active',
    ownerId: 'u-an-nv',
    ownerName: 'Nguyễn Văn An',
    createdAt: '2026-05-18T11:40:00+07:00',
  }),
  seed({
    code: 'KH-000301',
    name: 'TNHH Thép Nam Việt',
    taxCode: '3600123456',
    address: 'KCN Nhơn Trạch 3, Xã Hiệp Phước, Tỉnh Đồng Nai',
    representative: 'Nguyễn Hữu Việt',
    contactName: 'Trịnh Văn Nam',
    contactTitle: 'Phó phòng Mua hàng',
    phone: '+842513560123',
    email: 'muahang@thepnamviet.vn',
    customerGroup: 'SAN_XUAT',
    serviceGroups: ['BOC_XEP', 'VAN_HANH_TB'],
    status: 'active',
    ownerId: 'u-an-nv',
    ownerName: 'Nguyễn Văn An',
    createdAt: '2026-07-09T08:30:00+07:00',
  }),
  seed({
    code: 'KH-000305',
    name: 'TNHH Thủy sản Minh Hải',
    taxCode: '2000345678',
    address: '15 Lý Thường Kiệt, Phường An Xuyên, Tỉnh Cà Mau',
    representative: 'Lâm Minh Hải',
    contactName: 'Tạ Ngọc Bích',
    contactTitle: 'Trưởng phòng Xuất khẩu',
    phone: '0780383456',
    email: 'xuatkhau@minhhaiseafood.vn',
    customerGroup: 'XNK',
    serviceGroups: ['LUU_KHO'],
    status: 'active',
    ownerId: 'u-quan-tm',
    ownerName: 'Trần Minh Quân',
    createdAt: '2026-08-21T15:15:00+07:00',
  }),
  seed({
    code: 'KH-000310',
    name: 'Tổng công ty Hàng hải ABC',
    taxCode: '0100109106001',
    address: '1 Đào Duy Anh, Phường Kim Liên, Hà Nội',
    representative: 'Phan Đức Thịnh',
    contactName: 'Mai Anh Tuấn',
    contactTitle: 'Giám đốc Thương mại',
    phone: '02435770825',
    email: 'thuongmai@hanghaiabc.vn',
    customerGroup: 'HANG_TAU',
    serviceGroups: ['KHAI_THAC_CANG', 'LUU_KHO', 'BOC_XEP'],
    status: 'active',
    ownerId: 'u-an-nv',
    ownerName: 'Nguyễn Văn An',
    createdAt: '2026-10-02T10:00:00+07:00',
  }),
  seed({
    code: 'KH-000311',
    name: 'CTCP Dầu khí Phương Nam',
    taxCode: '0302223334',
    address: '39 Lê Duẩn, Phường Sài Gòn, TP. Hồ Chí Minh',
    representative: 'Võ Hoài Nam',
    contactName: 'Đặng Thị Phương',
    contactTitle: 'Chuyên viên Kế hoạch',
    phone: '0938111222',
    email: 'kehoach@pvphuongnam.vn',
    customerGroup: 'SAN_XUAT',
    serviceGroups: ['VAN_HANH_TB'],
    status: 'active',
    ownerId: 'u-an-nv',
    ownerName: 'Nguyễn Văn An',
    createdAt: '2026-10-20T13:25:00+07:00',
  }),
  ...[
    // Khách hàng bổ sung để danh sách có nhiều trang (UC-CUS-05); chỉ có thông tin cơ bản.
    ['KH-000172', 'CTCP Cảng Cát Lái Xanh', '0304455661', '1295 Nguyễn Thị Định, Phường Cát Lái, TP. Hồ Chí Minh', 'Trương Văn Lái', 'HANG_TAU', ['KHAI_THAC_CANG'], '2025-06-03T08:30:00+07:00'],
    ['KH-000181', 'TNHH Nông sản Đồng Tháp', '1401234567', '45 Nguyễn Huệ, Phường Cao Lãnh, Tỉnh Đồng Tháp', 'Lê Thị Sen', 'XNK', ['LUU_KHO', 'VAN_CHUYEN_ND'], '2025-07-14T10:00:00+07:00'],
    ['KH-000190', 'Minh Phát Logistics', '0201234588', '18 Lê Thánh Tông, Phường Hải An, TP. Hải Phòng', 'Nguyễn Minh Phát', 'FORWARDER', ['VAN_CHUYEN_ND'], '2025-08-02T09:15:00+07:00'],
    ['KH-000204', 'CTCP Phân bón Bình Điền', '0301122334', 'Ấp 2, Xã Tân Kiên, TP. Hồ Chí Minh', 'Phạm Văn Điền', 'SAN_XUAT', ['LUU_KHO', 'BOC_XEP'], '2025-11-20T14:20:00+07:00'],
    ['KH-000212', 'TNHH Điện tử Sao Việt', '2300445566', 'KCN Quế Võ, Phường Quế Võ, Tỉnh Bắc Ninh', 'Đỗ Thị Sao', 'XNK', ['VAN_CHUYEN_ND'], '2025-12-11T11:00:00+07:00'],
    ['KH-000219', 'CTCP Dệt may Thành Công', '0300998877', '36 Tây Thạnh, Phường Tây Thạnh, TP. Hồ Chí Minh', 'Võ Thành Công', 'SAN_XUAT', ['LUU_KHO'], '2026-01-06T09:40:00+07:00'],
    ['KH-000227', 'TNHH Hóa chất Đông Nam', '3603344556', 'KCN Long Thành, Xã Tam An, Tỉnh Đồng Nai', 'Hồ Văn Nam', 'THUONG_MAI', ['LUU_KHO', 'VAN_HANH_TB'], '2026-02-17T15:30:00+07:00'],
    ['KH-000241', 'Vinalines Logistics', '0105556677', '1 Đào Duy Anh, Phường Hoàn Kiếm, Hà Nội', 'Trần Quang Vinh', 'FORWARDER', ['KHAI_THAC_CANG', 'VAN_CHUYEN_ND'], '2026-04-01T08:00:00+07:00'],
    ['KH-000255', 'CTCP Xi măng Hà Tiên', '0300112233', '360 Bến Chương Dương, Phường Thủ Đức, TP. Hồ Chí Minh', 'Ngô Hà Tiên', 'SAN_XUAT', ['BOC_XEP'], '2026-05-09T13:10:00+07:00'],
    ['KH-000260', 'TNHH Gỗ Phú Tài', '4101122334', '278 Nguyễn Thị Định, Phường Quy Nhơn, Tỉnh Gia Lai', 'Lê Phú Tài', 'XNK', ['LUU_KHO', 'BOC_XEP'], '2026-06-12T10:45:00+07:00'],
    ['KH-000266', 'CTCP Vận tải biển Bắc Hải', '0200667788', '9 Đà Nẵng, Phường Ngô Quyền, TP. Hải Phòng', 'Bùi Bắc Hải', 'HANG_TAU', ['KHAI_THAC_CANG'], '2026-07-21T16:00:00+07:00'],
    ['KH-000283', 'TNHH Thực phẩm An Khang', '0316778899', '55 Tân Kỳ Tân Quý, Phường Bình Tân, TP. Hồ Chí Minh', 'Đinh An Khang', 'THUONG_MAI', ['LUU_KHO'], '2026-09-03T09:20:00+07:00'],
    ['KH-000294', 'CTCP Cơ khí Đông Anh', '0100223344', 'Thị trấn Đông Anh, Xã Đông Anh, Hà Nội', 'Phan Văn Đông', 'SAN_XUAT', ['VAN_HANH_TB', 'BOC_XEP'], '2026-10-08T14:00:00+07:00'],
  ].map(([code, name, taxCode, address, representative, customerGroup, serviceGroups, createdAt], index) =>
    seed({
      code: code as string,
      name: name as string,
      taxCode: taxCode as string,
      address: address as string,
      representative: representative as string,
      contactName: '',
      contactTitle: '',
      phone: `09${String(10000000 + index * 7919).slice(0, 8)}`,
      email: '',
      customerGroup: customerGroup as string,
      serviceGroups: serviceGroups as string[],
      status: 'active',
      ownerId: index % 3 === 0 ? 'u-quan-tm' : 'u-an-nv',
      ownerName: index % 3 === 0 ? 'Trần Minh Quân' : 'Nguyễn Văn An',
      createdAt: createdAt as string,
    }),
  ),
];
