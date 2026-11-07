import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { Button, ButtonLink } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { Dialog } from '@/components/feedback/Dialog';
import { InputField } from '@/components/form/InputField';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { ROUTES } from '@/constants/routes';
import { IS_MOCK_AUTH } from '@/features/auth/api/authApi';
import { ApiError } from '@/lib/http/client';
import { formatDateTime } from '@/utils/format';
import { customerDelegationsApi, type CustomerDelegation, type DelegationAction, type DelegationCandidate } from '../api/customerDelegationsApi';
import './CustomerPages.css';
import './CustomerDelegations.css';

const actionLabel: Record<DelegationAction, string> = { suspend: 'Tạm ngưng khách hàng', reactivate: 'Kích hoạt lại khách hàng' };
const stateLabel: Record<CustomerDelegation['state'], string> = { active: 'Còn hiệu lực', expired: 'Hết hạn', revoked: 'Đã thu hồi', ineligible: 'Không còn đủ điều kiện' };

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === 'DELEGATION_EXISTS') return 'Nhân viên đã có quyền này còn hiệu lực. Hãy thu hồi quyền cũ trước khi cấp lại.';
    if (error.code === 'DELEGATION_RECIPIENT_INVALID') return 'Nhân viên không còn đủ điều kiện nhận quyền. Vui lòng tải lại danh sách.';
    if (error.code === 'DELEGATION_EXPIRY_INVALID') return 'Thời điểm hết hạn phải ở trong tương lai.';
    if (error.status === 403) return 'Bạn không còn quyền quản lý ủy quyền. Vui lòng liên hệ quản trị viên.';
  }
  return 'Không kết nối được hoặc không lưu được thay đổi. Vui lòng thử lại.';
}

export function CustomerDelegationsPage() {
  const { user } = useAuth();
  if (IS_MOCK_AUTH) return <Alert tone="info" title="Chưa thể quản lý ủy quyền">Chức năng này cần kết nối dịch vụ khách hàng.</Alert>;
  if (!user?.roles.includes('TP_KD')) return <Alert tone="warning" title="Bạn không có quyền quản lý ủy quyền" />;
  return <DelegationsContent />;
}

function DelegationsContent() {
  const [candidates, setCandidates] = useState<DelegationCandidate[]>([]);
  const [items, setItems] = useState<CustomerDelegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [granteeId, setGranteeId] = useState('');
  const [action, setAction] = useState<DelegationAction>('reactivate');
  const [expires, setExpires] = useState('');
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revoke, setRevoke] = useState<CustomerDelegation | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const [nextCandidates, nextItems] = await Promise.all([customerDelegationsApi.candidates(), customerDelegationsApi.list()]);
      setCandidates(nextCandidates); setItems(nextItems);
    } catch (err) { setLoadError(errorMessage(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function grant(event: FormEvent) {
    event.preventDefault(); setAttempted(true); setError(''); setNotice('');
    if (!granteeId) return;
    const expiry = expires ? new Date(expires) : null;
    if (expiry && (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now())) {
      setError('Thời điểm hết hạn phải ở trong tương lai.'); return;
    }
    if (inFlight.current) return;
    inFlight.current = true; setSaving(true);
    try {
      await customerDelegationsApi.grant({ granteeId, action, expiresAt: expiry?.toISOString() ?? null, reason: reason.trim() || null });
      setNotice('Đã giao quyền. Quyền chỉ áp dụng cho khách hàng nhân viên đang phụ trách.');
      setGranteeId(''); setExpires(''); setReason(''); setAttempted(false);
      await load();
    } catch (err) { setError(errorMessage(err)); }
    finally { inFlight.current = false; setSaving(false); }
  }

  async function confirmRevoke() {
    if (!revoke || inFlight.current) return;
    inFlight.current = true; setSaving(true); setError(''); setNotice('');
    try {
      await customerDelegationsApi.revoke(revoke.id);
      setRevoke(null); setNotice('Đã thu hồi quyền.'); await load();
    } catch (err) { setRevoke(null); setError(errorMessage(err)); }
    finally { inFlight.current = false; setSaving(false); }
  }

  return <>
    <nav className="breadcrumb" aria-label="Đường dẫn"><Link to={ROUTES.customers}>Khách hàng</Link><span className="breadcrumb__separator">/</span><span aria-current="page">Ủy quyền trạng thái khách hàng</span></nav>
    <div className="page-header"><div className="page-header__title"><h1>Ủy quyền trạng thái khách hàng</h1>
      <p>Giao riêng quyền tạm ngưng hoặc kích hoạt lại cho từng nhân viên Kinh doanh trong phòng.</p></div>
      <div className="page-header__actions"><ButtonLink to={ROUTES.customers} variant="secondary">Về danh sách</ButtonLink></div>
    </div>
    <div className="delegation-page">
      <Alert tone="info" title="Phạm vi quyền">Nhân viên chỉ được thao tác trên khách hàng mình đang phụ trách. Việc giao quyền không thay thế các bước rà soát nghiệp vụ.</Alert>
      {notice && <Alert tone="success" title={notice} />}
      {error && <Alert tone="danger" title="Chưa hoàn tất thao tác">{error}</Alert>}
      {loadError && <Alert tone="danger" title="Không tải được thông tin" action={<Button variant="secondary" onClick={() => void load()}>Thử lại</Button>}>{loadError}</Alert>}
      <form className="customer-card delegation-form" onSubmit={(event) => void grant(event)}>
        <div className="customer-card__heading"><h2>Giao quyền</h2><p>Mỗi quyền chỉ áp dụng cho khách do nhân viên đó đang phụ trách.</p></div>
        <div className="customer-form__grid">
          <SelectField label="Nhân viên" required placeholder="Chọn nhân viên" value={granteeId} onChange={setGranteeId} disabled={loading || saving || Boolean(loadError)}
            options={candidates.map((candidate) => ({ value: candidate.id, label: `${candidate.name} (${candidate.username})` }))} error={attempted && !granteeId ? 'Vui lòng chọn nhân viên.' : undefined} />
          <SelectField label="Thao tác được giao" placeholder="Chọn thao tác" value={action} onChange={value => setAction(value as DelegationAction)} disabled={saving}
            options={Object.entries(actionLabel).map(([value, label]) => ({ value, label }))} />
          <InputField label="Hết hiệu lực lúc" type="datetime-local" value={expires} onChange={(event) => setExpires(event.target.value)} disabled={saving} hint="Không bắt buộc; dùng giờ trên thiết bị của bạn." />
        </div>
        <TextAreaField label="Ghi chú" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} disabled={saving} hint="Không bắt buộc." />
        <div><Button type="submit" disabled={saving || loading || Boolean(loadError)}>{saving ? 'Đang lưu…' : 'Giao quyền'}</Button></div>
      </form>
      <section className="customer-card"><div className="customer-card__heading"><h2>Quyền đã giao</h2><p>Bao gồm quyền còn hiệu lực, hết hạn và đã thu hồi.</p></div>
        {loading ? <p>Đang tải danh sách…</p> : !loadError && items.length === 0 ? <p>Chưa có quyền nào được giao.</p> :
          <ul className="delegation-list">{items.map((item) => <li key={item.id} className="delegation-item">
            <div className="delegation-item__main"><div className="delegation-item__title"><strong>{item.granteeName} ({item.granteeUsername})</strong><StatusBadge label={stateLabel[item.state]} tone={item.state === 'active' ? 'success' : 'neutral'} /></div>
              <p>{actionLabel[item.action]}</p><p>Người giao: {item.grantedBy} · {formatDateTime(item.grantedAt)}</p>
              <p>Hết hiệu lực: {item.expiresAt ? formatDateTime(item.expiresAt) : 'Không đặt thời hạn'}</p>
              {item.reason && <p>Ghi chú: {item.reason}</p>}
              {item.revokedAt && <p>Thu hồi bởi {item.revokedBy} · {formatDateTime(item.revokedAt)}</p>}
            </div>
            {item.state !== 'revoked' && <Button variant="secondary" disabled={saving} onClick={() => setRevoke(item)}>Thu hồi</Button>}
          </li>)}</ul>}
      </section>
    </div>
    {revoke && <Dialog title="Thu hồi quyền đã giao?" initialFocus="first" onClose={() => !saving && setRevoke(null)} actions={<>
      <Button variant="secondary" disabled={saving} onClick={() => setRevoke(null)}>Giữ quyền</Button>
      <Button variant="danger" disabled={saving} onClick={() => void confirmRevoke()}>{saving ? 'Đang thu hồi…' : 'Thu hồi quyền'}</Button></>}>
      <p>Thu hồi quyền <strong>{actionLabel[revoke.action]}</strong> của <strong>{revoke.granteeName}</strong>. Lịch sử giao quyền vẫn được lưu.</p>
    </Dialog>}
  </>;
}
