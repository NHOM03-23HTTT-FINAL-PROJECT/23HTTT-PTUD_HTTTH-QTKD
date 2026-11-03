import type { ReactNode } from 'react';
import { ButtonLink } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import type { Permission } from '@/constants/roles';
import { ROUTES } from '@/constants/routes';
import { IS_MOCK_AUTH } from '@/features/auth/api/authApi';
import { RequirePermission } from './guards';
import './PlaceholderPages.css';

/** Các màn nghiệp vụ hiện chỉ có mock. Chỉ mount khi dùng danh tính prototype. */
export function BusinessRoute({ permission, label, children, apiReady = false }: {
  apiReady?: boolean;
  permission?: Permission;
  label: string;
  children: ReactNode;
}) {
  return (
    <RequirePermission permission={permission} label={label}>
      {(IS_MOCK_AUTH || apiReady) ? children : (
        <div className="placeholder-page">
          <h1 className="placeholder-page__title">{label}</h1>
          <Alert tone="info" title="Chức năng chưa sẵn sàng">
            Chức năng này chưa được kết nối với hệ thống. Bạn vẫn đang đăng nhập và có thể tiếp tục sử dụng các chức năng khác.
          </Alert>
          <ButtonLink to={ROUTES.dashboard} variant="secondary">Về bảng điều khiển</ButtonLink>
        </div>
      )}
    </RequirePermission>
  );
}
