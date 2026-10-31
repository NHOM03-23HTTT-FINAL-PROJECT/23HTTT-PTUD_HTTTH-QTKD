import { useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSession, useUnsavedChanges } from '@/app/providers/SessionProvider';
import { Button, ButtonLink } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { Dialog } from '@/components/feedback/Dialog';
import { FileUploadField } from '@/components/file-upload/FileUploadField';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { Icon, type IconName } from '@/components/icon/Icon';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { ROUTES } from '@/constants/routes';
import { formatTime } from '@/utils/format';
import { customersApi } from '../api/customersApi';
import { customerStatusApi } from '../api/customerStatusApi';
import { DecisionItem, StepProgress } from '../components/CustomerStatusPanels';
import type { Customer } from '../types/customer';
import {
  StatusChangeError,
  type AttachedFile,
  type ImpactKind,
  type SuspensionReview,
} from '../types/customerStatus';
import type { CustomerDetailState } from './CustomerDetailPage';
import './CustomerPages.css';
import './CustomerStatus.css';

const STEPS = ['Lý do tạm ngưng', 'Rà soát ảnh hưởng & phương án', 'Xác nhận'];

const SUSPEND_EFFECTS = [
  'Không tạo được hợp đồng, bảng giá cho giao dịch dịch vụ mới.',
  'Hợp đồng, bảng giá, hồ sơ đang duyệt không tự bị hủy hoặc đổi trạng thái.',
  'Vẫn đối soát, tính phí và thu công nợ cho dịch vụ đã thực hiện (US-CUS-16).',
];

const KIND_META: Record<ImpactKind, { label: string; stat: string; icon: IconName; source: string; department: string }> = {
  contract: { label: 'Hợp đồng', stat: 'Hợp đồng còn hiệu lực', icon: 'file', source: 'phân hệ Hợp đồng', department: 'Pháp chế' },
  job: { label: 'Công việc', stat: 'Công việc đang thực hiện', icon: 'clock', source: 'phân hệ Khai thác', department: 'Khai thác' },
  service: { label: 'Dịch vụ', stat: 'Dịch vụ chưa tính phí', icon: 'alert', source: 'phân hệ Sản lượng', department: 'Kế toán' },
  approval: { label: 'Hồ sơ', stat: 'Hồ sơ đang duyệt', icon: 'inbox', source: 'phân hệ Phê duyệt', department: 'Kinh doanh' },
};
const KINDS = Object.keys(KIND_META) as ImpactKind[];

type ServerAlert = 'save-failed' | 'network' | 'conflict' | 'forbidden' | 'review-incomplete' | 'review-failed';

function newIdempotencyKey() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/** UC-CUS-03 · Tạm ngưng giao dịch với khách hàng – frame 03.1 → 03.8. */
export function CustomerSuspendPage() {
  const { code = '' } = useParams();
  const customer = customersApi.getCustomer(code);

  if (!customer) {
    return (
      <>
        <nav className="breadcrumb" aria-label="Đường dẫn">
          <Link to={ROUTES.customers}>Khách hàng</Link>
          <span className="breadcrumb__separator">/</span>
          <span className="breadcrumb__current" aria-current="page">
            {code}
          </span>
        </nav>
        <Alert tone="warning" title="Không mở được hồ sơ khách hàng">
          Không có khách hàng mã {code} hoặc bạn không có quyền thao tác trên hồ sơ này.
        </Alert>
        <div>
          <ButtonLink to={ROUTES.customers} variant="secondary">
            Về danh sách
          </ButtonLink>
        </div>
      </>
    );
  }
  // A2: đã Tạm ngưng thì không mở lại thao tác; hồ sơ hiển thị trạng thái hiện tại (03.7).
  if (customer.status === 'suspended') {
    const state: CustomerDetailState = { alreadySuspended: true };
    return <Navigate to={ROUTES.customerDetail(customer.code)} replace state={state} />;
  }
  return <SuspendFlow key={customer.code} customer={customer} />;
}

function SuspendFlow({ customer }: { customer: Customer }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { endSession } = useSession();
  const reasonGroups = useMemo(
    () => customerStatusApi.getSuspensionReasonGroups().map(({ code, label }) => ({ value: code, label })),
    [],
  );

  const [step, setStep] = useState<0 | 1>(0);
  const [reasonGroup, setReasonGroup] = useState('');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState<AttachedFile[]>([]);
  const [attempted, setAttempted] = useState(false);
  const [review, setReview] = useState<SuspensionReview | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);
  const [plan, setPlan] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverAlert, setServerAlert] = useState<ServerAlert | null>(null);
  const inFlight = useRef(false);
  const idempotencyKey = useRef(newIdempotencyKey());

  const dirty = Boolean(reasonGroup || reason.trim() || evidence.length || note.trim());
  useUnsavedChanges(dirty ? `Tạm ngưng khách hàng – ${customer.code}` : null);

  const errors = {
    reasonGroup: attempted && !reasonGroup ? 'Vui lòng chọn nhóm lý do tạm ngưng.' : undefined,
    reason: attempted && !reason.trim() ? 'Vui lòng nhập nội dung cụ thể (không chỉ gồm khoảng trắng).' : undefined,
  };
  const reasonLabel = reasonGroups.find((g) => g.value === reasonGroup)?.label ?? '';
  const reviewFailed = (review?.failedKinds.length ?? 0) > 0;
  const backToDetail = () => navigate(ROUTES.customerDetail(customer.code));

  async function loadReview(retry: boolean) {
    setLoadingReview(true);
    try {
      const result = await customerStatusApi.getSuspensionReview(customer.code, retry);
      setReview(result);
      // Giữ hướng xử lý đã chọn; mục mới lấy hướng đầu tiên làm mặc định.
      setPlan((current) => Object.fromEntries(result.items.map((item) => [item.id, current[item.id] ?? item.options[0]])));
      setServerAlert(null);
    } catch {
      setServerAlert('review-failed');
    } finally {
      setLoadingReview(false);
    }
  }

  // Bước 1 → 2: lý do bắt buộc (A3), sau đó hệ thống rà soát phạm vi ảnh hưởng.
  async function continueToReview() {
    setAttempted(true);
    if (!reasonGroup || !reason.trim()) return;
    await loadReview(false);
    setStep(1);
  }

  async function confirm() {
    if (inFlight.current || !user) return;
    inFlight.current = true;
    setSubmitting(true);
    setServerAlert(null);
    try {
      const { replayed } = await customerStatusApi.suspend({
        userId: user.id,
        signedInAt: user.signedInAt,
        idempotencyKey: idempotencyKey.current,
        code: customer.code,
        baseVersion: customer.version,
        reasonGroup,
        reason,
        evidence,
        plan: Object.entries(plan).map(([id, option]) => ({ id, option })),
        coordinationNote: note,
      });
      const state: CustomerDetailState = { suspended: true, replayed };
      navigate(ROUTES.customerDetail(customer.code), { replace: true, state });
    } catch (error) {
      setConfirmOpen(false);
      const code = error instanceof StatusChangeError ? error.code : 'NETWORK';
      if (code === 'SESSION_ENDED' && error instanceof StatusChangeError) endSession(error.sessionStatus ?? 'expired');
      else if (code === 'ALREADY_IN_STATUS') {
        const state: CustomerDetailState = { alreadySuspended: true };
        navigate(ROUTES.customerDetail(customer.code), { replace: true, state });
      } else if (code === 'CONFLICT' || code === 'NOT_FOUND') setServerAlert('conflict');
      else if (code === 'FORBIDDEN') setServerAlert('forbidden');
      else if (code === 'REVIEW_INCOMPLETE') setServerAlert('review-incomplete');
      else if (code === 'VALIDATION') {
        setStep(0);
        setAttempted(true);
      } else setServerAlert(code === 'SAVE_FAILED' ? 'save-failed' : 'network');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const affectedCount = review?.items.length ?? 0;
  const noticeDepartments = [
    ...new Set((review?.items ?? []).map((i) => i.department).filter((d) => d !== 'Kinh doanh')),
  ];

  return (
    <>
      <nav className="breadcrumb" aria-label="Đường dẫn">
        <span>Khách hàng</span>
        <span className="breadcrumb__separator">/</span>
        <span>{customer.code}</span>
        <span className="breadcrumb__separator">/</span>
        <span className="breadcrumb__current" aria-current="page">
          Tạm ngưng
        </span>
      </nav>

      <div className="page-header page-header--customer">
        <div className="page-header__title">
          <div className="customer-title">
            <h1>Tạm ngưng khách hàng</h1>
            <StatusBadge label="Hoạt động" tone="success" />
          </div>
          <p>
            {customer.name} · {customer.code} · MST {customer.taxCode}
          </p>
        </div>
        <div className="page-header__actions">
          {step === 0 ? (
            <>
              <Button variant="secondary" disabled={loadingReview} onClick={backToDetail}>
                Hủy
              </Button>
              <Button disabled={loadingReview} className={loadingReview ? 'is-busy' : undefined} onClick={() => void continueToReview()}>
                {loadingReview ? 'Đang rà soát…' : 'Tiếp tục rà soát'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" disabled={submitting} onClick={() => setStep(0)}>
                Quay lại
              </Button>
              <Button
                variant="danger"
                disabled={submitting || !review || reviewFailed || loadingReview}
                className={submitting ? 'is-busy' : undefined}
                onClick={() => setConfirmOpen(true)}
              >
                {submitting ? 'Đang xác nhận…' : 'Xác nhận tạm ngưng'}
              </Button>
            </>
          )}
        </div>
      </div>

      <StepProgress steps={STEPS} current={confirmOpen ? 2 : step} />

      {step === 0 && attempted && (errors.reasonGroup || errors.reason) && (
        <Alert tone="danger" title="Chưa thể tiếp tục">
          Vui lòng chọn nhóm lý do và nhập nội dung cụ thể trước khi rà soát ảnh hưởng.
        </Alert>
      )}
      {step === 1 && reviewFailed && review && (
        <Alert
          tone="danger"
          title="Chưa tải đủ dữ liệu rà soát"
          action={
            <button type="button" className="alert__link" disabled={loadingReview} onClick={() => void loadReview(true)}>
              {loadingReview ? 'Đang tải lại…' : 'Tải lại kết quả rà soát'}
            </button>
          }
        >
          Không tải được danh sách {review.failedKinds.map((k) => KIND_META[k].stat.toLowerCase()).join(', ')} từ{' '}
          {review.failedKinds.map((k) => KIND_META[k].source).join(', ')}. Hệ thống không cho xác nhận tạm ngưng dựa trên kết
          quả chưa đầy đủ.
        </Alert>
      )}
      {serverAlert && (
        <SuspendAlertBanner
          kind={serverAlert}
          retrying={submitting || loadingReview}
          onRetry={() => (serverAlert === 'review-failed' || serverAlert === 'review-incomplete' ? void loadReview(true) : void confirm())}
          onReload={backToDetail}
        />
      )}

      {step === 0 ? (
        <div className="customer-layout">
          <div className="customer-card">
            <div className="customer-card__heading">
              <h2>Lý do tạm ngưng</h2>
              <p>Lý do và căn cứ được lưu cùng quyết định tạm ngưng.</p>
            </div>
            <SelectField
              label="Nhóm lý do"
              required
              placeholder="Chọn nhóm lý do"
              options={reasonGroups}
              value={reasonGroup}
              error={errors.reasonGroup}
              disabled={loadingReview}
              onChange={setReasonGroup}
            />
            <TextAreaField
              label="Nội dung cụ thể"
              required
              placeholder="Mô tả cụ thể lý do, kỳ công nợ, sự việc…"
              value={reason}
              error={errors.reason}
              disabled={loadingReview}
              onChange={(e) => setReason(e.target.value)}
            />
            <FileUploadField label="Căn cứ liên quan (nếu có)" files={evidence} onChange={setEvidence} disabled={loadingReview} />
          </div>
          <aside className="customer-layout__side">
            <section className="side-card">
              <h2 className="side-card__title">Khách hàng</h2>
              <div className="side-card__item">
                <span className="side-card__label">Mã khách hàng</span>
                <span className="side-card__value">{customer.code}</span>
              </div>
              <div className="side-card__item">
                <span className="side-card__label">Mã số thuế</span>
                <span className="side-card__value">{customer.taxCode}</span>
              </div>
              <div className="side-card__item">
                <span className="side-card__label">Trạng thái hiện tại</span>
                <StatusBadge label="Hoạt động" tone="success" />
              </div>
              <div className="side-card__item">
                <span className="side-card__label">Nhân viên phụ trách</span>
                <span className="side-card__value">{customer.ownerName}</span>
              </div>
            </section>
            <section className="side-card">
              <h2 className="side-card__title">Khi khách hàng bị tạm ngưng</h2>
              <ul className="side-card__notes">
                {SUSPEND_EFFECTS.map((effect) => (
                  <li key={effect}>{effect}</li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      ) : (
        review && (
          <>
            <div className="impact-stats">
              {KINDS.map((kind) => {
                const failed = review.failedKinds.includes(kind);
                const items = review.items.filter((i) => i.kind === kind);
                return (
                  <section key={kind} className="impact-stat">
                    <div>
                      <span className="impact-stat__label">{KIND_META[kind].stat}</span>
                      <span className="impact-stat__value">{failed ? '—' : items.length}</span>
                      <span className="impact-stat__sub">
                        {failed ? 'Chưa tải được' : items.length ? items.map((i) => i.code).join(', ') : 'Không có'}
                      </span>
                    </div>
                    <span className="impact-stat__icon">
                      <Icon name={KIND_META[kind].icon} />
                    </span>
                  </section>
                );
              })}
            </div>

            <section className="customer-card impact-card">
              <div className="customer-card__heading">
                <h2>Hồ sơ và công việc bị ảnh hưởng</h2>
                <p>
                  Rà soát hợp đồng còn hiệu lực, công việc đang thực hiện, dịch vụ chưa tính phí và hồ sơ đang duyệt. Tạm ngưng
                  không tự hủy hoặc dừng các mục này.
                </p>
              </div>
              {(affectedCount > 0 || reviewFailed) && (
                <p className="impact-table__hint">Cuộn ngang nếu cần để xem đầy đủ các cột.</p>
              )}
              <div
                className="impact-table__wrap"
                role="region"
                aria-label={`Hồ sơ và công việc bị ảnh hưởng${affectedCount > 0 || reviewFailed ? ', có thể cuộn ngang' : ''}`}
                tabIndex={affectedCount > 0 || reviewFailed ? 0 : undefined}
              >
                <table className={affectedCount === 0 && !reviewFailed ? 'impact-table impact-table--empty' : 'impact-table'}>
                  <thead>
                    <tr>
                      <th scope="col">Loại</th>
                      <th scope="col">Hồ sơ / công việc</th>
                      <th scope="col">Trạng thái</th>
                      <th scope="col">Phụ trách</th>
                      <th scope="col">Hướng xử lý</th>
                    </tr>
                  </thead>
                  <tbody>
                    {KINDS.flatMap((kind) => {
                      if (review.failedKinds.includes(kind)) {
                        return [
                          <tr key={kind}>
                            <td>
                              <span className="impact-table__main">{KIND_META[kind].label}</span>
                              <span className="impact-table__sub">Chưa tải được</span>
                            </td>
                            <td>
                              <span className="impact-table__main">Không tải được dữ liệu từ {KIND_META[kind].source}</span>
                              <span className="impact-table__sub">
                                Lỗi kết nối lúc {review.failedAt ? formatTime(review.failedAt) : '—'}
                              </span>
                            </td>
                            <td>
                              <StatusBadge label="Lỗi tải dữ liệu" tone="danger" />
                            </td>
                            <td>{KIND_META[kind].department}</td>
                            <td>
                              <button type="button" className="link-button" disabled={loadingReview} onClick={() => void loadReview(true)}>
                                Tải lại
                              </button>
                            </td>
                          </tr>,
                        ];
                      }
                      return review.items
                        .filter((item) => item.kind === kind)
                        .map((item) => (
                          <tr key={item.id}>
                            <td>
                              <span className="impact-table__main">{KIND_META[kind].label}</span>
                              <span className="impact-table__sub">{item.kindNote}</span>
                            </td>
                            <td>
                              <span className="impact-table__main">{item.title}</span>
                              <span className="impact-table__sub">{item.detail}</span>
                            </td>
                            <td>
                              <StatusBadge label={item.statusLabel} tone={item.statusTone} />
                            </td>
                            <td>{item.department}</td>
                            <td>
                              <select
                                className="impact-table__select"
                                aria-label={`Hướng xử lý ${item.title}`}
                                value={plan[item.id]}
                                disabled={submitting}
                                onChange={(e) => setPlan((current) => ({ ...current, [item.id]: e.target.value }))}
                              >
                                {item.options.map((option) => (
                                  <option key={option}>{option}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ));
                    })}
                    {review.items.length === 0 && !reviewFailed && (
                      <tr>
                        <td colSpan={5} className="impact-table__empty">
                          Không có hồ sơ hoặc công việc còn mở bị ảnh hưởng.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="customer-layout">
              <section className="customer-card">
                <div className="customer-card__heading">
                  <h2>Nội dung cần phối hợp sau tạm ngưng</h2>
                  <p>Cho phép ghi nhận khi phương án chưa hoàn chỉnh (A5).</p>
                </div>
                <TextAreaField
                  label="Ghi chú phối hợp"
                  placeholder="Việc cần các bộ phận phối hợp sau khi tạm ngưng"
                  value={note}
                  disabled={submitting}
                  onChange={(e) => setNote(e.target.value)}
                />
              </section>
              <aside className="customer-layout__side">
                <section className="side-card">
                  <h2 className="side-card__title">Lý do đã nhập</h2>
                  <dl className="customer-detail__grid customer-detail__grid--single">
                    <DecisionItem label="Nhóm lý do">{reasonLabel}</DecisionItem>
                    <DecisionItem label="Nội dung">{reason.trim()}</DecisionItem>
                    <DecisionItem label="Căn cứ">{evidence.length ? evidence.map((f) => f.name).join(', ') : '—'}</DecisionItem>
                  </dl>
                </section>
              </aside>
            </div>
          </>
        )
      )}

      {confirmOpen && (
        <Dialog
          title={`Xác nhận tạm ngưng ${customer.name}?`}
          width={520}
          initialFocus="first"
          onClose={() => !submitting && setConfirmOpen(false)}
          actions={
            <>
              <Button variant="secondary" disabled={submitting} onClick={() => setConfirmOpen(false)}>
                Quay lại
              </Button>
              <Button variant="danger" disabled={submitting} className={submitting ? 'is-busy' : undefined} onClick={() => void confirm()}>
                {submitting ? 'Đang xác nhận…' : 'Xác nhận tạm ngưng'}
              </Button>
            </>
          }
        >
          <p className="dialog__body">Sau khi xác nhận:</p>
          <ul className="confirm-list">
            <li>
              <Icon name="check" className="icon-tone--success" />
              Trạng thái khách hàng chuyển Hoạt động → Tạm ngưng từ thời điểm xác nhận.
            </li>
            <li>
              <Icon name="check" className="icon-tone--success" />
              Không phát sinh hợp đồng, bảng giá cho giao dịch dịch vụ mới.
            </li>
            {affectedCount > 0 && (
              <li>
                <Icon name="check" className="icon-tone--success" />
                {affectedCount} hồ sơ, công việc liên quan giữ nguyên trạng thái và xử lý theo phương án đã ghi nhận.
              </li>
            )}
            <li>
              <Icon name="check" className="icon-tone--success" />
              {(noticeDepartments.length ? noticeDepartments : ['Kế toán']).join(', ')} nhận thông báo quyết định và phương án.
            </li>
          </ul>
        </Dialog>
      )}
    </>
  );
}

type AlertBannerProps = { kind: ServerAlert; retrying: boolean; onRetry: () => void; onReload: () => void };

/** Banner lỗi khi xác nhận tạm ngưng (03.8) hoặc khi không tải được kết quả rà soát. */
function SuspendAlertBanner({ kind, retrying, onRetry, onReload }: AlertBannerProps) {
  const retry = (label: string) => (
    <button type="button" className="alert__link" disabled={retrying} onClick={onRetry}>
      {retrying ? 'Đang kiểm tra…' : label}
    </button>
  );
  switch (kind) {
    case 'save-failed':
      return (
        <Alert tone="danger" title="Tạm ngưng không thành công" action={retry('Kiểm tra kết quả và thử lại')}>
          Không lưu được trạng thái hoặc lịch sử, thao tác đã được hoàn tác; khách hàng vẫn Hoạt động. Nếu mất kết nối, hệ thống
          kiểm tra kết quả trước khi cho thử lại để tránh ghi nhận trùng.
        </Alert>
      );
    case 'network':
      return (
        <Alert tone="danger" title="Chưa nhận được kết quả tạm ngưng" action={retry('Kiểm tra kết quả và thử lại')}>
          Kết nối bị gián đoạn sau khi xác nhận nên chưa xác định được khách hàng đã chuyển Tạm ngưng hay chưa. Hệ thống kiểm tra
          kết quả thao tác đã gửi trước khi cho thử lại, không ghi nhận trùng.
        </Alert>
      );
    case 'conflict':
      return (
        <Alert
          tone="danger"
          title="Không thể tạm ngưng"
          action={
            <button type="button" className="alert__link" onClick={onReload}>
              Mở lại hồ sơ khách hàng
            </button>
          }
        >
          Dữ liệu khách hàng đã thay đổi kể từ khi bắt đầu thao tác. Hệ thống từ chối yêu cầu; hãy kiểm tra lại hồ sơ trước khi
          thực hiện tạm ngưng.
        </Alert>
      );
    case 'forbidden':
      return (
        <Alert tone="danger" title="Không còn quyền tạm ngưng khách hàng">
          Quyền của tài khoản đã thay đổi nên yêu cầu bị từ chối; khách hàng vẫn Hoạt động.
        </Alert>
      );
    case 'review-incomplete':
      return (
        <Alert tone="danger" title="Phương án xử lý chưa đầy đủ" action={retry('Tải lại kết quả rà soát')}>
          Danh sách hồ sơ bị ảnh hưởng đã thay đổi. Tải lại kết quả rà soát và chọn hướng xử lý cho từng mục trước khi xác nhận.
        </Alert>
      );
    case 'review-failed':
      return (
        <Alert tone="danger" title="Không rà soát được ảnh hưởng" action={retry('Tải lại kết quả rà soát')}>
          Hệ thống chưa tải được dữ liệu cần rà soát; khách hàng vẫn Hoạt động.
        </Alert>
      );
  }
}
