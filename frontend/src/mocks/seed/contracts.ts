import type {
  ApprovalLogEntry,
  ApprovalRound,
  ApprovalStep,
  ApprovalStepKey,
  Contract,
  ContractServiceItem,
  ContractServiceOption,
  ContractStatus,
  ContractTemplate,
} from '@/features/contracts/types/contract';
import type { WorkflowConfig, WorkflowPerson, WorkflowStage } from '@/features/contracts/types/workflowConfig';
import { STEP_LABELS } from '@/features/contracts/utils/contractStatus';

export const CONTRACT_TYPES = [
  'Hợp đồng dịch vụ kho bãi',
  'Hợp đồng dịch vụ bốc xếp',
  'Hợp đồng vận chuyển nội địa',
  'Hợp đồng dịch vụ logistics tổng hợp',
];

export const CONTRACT_SERVICE_CATALOG: ContractServiceOption[] = [
  { serviceCode: 'DV-KB-01', serviceName: 'Lưu kho hàng khô', unit: 'm²/tháng', requiresArea: true },
  { serviceCode: 'DV-BX-03', serviceName: 'Bốc xếp container', unit: 'container', requiresArea: true },
  { serviceCode: 'DV-VC-02', serviceName: 'Vận chuyển nội địa', unit: 'chuyến', requiresArea: false },
  { serviceCode: 'DV-KH-04', serviceName: 'Khai thác cầu bến', unit: 'tấn', requiresArea: true },
];

export const CONTRACT_TEMPLATES: ContractTemplate[] = [
  {
    code: 'MHD-KB-02',
    name: 'Dịch vụ kho bãi & bốc xếp',
    version: 'v2.1 – áp dụng từ 01/07/2026',
    title: 'Hợp đồng dịch vụ kho bãi và bốc xếp 2026–2027',
    contractType: 'Hợp đồng dịch vụ kho bãi',
    paymentTerm: 'Chuyển khoản hàng tháng, trong 30 ngày kể từ ngày nhận đủ chứng từ.',
    content:
      'ĐIỀU 1. PHẠM VI DỊCH VỤ\nBên cung cấp thực hiện dịch vụ kho bãi và bốc xếp theo các hạng mục được chọn.\n\nĐIỀU 2. GIÁ TRỊ VÀ THANH TOÁN\nGiá trị, đơn giá và kỳ thanh toán thực hiện theo phụ lục của hợp đồng.\n\nĐIỀU 3. HIỆU LỰC\nHợp đồng có hiệu lực trong thời hạn đã ghi tại phần thông tin chung.',
    services: CONTRACT_SERVICE_CATALOG.slice(0, 3),
  },
  {
    code: 'MHD-VC-01',
    name: 'Vận chuyển nội địa',
    version: 'v1.4 – áp dụng từ 15/08/2026',
    title: 'Hợp đồng vận chuyển hàng hóa nội địa',
    contractType: 'Hợp đồng vận chuyển nội địa',
    paymentTerm: 'Đối soát theo tháng và thanh toán trong 15 ngày.',
    content:
      'ĐIỀU 1. PHẠM VI VẬN CHUYỂN\nBên cung cấp vận chuyển hàng hóa theo lệnh điều vận được xác nhận.\n\nĐIỀU 2. THANH TOÁN\nHai bên đối soát sản lượng và thanh toán theo kỳ.',
    services: [CONTRACT_SERVICE_CATALOG[2]],
  },
];

/**
 * Chuỗi giả lập lỗi, chỉ lỗi ở lần thử đầu:
 * - Tên hợp đồng (01.8, 03.7, 04.6), lý do hủy (05.3), ý kiến duyệt (07.9/08.11/09.9), tên cấu hình (10.14) bắt đầu bằng LOI-503.
 * - Tên hợp đồng khi sửa bắt đầu bằng XUNG-DOT: người khác vừa lưu hồ sơ (03.5); tên cấu hình: 10.13.
 * - Ý kiến duyệt bắt đầu bằng LOI-TB: quyết định đã lưu nhưng gửi thông báo/chuyển ký kết lỗi (07.13/08.16/09.13).
 * - Từ khóa danh sách LOI-503: không tải được danh sách (02.8); mã HD-2026-500: không tải được chi tiết (06.6).
 */
export const SIMULATED_CONTRACT_SAVE_ERROR_PREFIX = 'LOI-503';
export const SIMULATED_CONFLICT_PREFIX = 'XUNG-DOT';
export const SIMULATED_NOTIFY_ERROR_PREFIX = 'LOI-TB';
export const SIMULATED_LOAD_ERROR_CODE = 'HD-2026-500';

/** Phạm vi cấu hình quy trình ứng với phòng ban quản lý hồ sơ. */
export const DEPARTMENT_WORKFLOW_SCOPE: Record<string, string> = { KD: 'Phòng Kinh doanh 1' };

export const COORDINATION_DEPARTMENTS = ['Phòng Khai thác', 'Phòng Kế toán', 'Phòng Kinh doanh'];

/** Danh mục người dùng kèm thẩm quyền ký dùng cho cấu hình người tham gia (SYS-CTR-10). */
export const WORKFLOW_PEOPLE: WorkflowPerson[] = [
  { id: 'u-an-nv', name: 'Nguyễn Văn An', title: 'Nhân viên Kinh doanh', department: 'Phòng Kinh doanh 1', active: true, canSign: false },
  { id: 'u-khoa-dm', name: 'Đỗ Minh Khoa', title: 'Nhân viên Kinh doanh', department: 'Phòng Kinh doanh 1', active: true, canSign: false },
  { id: 'u-tuan-lv', name: 'Lê Văn Tuấn', title: 'Nhân viên Kinh doanh', department: 'Phòng Kinh doanh 1', active: false, canSign: false },
  { id: 'u-hong-lt', name: 'Lê Thị Hồng', title: 'Trưởng phòng Kinh doanh', department: 'Phòng Kinh doanh 1', active: true, canSign: false },
  { id: 'u-duc-pm', name: 'Phạm Minh Đức', title: 'Nhân viên Pháp chế', department: 'Phòng Pháp chế', active: true, canSign: false },
  { id: 'u-vy-nt', name: 'Ngô Thanh Vy', title: 'Nhân viên Pháp chế', department: 'Phòng Pháp chế', active: true, canSign: false },
  { id: 'u-bao-tq', name: 'Trần Quốc Bảo', title: 'Giám đốc', department: 'Ban Giám đốc', active: true, canSign: true },
  { id: 'u-huong-dtt', name: 'Đỗ Thị Thu Hương', title: 'Phó Giám đốc (được ủy quyền ký)', department: 'Ban Giám đốc', active: true, canSign: true },
];

const CONTRACT_STAGES_V2: WorkflowStage[] = [
  { key: 'draft', enabled: true, role: 'Nhân viên Kinh doanh', mode: 'role-department', participants: ['u-an-nv', 'u-khoa-dm'], backups: [], notify: ['u-hong-lt'] },
  { key: 'sales', enabled: true, role: 'Trưởng phòng Kinh doanh', mode: 'specific', participants: ['u-hong-lt'], backups: [], notify: [] },
  { key: 'legal', enabled: true, role: 'Nhân viên Pháp chế', mode: 'rotation', participants: ['u-duc-pm', 'u-vy-nt'], backups: [], notify: [] },
  { key: 'board', enabled: true, role: 'Thành viên Ban Giám đốc', mode: 'specific', participants: ['u-bao-tq'], backups: ['u-huong-dtt'], notify: [] },
  { key: 'signing', enabled: true, role: 'Người ký đại diện công ty', mode: 'specific', participants: ['u-bao-tq'], backups: ['u-huong-dtt'], notify: ['u-an-nv'] },
];

const CONTRACT_STAGES_V1 = CONTRACT_STAGES_V2.map((stage) =>
  stage.key === 'legal' ? { ...stage, mode: 'specific' as const, participants: ['u-duc-pm'] } : stage,
);

export const SEED_WORKFLOW_CONFIGS: WorkflowConfig[] = [
  {
    code: 'QT-HD-KD1',
    name: 'Hợp đồng dịch vụ – Phòng Kinh doanh 1',
    docType: 'contract',
    scope: 'Phòng Kinh doanh 1',
    version: 2,
    activatedAt: '2026-10-20T09:30:00+07:00',
    activatedByName: 'Ngô Thị Lan',
    stages: CONTRACT_STAGES_V2,
    history: [
      { version: 1, activatedAt: '2026-09-01T08:00:00+07:00', activatedByName: 'Ngô Thị Lan', summary: 'Khởi tạo 5 giai đoạn; Rà soát pháp lý chỉ định Phạm Minh Đức.', stages: CONTRACT_STAGES_V1 },
      { version: 2, activatedAt: '2026-10-20T09:30:00+07:00', activatedByName: 'Ngô Thị Lan', summary: 'Rà soát pháp lý chuyển sang luân phiên Phạm Minh Đức, Ngô Thanh Vy.', stages: CONTRACT_STAGES_V2 },
    ],
  },
];

type Person = { id: string; name: string };
const AN: Person = { id: 'u-an-nv', name: 'Nguyễn Văn An' };
const KHOA: Person = { id: 'u-khoa-dm', name: 'Đỗ Minh Khoa' };
const HONG: Person = { id: 'u-hong-lt', name: 'Lê Thị Hồng' };
const DUC: Person = { id: 'u-duc-pm', name: 'Phạm Minh Đức' };
const BAO: Person = { id: 'u-bao-tq', name: 'Trần Quốc Bảo' };

type RoundStage =
  | 'sales-pending'
  | 'sales-reviewing'
  | 'legal'
  | 'board'
  | 'board-unassigned'
  | 'approved'
  | 'revision-legal'
  | 'rejected-board'
  | 'withdrawn';

type RoundNotes = Partial<Record<ApprovalStepKey, string>>;

/** Dựng lượt duyệt nhất quán (bước, nhật ký, trạng thái trước/sau) từ thời điểm trình và giai đoạn đang dừng. */
function buildRound(no: number, owner: Person, submittedAt: string, version: number, stage: RoundStage, notes: RoundNotes = {}): ApprovalRound {
  const at = (hours: number) => new Date(Date.parse(submittedAt) + hours * 3_600_000).toISOString();
  const steps: Record<ApprovalStepKey, ApprovalStep> = {
    sales: { key: 'sales', label: STEP_LABELS.sales, state: 'waiting' },
    legal: { key: 'legal', label: STEP_LABELS.legal, state: 'waiting' },
    board: { key: 'board', label: STEP_LABELS.board, state: 'waiting' },
  };
  const log: ApprovalLogEntry[] = [{ at: submittedAt, stepKey: 'sales', actorName: owner.name, action: 'submit', from: 'draft', to: 'submitted', version }];
  const round = (result: ApprovalRound['result'], endedAt?: string): ApprovalRound => ({
    no, submittedById: owner.id, submittedByName: owner.name, submittedAt, contractVersion: version,
    configCode: 'QT-HD-KD1', configVersion: Date.parse(submittedAt) < Date.parse('2026-10-20T09:30:00+07:00') ? 1 : 2,
    result, endedAt, steps: [steps.sales, steps.legal, steps.board], log, coordinations: [],
  });
  const approve = (key: ApprovalStepKey, person: Person, hours: number) => {
    Object.assign(steps[key], { state: 'done', decision: 'approve', decidedById: person.id, decidedByName: person.name, decidedAt: at(hours), comment: notes[key] ?? 'Đồng ý, hồ sơ đầy đủ.', reviewedVersion: version });
    log.push({ at: at(hours), stepKey: key, actorName: person.name, action: 'approve', from: 'under-review', to: key === 'board' ? 'approved' : 'under-review', note: steps[key].comment, version });
  };

  if (stage === 'withdrawn') {
    steps.sales = { ...steps.sales, assigneeId: HONG.id, assigneeName: HONG.name, assignedAt: submittedAt, state: 'skipped' };
    steps.legal.state = 'skipped';
    steps.board.state = 'skipped';
    log.push({ at: at(2), stepKey: 'sales', actorName: owner.name, action: 'withdraw', from: 'submitted', to: 'draft', note: 'Rút để bổ sung bảng giá trước khi rà soát.', version });
    return round('withdrawn', at(2));
  }
  Object.assign(steps.sales, { assigneeId: HONG.id, assigneeName: HONG.name, assignedAt: submittedAt, state: 'pending-accept' });
  if (stage === 'sales-pending') return round('in-progress');
  Object.assign(steps.sales, { acceptedAt: at(1), state: 'reviewing' });
  log.push({ at: at(1), stepKey: 'sales', actorName: HONG.name, action: 'accept', from: 'submitted', to: 'under-review', version });
  if (stage === 'sales-reviewing') return round('in-progress');
  approve('sales', HONG, 3);
  log.push({ at: at(4), stepKey: 'legal', actorName: owner.name, action: 'handoff-legal', from: 'under-review', to: 'under-review', version });
  Object.assign(steps.legal, { assigneeId: DUC.id, assigneeName: DUC.name, assignedAt: at(4), state: 'reviewing' });
  if (stage === 'legal') return round('in-progress');
  if (stage === 'revision-legal') {
    Object.assign(steps.legal, { state: 'stopped', decision: 'revision', decidedById: DUC.id, decidedByName: DUC.name, decidedAt: at(30), comment: notes.legal, reviewedVersion: version });
    steps.board.state = 'skipped';
    log.push({ at: at(30), stepKey: 'legal', actorName: DUC.name, action: 'request-revision', from: 'under-review', to: 'revision-requested', note: notes.legal, version });
    return round('revision', at(30));
  }
  approve('legal', DUC, 28);
  log.push({ at: at(29), stepKey: 'board', actorName: DUC.name, action: 'handoff-board', from: 'under-review', to: 'under-review', version });
  if (stage === 'board-unassigned') {
    Object.assign(steps.board, { state: 'unassigned', assignedAt: at(29) });
    return round('in-progress');
  }
  Object.assign(steps.board, { assigneeId: BAO.id, assigneeName: BAO.name, assignedAt: at(29), state: 'reviewing' });
  if (stage === 'board') return round('in-progress');
  if (stage === 'rejected-board') {
    Object.assign(steps.board, { state: 'stopped', decision: 'reject', decidedById: BAO.id, decidedByName: BAO.name, decidedAt: at(50), comment: notes.board, reviewedVersion: version });
    log.push({ at: at(50), stepKey: 'board', actorName: BAO.name, action: 'reject', from: 'under-review', to: 'rejected', note: notes.board, version });
    return round('rejected', at(50));
  }
  approve('board', BAO, 50);
  return round('completed', at(50));
}

type SeedService = [serviceCode: string, areaCode: string];

function services(code: string, rows: SeedService[]): ContractServiceItem[] {
  return rows.map(([serviceCode, areaCode], index) => {
    const service = CONTRACT_SERVICE_CATALOG.find((item) => item.serviceCode === serviceCode)!;
    return { ...service, id: `${code}-${index}`, areaCode: service.requiresArea ? areaCode : '' };
  });
}

const FILE = (name: string, size: number) => ({ name, size });

function seedContract(
  code: string,
  owner: Person,
  customer: [code: string, name: string],
  title: string,
  value: number,
  period: [from: string, to: string],
  serviceRows: SeedService[],
  status: ContractStatus,
  createdAt: string,
  extra: Partial<Contract> = {},
): Contract {
  const template = CONTRACT_TEMPLATES[serviceRows.some(([service]) => service !== 'DV-VC-02') ? 0 : 1];
  return {
    code,
    customerCode: customer[0],
    customerName: customer[1],
    sourceMode: 'template',
    templateCode: template.code,
    title,
    contractType: template.contractType,
    effectiveFrom: period[0],
    effectiveTo: period[1],
    value,
    paymentTerm: template.paymentTerm,
    services: services(code, serviceRows),
    content: template.content,
    status,
    ownerId: owner.id,
    ownerName: owner.name,
    departmentCode: 'KD',
    createdAt,
    updatedAt: createdAt,
    version: 1,
    attachments: [FILE(`${code}_du-thao.pdf`, 412 * 1024), FILE('GCN-dang-ky-doanh-nghiep.pdf', 238 * 1024)],
    rounds: [],
    ...extra,
  };
}

/**
 * Hồ sơ mẫu theo các frame trên page "05 · Hợp đồng (CTR)": phủ đủ trạng thái và từng bước duyệt.
 * Người phụ trách chính là an.nv; Đỗ Minh Khoa cùng phòng để kiểm tra phạm vi Trưởng phòng (02.4).
 */
export const SEED_CONTRACTS: Contract[] = [
  seedContract('HD-2026-016', AN, ['KH-000305', 'TNHH Thủy sản Minh Hải'], 'Hợp đồng lưu kho lạnh 2026–2027', 2_150_000_000, ['2026-11-15', '2027-11-14'], [['DV-KB-01', 'KV-CL-C1-K1'], ['DV-BX-03', 'KV-CL-B1-A1']], 'submitted', '2026-10-28T09:10:00+07:00', {
    rounds: [buildRound(1, AN, '2026-10-29T14:20:00+07:00', 1, 'sales-pending')],
  }),
  seedContract('HD-2026-014', AN, ['KH-000245', 'Công ty TNHH Minh Phát'], 'Hợp đồng lưu kho và bốc xếp hàng tiêu dùng', 980_000_000, ['2026-11-01', '2027-10-31'], [['DV-KB-01', 'KV-CL-C1-K2'], ['DV-BX-03', 'KV-CL-B1-A2']], 'revision-requested', '2026-10-22T08:30:00+07:00', {
    version: 2,
    rounds: [buildRound(1, AN, '2026-10-24T10:00:00+07:00', 2, 'revision-legal', { legal: 'Bổ sung Điều 7 về bồi thường thiệt hại khi hư hỏng hàng hóa trong kho; nêu rõ mức trần bồi thường.' })],
    revisionRequest: { stepLabel: 'Pháp chế', byName: DUC.name, at: '2026-10-25T16:00:00+07:00', content: 'Bổ sung Điều 7 về bồi thường thiệt hại khi hư hỏng hàng hóa trong kho; nêu rõ mức trần bồi thường.' },
  }),
  seedContract('HD-2026-013', AN, ['KH-000198', 'CTCP Cảng Sao Biển'], 'Hợp đồng dịch vụ kho bãi và bốc xếp 2026–2027', 1_284_500_000, ['2026-11-01', '2027-10-31'], [['DV-KH-04', 'KV-CL-CB3'], ['DV-BX-03', 'KV-CL-B1-A1'], ['DV-VC-02', '']], 'under-review', '2026-10-20T09:42:00+07:00', {
    rounds: [buildRound(1, AN, '2026-10-24T15:00:00+07:00', 1, 'legal', { sales: 'Giá trị và phạm vi dịch vụ phù hợp chính sách giá quý IV.' })],
  }),
  seedContract('HD-2026-012', AN, ['KH-000276', 'Vận tải Hoàng Long'], 'Hợp đồng vận hành thiết bị nâng', 640_000_000, ['2026-12-01', '2027-11-30'], [['DV-BX-03', 'KV-PL-B1']], 'draft', '2026-10-26T10:05:00+07:00', { attachments: [] }),
  seedContract('HD-2026-011', AN, ['KH-000301', 'TNHH Thép Nam Việt'], 'Hợp đồng bốc xếp thép cuộn tại cầu bến', 1_960_000_000, ['2026-11-10', '2027-11-09'], [['DV-KH-04', 'KV-HP-CB2'], ['DV-BX-03', 'KV-HP-Y1']], 'under-review', '2026-10-15T08:00:00+07:00', {
    version: 2,
    rounds: [
      buildRound(1, AN, '2026-10-17T09:00:00+07:00', 1, 'revision-legal', { legal: 'Điều khoản thanh toán chưa nêu lãi chậm trả; đề nghị bổ sung.' }),
      buildRound(2, AN, '2026-10-27T09:05:00+07:00', 2, 'sales-reviewing'),
    ],
  }),
  seedContract('HD-2026-010', AN, ['KH-000289', 'Logistics Đông Á'], 'Hợp đồng lưu kho lạnh', 3_200_000_000, ['2026-11-01', '2028-10-31'], [['DV-KB-01', 'KV-CL-C1-K1']], 'approved', '2026-10-12T08:00:00+07:00', {
    rounds: [buildRound(1, AN, '2026-10-14T09:00:00+07:00', 1, 'approved', { board: 'Phê duyệt; chuyển ký kết trong tuần.' })],
  }),
  seedContract('HD-2026-009', AN, ['KH-000301', 'TNHH Thép Nam Việt'], 'Hợp đồng bốc xếp hàng rời', 4_800_000_000, ['2026-11-15', '2027-11-14'], [['DV-BX-03', 'KV-HP-Y1'], ['DV-KH-04', 'KV-HP-CB1']], 'under-review', '2026-10-16T08:00:00+07:00', {
    rounds: [buildRound(1, AN, '2026-10-19T09:00:00+07:00', 1, 'board', { sales: 'Đơn giá bốc xếp đúng biểu giá.', legal: 'Đạt yêu cầu pháp lý; điều khoản bảo hiểm hàng hóa đầy đủ.' })],
  }),
  seedContract('HD-2026-008', AN, ['KH-000289', 'Logistics Đông Á'], 'Hợp đồng lưu bãi container hàng nhập', 720_000_000, ['2026-12-01', '2027-11-30'], [['DV-KB-01', 'KV-CL-B2'], ['DV-BX-03', 'KV-CL-B1-A2']], 'draft', '2026-10-27T13:20:00+07:00'),
  seedContract('HD-2026-006', AN, ['KH-000198', 'CTCP Cảng Sao Biển'], 'Hợp đồng thuê bãi container rỗng', 450_000_000, ['2026-11-01', '2027-04-30'], [['DV-KB-01', 'KV-PL-B2']], 'cancelled', '2026-10-10T09:00:00+07:00', {
    cancellation: { byName: AN.name, at: '2026-10-21T10:30:00+07:00', reason: 'Khách hàng chuyển sang ký hợp đồng khung năm 2027; hồ sơ dự thảo không còn nhu cầu xử lý.' },
  }),
  seedContract('HD-2026-005', KHOA, ['KH-000311', 'CTCP Dầu khí Phương Nam'], 'Hợp đồng thuê bãi và vận hành thiết bị', 12_500_000_000, ['2026-12-01', '2028-11-30'], [['DV-KB-01', 'KV-HP-Y1'], ['DV-BX-03', 'KV-HP-Y1']], 'under-review', '2026-10-14T08:00:00+07:00', {
    rounds: [buildRound(1, KHOA, '2026-10-18T09:00:00+07:00', 1, 'board', { sales: 'Khách hàng chiến lược; đồng ý mức chiết khấu 3%.', legal: 'Đạt yêu cầu; đã đối chiếu giấy phép kinh doanh xăng dầu.' })],
  }),
  seedContract('HD-2026-017', KHOA, ['KH-000310', 'Tổng công ty Hàng hải ABC'], 'Hợp đồng khung dịch vụ cảng 24 tháng', 8_900_000_000, ['2027-01-01', '2028-12-31'], [['DV-KH-04', 'KV-CL-CB4'], ['DV-BX-03', 'KV-CL-B1-A1']], 'submitted', '2026-10-27T15:00:00+07:00', {
    rounds: [buildRound(1, KHOA, '2026-10-30T08:40:00+07:00', 1, 'sales-pending')],
  }),
  seedContract('HD-2026-004', KHOA, ['KH-000310', 'Tổng công ty Hàng hải ABC'], 'Hợp đồng vận chuyển nội địa tuyến Bắc – Nam', 5_400_000_000, ['2026-11-01', '2027-10-31'], [['DV-VC-02', '']], 'rejected', '2026-10-08T08:00:00+07:00', {
    rounds: [buildRound(1, KHOA, '2026-10-10T09:00:00+07:00', 1, 'rejected-board', { board: 'Giá trị vượt hạn mức đã phê duyệt cho khách hàng; không ký.' })],
    rejection: { stepLabel: 'Ban Giám đốc', byName: BAO.name, at: '2026-10-12T11:00:00+07:00', reason: 'Giá trị vượt hạn mức đã phê duyệt cho khách hàng; không ký.' },
  }),
  seedContract('HD-2026-003', AN, ['KH-000276', 'Vận tải Hoàng Long'], 'Hợp đồng vận chuyển container nội địa', 860_000_000, ['2026-12-01', '2027-11-30'], [['DV-VC-02', '']], 'draft', '2026-10-18T08:00:00+07:00', {
    rounds: [buildRound(1, AN, '2026-10-19T08:30:00+07:00', 1, 'withdrawn')],
  }),
  seedContract('HD-2026-002', KHOA, ['KH-000311', 'CTCP Dầu khí Phương Nam'], 'Hợp đồng kho CFS hàng xuất', 1_150_000_000, ['2026-11-20', '2027-11-19'], [['DV-KB-01', 'KV-PL-CFS']], 'under-review', '2026-10-13T08:00:00+07:00', {
    rounds: [buildRound(1, KHOA, '2026-10-21T09:00:00+07:00', 1, 'board-unassigned')],
  }),
];
