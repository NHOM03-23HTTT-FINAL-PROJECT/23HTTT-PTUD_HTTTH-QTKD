import { useState, type ReactNode } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useUnsavedChanges } from '@/app/providers/SessionProvider';
import { ButtonLink } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { InputField } from '@/components/form/InputField';
import { findNavItem } from '@/constants/navigation';
import type { Permission } from '@/constants/roles';
import { ROUTES } from '@/constants/routes';
import { findSeedContract } from '@/mocks/seed/dashboards';
import { RequirePermission } from './guards';
import './PlaceholderPages.css';

type PlaceholderLayoutProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
};

function PlaceholderLayout({ eyebrow, title, subtitle, children }: PlaceholderLayoutProps) {
  return (
    <div className="placeholder-page">
      <p className="placeholder-page__eyebrow">{eyebrow}</p>
      <h1 className="placeholder-page__title">{title}</h1>
      {subtitle && <p className="placeholder-page__subtitle">{subtitle}</p>}
      {children}
      <div>
        <ButtonLink to={ROUTES.dashboard} variant="secondary">
          Về bảng điều khiển
        </ButtonLink>
      </div>
    </div>
  );
}

/** Màn hình trong menu nhưng thuộc UC khác, chưa nằm trong phạm vi UC-CHUNG-01. */
export function NavPlaceholderPage() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const item = findNavItem(pathname, user?.departmentInfo.workspace);
  if (!item) return <NotFoundPage />;

  return (
    <RequirePermission permission={item.permission} label={item.label}>
      <PlaceholderLayout eyebrow={item.module} title={item.label}>
        <Alert tone="info" title="Màn hình đang được xây dựng">
          Chức năng "{item.label}" thuộc {item.module}, chưa có trong bản prototype.
        </Alert>
        {pathname.endsWith('/tao-moi') && <UnsavedDraftProbe formName={item.label} />}
      </PlaceholderLayout>
    </RequirePermission>
  );
}

/**
 * Chỉ có trong prototype: thay cho biểu mẫu thật để thử luồng "Đăng xuất khi có dữ liệu chưa lưu" (03.1).
 * Biểu mẫu thật chỉ cần gọi `useUnsavedChanges` khi có thay đổi chưa lưu.
 */
function UnsavedDraftProbe({ formName }: { formName: string }) {
  const [draftName, setDraftName] = useState('');
  useUnsavedChanges(draftName.trim() ? `${formName} – ${draftName.trim()}` : null);

  return (
    <section className="placeholder-probe">
      <p className="placeholder-probe__title">Thử dữ liệu chưa lưu (chỉ có trong prototype)</p>
      <InputField
        label="Tên hồ sơ đang soạn"
        icon="file"
        placeholder="Ví dụ: Công ty TNHH Minh Phát"
        value={draftName}
        onChange={(e) => setDraftName(e.target.value)}
      />
    </section>
  );
}

const RECORD_KINDS: Record<'contract' | 'payment', { name: string; permission: Permission; module: string }> = {
  contract: { name: 'Hợp đồng', permission: 'contracts.view', module: 'Hợp đồng (CTR)' },
  payment: { name: 'Bảng thanh toán', permission: 'payments.view', module: 'Thanh toán (PAY)' },
};

/** Đích của đường dẫn hồ sơ (ví dụ link trong email): kiểm tra quyền rồi hiển thị trang giữ chỗ. */
export function RecordPlaceholderPage({ kind }: { kind: keyof typeof RECORD_KINDS }) {
  const { code = '' } = useParams();
  const config = RECORD_KINDS[kind];
  const contract = kind === 'contract' ? findSeedContract(code) : undefined;

  return (
    <RequirePermission permission={config.permission} label={`${config.name} ${code}`}>
      <PlaceholderLayout
        eyebrow={config.module}
        title={`${config.name} ${code}`}
        subtitle={contract ? `${contract.customer} · ${contract.service}` : undefined}
      >
        <Alert tone="info" title="Đã mở đúng hồ sơ được yêu cầu">
          Màn hình chi tiết thuộc {config.module} và chưa có trong bản prototype UC-CHUNG-01.
        </Alert>
      </PlaceholderLayout>
    </RequirePermission>
  );
}

export function NotFoundPage() {
  return (
    <PlaceholderLayout eyebrow="404" title="Không tìm thấy trang">
      <Alert tone="warning" title="Đường dẫn không tồn tại">
        Kiểm tra lại đường dẫn hoặc quay về bảng điều khiển.
      </Alert>
    </PlaceholderLayout>
  );
}
