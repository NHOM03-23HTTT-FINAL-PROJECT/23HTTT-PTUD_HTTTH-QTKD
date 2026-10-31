import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icon/Icon';
import './Alert.css';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const TONE_ICON: Record<AlertTone, IconName> = {
  info: 'info',
  success: 'check',
  warning: 'alert',
  danger: 'x-circle',
};

type AlertProps = {
  tone: AlertTone;
  title: string;
  children?: ReactNode;
  /** Liên kết/nút hành động dưới nội dung, ví dụ "Mở hồ sơ hiện có" (01.4). */
  action?: ReactNode;
};

/** Alert theo component Figma 9:1062 – banner thông báo trong trang. */
export function Alert({ tone, title, children, action }: AlertProps) {
  return (
    <div className={`alert alert--${tone}`} role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}>
      <Icon name={TONE_ICON[tone]} className="alert__icon" />
      <div className="alert__text">
        <p className="alert__title">{title}</p>
        {children && <p className="alert__body">{children}</p>}
        {action && <div className="alert__action">{action}</div>}
      </div>
    </div>
  );
}
