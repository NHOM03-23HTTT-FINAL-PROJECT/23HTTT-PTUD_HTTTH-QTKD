import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icon/Icon';
import './AuthLayout.css';

const FEATURES: { icon: IconName; label: string }[] = [
  { icon: 'users', label: 'Khách hàng · Hợp đồng · Bảng giá' },
  { icon: 'layers', label: 'Khu vực khai thác · Sản lượng theo kỳ' },
  { icon: 'workflow', label: 'Phê duyệt nhiều cấp & ký điện tử' },
  { icon: 'history', label: 'Nhật ký truy vết mọi thao tác' },
];

/** Bố cục màn đăng nhập (frame 01.x): panel thương hiệu bên trái, biểu mẫu bên phải. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-layout">
      <aside className="auth-brand">
        <div className="auth-brand__logo">
          <span className="auth-brand__mark">
            <Icon name="layers" />
          </span>
          <div>
            <p className="auth-brand__name">ABC Logistics</p>
            <p className="auth-brand__product">ERP Quản trị kinh doanh</p>
          </div>
        </div>
        <div className="auth-brand__spacer" />
        <h1 className="auth-brand__headline">Quản lý vòng đời hồ sơ kinh doanh tập trung</h1>
        <p className="auth-brand__lead">
          Từ khách hàng, hợp đồng, bảng giá, sản lượng, bảng thanh toán đến phê duyệt và ký điện tử – trên một hệ
          thống duy nhất.
        </p>
        <ul className="auth-brand__features">
          {FEATURES.map((feature) => (
            <li key={feature.label} className="auth-brand__feature">
              <span className="auth-brand__feature-icon">
                <Icon name={feature.icon} />
              </span>
              {feature.label}
            </li>
          ))}
        </ul>
        <div className="auth-brand__spacer" />
        <p className="auth-brand__footer">
          Hệ thống nội bộ Công ty ABC · Tài khoản do Quản trị hệ thống cấp · Phiên bản 1.0
        </p>
      </aside>
      <main className="auth-panel">{children}</main>
    </div>
  );
}
