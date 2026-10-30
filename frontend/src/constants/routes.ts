export const ROUTES = {
  login: '/dang-nhap',
  forgotPassword: '/quen-mat-khau',
  dashboard: '/',
  changePassword: '/doi-mat-khau',
  forcedPasswordChange: '/doi-mat-khau-lan-dau',
  contractDetail: (code: string) => `/hop-dong/${code}`,
  paymentDetail: (code: string) => `/bang-thanh-toan/${code}`,
} as const;

/** Tham số giữ đường dẫn người dùng định mở trước khi bị chuyển sang trang đăng nhập (A3). */
export const REDIRECT_PARAM = 'redirect';

/** Loại hồ sơ mở được bằng đường dẫn trực tiếp (ví dụ link trong email thông báo). */
const RECORD_ROUTES = [
  { prefix: '/hop-dong/', name: 'Hợp đồng', pattern: /^HD-\d{4}-\d{3,}$/ },
  { prefix: '/bang-thanh-toan/', name: 'Bảng thanh toán', pattern: /^BTT-\d{4}-\d{3,}$/ },
] as const;

export type RecordTarget = { name: string; code: string };

/** Nhận diện hồ sơ trong đường dẫn, ví dụ "/hop-dong/HD-2026-013?src=email". */
export function describeRecord(path: string): RecordTarget | null {
  const pathname = path.split(/[?#]/)[0];
  for (const route of RECORD_ROUTES) {
    if (!pathname.startsWith(route.prefix)) continue;
    const code = decodeURIComponent(pathname.slice(route.prefix.length));
    if (route.pattern.test(code)) return { name: route.name, code };
  }
  return null;
}

/** Chỉ chấp nhận đường dẫn nội bộ để tránh chuyển hướng ra ngoài hệ thống. */
export function safeRedirect(target: string | null): string | null {
  if (!target || !target.startsWith('/') || target.startsWith('//')) return null;
  return target;
}
