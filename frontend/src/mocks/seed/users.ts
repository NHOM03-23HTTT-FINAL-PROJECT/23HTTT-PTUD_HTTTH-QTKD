import type { AuthUser, LoginTrace } from '@/features/auth/types/auth';

/*
 * Tài khoản mẫu cho prototype (chưa có BE/DB). Mật khẩu để dạng rõ vì chỉ là dữ liệu kiểm thử
 * chạy trong trình duyệt; BE thật phải lưu mật khẩu đã băm (TASK-022).
 */
export const SEED_PASSWORD = 'Abc@12345';

export type SeedAccount = Omit<AuthUser, 'mustChangePassword'> & {
  password: string;
  status: 'active' | 'disabled';
  /** Lần đăng nhập trước theo dữ liệu mẫu trên các màn 05.x. */
  lastLogin?: LoginTrace;
  /** Lần đổi mật khẩu gần nhất (màn 04.1). */
  passwordChangedAt?: string;
  /** Đang dùng mật khẩu tạm do Quản trị hệ thống cấp – bắt buộc đổi khi đăng nhập (màn 04.6). */
  mustChangePassword?: boolean;
  /** Khóa sẵn khi khởi tạo dữ liệu mẫu (màn 01.4), tính bằng giây còn lại. */
  seedLockSeconds?: number;
  /** Giả lập lỗi truy cập dữ liệu khi đăng nhập (màn 01.7). */
  simulateSystemError?: boolean;
  /** Giả lập lỗi khi lưu mật khẩu mới ở lần đổi đầu tiên (màn 04.4). */
  simulateSaveError?: boolean;
  note: string;
};

export const SEED_ACCOUNTS: SeedAccount[] = [
  {
    id: 'u-an-nv',
    username: 'an.nv',
    email: 'an.nv@abc.vn',
    fullName: 'Nguyễn Văn An',
    department: 'KD',
    roles: ['NV_KD'],
    password: SEED_PASSWORD,
    status: 'active',
    lastLogin: { at: '2026-10-27T17:45:00+07:00', client: 'Chrome trên Windows' },
    passwordChangedAt: '2026-08-12T09:15:00+07:00',
    note: 'Nhân viên Kinh doanh – màn 05.1',
  },
  {
    id: 'u-hong-lt',
    username: 'hong.lt',
    email: 'hong.lt@abc.vn',
    fullName: 'Lê Thị Hồng',
    department: 'KD',
    roles: ['TP_KD'],
    password: SEED_PASSWORD,
    status: 'active',
    lastLogin: { at: '2026-10-27T08:15:00+07:00', client: 'Chrome trên Windows' },
    note: 'Trưởng phòng Kinh doanh – dùng trang làm việc Kinh doanh',
  },
  {
    id: 'u-son-vt',
    username: 'son.vt',
    email: 'son.vt@abc.vn',
    fullName: 'Võ Thanh Sơn',
    department: 'KT',
    roles: ['TP_KT'],
    password: SEED_PASSWORD,
    status: 'active',
    lastLogin: { at: '2026-10-27T16:20:00+07:00', client: 'Edge trên Windows' },
    note: 'Trưởng phòng Khai thác – màn 05.2',
  },
  {
    id: 'u-ha-bt',
    username: 'ha.bt',
    email: 'ha.bt@abc.vn',
    fullName: 'Bùi Thu Hà',
    department: 'KTOAN',
    roles: ['NV_KTOAN'],
    password: SEED_PASSWORD,
    status: 'active',
    lastLogin: { at: '2026-10-25T08:05:00+07:00', client: 'Chrome trên Windows' },
    note: 'Nhân viên Kế toán – màn 05.3',
  },
  {
    id: 'u-duc-pm',
    username: 'duc.pm',
    email: 'duc.pm@abc.vn',
    fullName: 'Phạm Minh Đức',
    department: 'PC',
    roles: ['NV_PC'],
    password: SEED_PASSWORD,
    status: 'active',
    lastLogin: { at: '2026-10-27T15:10:00+07:00', client: 'Chrome trên macOS' },
    note: 'Nhân viên Pháp chế – màn 05.4',
  },
  {
    id: 'u-bao-tq',
    username: 'bao.tq',
    email: 'bao.tq@abc.vn',
    fullName: 'Trần Quốc Bảo',
    department: 'BGD',
    roles: ['GD'],
    password: SEED_PASSWORD,
    status: 'active',
    lastLogin: { at: '2026-10-27T18:30:00+07:00', client: 'Safari trên iPad' },
    note: 'Giám đốc – màn 05.5',
  },
  {
    id: 'u-lan-nt',
    username: 'lan.nt',
    email: 'lan.nt@abc.vn',
    fullName: 'Ngô Thị Lan',
    department: 'QTHT',
    roles: ['QTHT'],
    password: SEED_PASSWORD,
    status: 'active',
    lastLogin: { at: '2026-10-27T19:02:00+07:00', client: 'Firefox trên Ubuntu' },
    note: 'Quản trị hệ thống – màn 05.6',
  },
  {
    id: 'u-quan-tm',
    username: 'quan.tm',
    email: 'quan.tm@abc.vn',
    fullName: 'Trần Minh Quân',
    department: 'KD',
    roles: ['NV_KD'],
    password: SEED_PASSWORD,
    status: 'active',
    seedLockSeconds: 14 * 60 + 32,
    note: 'Đang tạm khóa do sai mật khẩu 5 lần – màn 01.4 (E3)',
  },
  {
    id: 'u-tuan-lv',
    username: 'tuan.lv',
    email: 'tuan.lv@abc.vn',
    fullName: 'Lê Văn Tuấn',
    department: 'KD',
    roles: ['NV_KD'],
    password: SEED_PASSWORD,
    status: 'disabled',
    note: 'Đã nghỉ việc, tài khoản vô hiệu hóa – màn 01.5 (E4)',
  },
  {
    id: 'u-thao-nt',
    username: 'thao.nt',
    email: 'thao.nt@abc.vn',
    fullName: 'Nguyễn Thị Thảo',
    department: 'KTOAN',
    roles: [],
    password: SEED_PASSWORD,
    status: 'active',
    note: 'Chưa được gán vai trò – màn 01.6 (E5)',
  },
  {
    id: 'u-khoa-pv',
    username: 'khoa.pv',
    email: 'khoa.pv@abc.vn',
    fullName: 'Phan Văn Khoa',
    department: 'KT',
    roles: [],
    password: SEED_PASSWORD,
    status: 'active',
    note: 'Chưa được gán vai trò – màn 01.6 (E5)',
  },
  {
    id: 'u-test-loi',
    username: 'test.loi',
    email: 'test.loi@abc.vn',
    fullName: 'Tài khoản kiểm thử lỗi',
    department: 'KD',
    roles: ['NV_KD'],
    password: SEED_PASSWORD,
    status: 'active',
    simulateSystemError: true,
    note: 'Giả lập lỗi hệ thống khi đăng nhập – màn 01.7 (E6)',
  },
  {
    id: 'u-linh-pt',
    username: 'linh.pt',
    email: 'linh.pt@abc.vn',
    fullName: 'Phạm Thùy Linh',
    department: 'KD',
    roles: ['NV_KD'],
    password: 'TamThoi@2026',
    status: 'active',
    mustChangePassword: true,
    note: 'Nhân viên mới, đăng nhập lần đầu bằng mật khẩu tạm TamThoi@2026 – màn 04.6',
  },
  {
    id: 'u-test-luu',
    username: 'test.luu',
    email: 'test.luu@abc.vn',
    fullName: 'Tài khoản kiểm thử lỗi lưu',
    department: 'KD',
    roles: ['NV_KD'],
    password: SEED_PASSWORD,
    status: 'active',
    simulateSaveError: true,
    note: 'Lần đổi mật khẩu đầu tiên bị lỗi khi lưu – màn 04.4 (E4)',
  },
];
