import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSession, useUnsavedChanges } from '@/app/providers/SessionProvider';
import { Button, ButtonLink } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { Dialog } from '@/components/feedback/Dialog';
import { useToast } from '@/components/feedback/Toast';
import { FileUploadField } from '@/components/file-upload/FileUploadField';
import { InputField } from '@/components/form/InputField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { Icon, type IconName } from '@/components/icon/Icon';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { ROUTES } from '@/constants/routes';
import { formatDateTime, formatTime } from '@/utils/format';
import { customersApi } from '../api/customersApi';
import { customerStatusApi } from '../api/customerStatusApi';
import { DecisionItem, StatusHistoryCard } from '../components/CustomerStatusPanels';
import type { Customer } from '../types/customer';
import {
  StatusChangeError,
  type AttachedFile,
  type ReactivationCheck,
  type ReactivationContext,
  type ReactivationException,
} from '../types/customerStatus';
import type { CustomerDetailState } from './CustomerDetailPage';
import './CustomerPages.css';
import './CustomerStatus.css';

const AFTER_REACTIVATION = [
  'Gỡ hạn chế giao dịch mới do trạng thái Tạm ngưng.',
  'Không tự khôi phục hợp đồng đã hủy, không gia hạn hợp đồng hết hiệu lực.',
  'Giao dịch mới vẫn phải đáp ứng điều kiện của từng phân hệ.',
];

const CHECK_VIEW: Record<ReactivationCheck['status'], { icon: IconName; tone: string; badge: string; badgeTone: 'success' | 'danger' | 'warning' }> = {
  met: { icon: 'check', tone: 'success', badge: 'Đạt', badgeTone: 'success' },
  unmet: { icon: 'x-circle', tone: 'danger', badge: 'Chưa đạt', badgeTone: 'danger' },
  exception: { icon: 'alert', tone: 'warning', badge: 'Ngoại lệ', badgeTone: 'warning' },
};

type ServerAlert = 'save-failed' | 'network' | 'conflict' | 'forbidden' | 'conditions';

function newIdempotencyKey() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/** UC-CUS-04 · Kích hoạt lại khách hàng để tiếp tục giao dịch – frame 04.1 → 04.6. */
export function CustomerReactivatePage() {
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
  // A2: khách hàng đã Hoạt động → thông báo trên hồ sơ, không ghi lịch sử trùng.
  if (customer.status === 'active') {
    const state: CustomerDetailState = { alreadyActive: true };
    return <Navigate to={ROUTES.customerDetail(customer.code)} replace state={state} />;
  }
  return <ReactivateFlow key={customer.code} customer={customer} />;
}

function ReactivateFlow({ customer }: { customer: Customer }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { endSession } = useSession();
  const { showToast } = useToast();

  const [context, setContext] = useState<ReactivationContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailedAt, setLoadFailedAt] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState<AttachedFile[]>([]);
  const [exception, setException] = useState<ReactivationException | null>(null);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverAlert, setServerAlert] = useState<ServerAlert | null>(null);
  const inFlight = useRef(false);
  const idempotencyKey = useRef(newIdempotencyKey());

  useUnsavedChanges(reason.trim() || evidence.length || exception ? `Kích hoạt lại khách hàng – ${customer.code}` : null);

  const load = useCallback(
    async (retry: boolean) => {
      setLoading(true);
      try {
        setContext(await customerStatusApi.getReactivationContext(customer.code, retry));
        setLoadFailedAt(null);
      } catch (error) {
        if (error instanceof StatusChangeError && error.code === 'ALREADY_IN_STATUS') {
          const state: CustomerDetailState = { alreadyActive: true };
          navigate(ROUTES.customerDetail(customer.code), { replace: true, state });
          return;
        }
        // A2.1: không tải được thông tin tạm ngưng → khóa xác nhận.
        setLoadFailedAt(new Date().toISOString());
      } finally {
        setLoading(false);
      }
    },
    [customer.code, navigate],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  // Điều kiện công nợ có quyết định ngoại lệ (A4.3) được hiển thị là "Ngoại lệ".
  const checks = useMemo(
    () =>
      (context?.checks ?? []).map((check) =>
        check.id === 'debt' && check.status === 'unmet' && exception
          ? {
              ...check,
              status: 'exception' as const,
              label: 'Công nợ chưa thanh toán đủ – có quyết định ngoại lệ',
              detail: `${exception.decisionNo} ${exception.content}`,
            }
          : check,
      ),
    [context, exception],
  );
  const unmet = checks.filter((c) => c.status === 'unmet');
  const debtUnmet = unmet.some((c) => c.id === 'debt');
  const blocked = unmet.length > 0;
  const canConfirm = Boolean(context) && !loadFailedAt && !blocked && !loading;

  const errors = {
    reason: attempted && !reason.trim() ? 'Vui lòng nhập lý do kích hoạt lại.' : undefined,
    evidence: attempted && evidence.length === 0 ? 'Vui lòng tải căn cứ xác nhận đủ điều kiện tiếp tục hợp tác.' : undefined,
  };
  const backToDetail = () => navigate(ROUTES.customerDetail(customer.code));

  async function confirm() {
    if (inFlight.current || !user || !canConfirm) return;
    setAttempted(true);
    // A5: thiếu lý do hoặc căn cứ bắt buộc.
    if (!reason.trim() || evidence.length === 0) return;
    inFlight.current = true;
    setSubmitting(true);
    setServerAlert(null);
    try {
      const { replayed } = await customerStatusApi.reactivate({
        userId: user.id,
        signedInAt: user.signedInAt,
        idempotencyKey: idempotencyKey.current,
        code: customer.code,
        baseVersion: customer.version,
        reason,
        evidence,
        exception: exception ?? undefined,
      });
      const state: CustomerDetailState = { reactivated: true, replayed };
      navigate(ROUTES.customerDetail(customer.code), { replace: true, state });
    } catch (error) {
      const code = error instanceof StatusChangeError ? error.code : 'NETWORK';
      if (code === 'SESSION_ENDED' && error instanceof StatusChangeError) endSession(error.sessionStatus ?? 'expired');
      else if (code === 'ALREADY_IN_STATUS') {
        const state: CustomerDetailState = { alreadyActive: true };
        navigate(ROUTES.customerDetail(customer.code), { replace: true, state });
      } else if (code === 'CONFLICT' || code === 'NOT_FOUND') setServerAlert('conflict');
      else if (code === 'FORBIDDEN') setServerAlert('forbidden');
      else if (code === 'CONDITIONS_NOT_MET') setServerAlert('conditions');
      else if (code !== 'VALIDATION') setServerAlert(code === 'SAVE_FAILED' ? 'save-failed' : 'network');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  function requestEvidence() {
    showToast({
      title: 'Đã gửi yêu cầu bổ sung căn cứ',
      description: `Phòng ${debtUnmet ? 'Kế toán' : 'phụ trách'} nhận yêu cầu xác nhận điều kiện kích hoạt lại ${customer.code}.`,
    });
  }

  const suspension = context?.suspension ?? customer.suspension;

  return (
    <>
      <nav className="breadcrumb" aria-label="Đường dẫn">
        <span>Khách hàng</span>
        <span className="breadcrumb__separator">/</span>
        <span>{customer.code}</span>
        <span className="breadcrumb__separator">/</span>
        <span className="breadcrumb__current" aria-current="page">
          Kích hoạt lại
        </span>
      </nav>

      <div className="page-header">
        <div className="page-header__title">
          <div className="customer-title">
            <h1>Kích hoạt lại khách hàng</h1>
            <StatusBadge label="Tạm ngưng" tone="warning" />
          </div>
          <p>
            {customer.name} · {customer.code}
            {suspension && ` · Tạm ngưng từ ${formatDateTime(suspension.at).slice(0, 10)}`}
          </p>
        </div>
        <div className="page-header__actions">
          <Button variant="secondary" disabled={submitting} onClick={backToDetail}>
            Hủy
          </Button>
          <Button disabled={!canConfirm || submitting} className={submitting ? 'is-busy' : undefined} onClick={() => void confirm()}>
            {submitting ? 'Đang xác nhận…' : 'Xác nhận kích hoạt lại'}
          </Button>
        </div>
      </div>

      {loadFailedAt && (
        <Alert
          tone="danger"
          title="Không tải được thông tin tạm ngưng"
          action={
            <button type="button" className="alert__link" disabled={loading} onClick={() => void load(true)}>
              {loading ? 'Đang tải lại…' : 'Tải lại'}
            </button>
          }
        >
          Chưa đủ dữ liệu để xem xét kích hoạt lại. Hệ thống không cho xác nhận cho đến khi tải đủ lý do, lịch sử và hồ sơ cần
          kiểm tra.
        </Alert>
      )}
      {serverAlert && <ReactivateAlertBanner kind={serverAlert} retrying={submitting} onRetry={() => void confirm()} onReload={backToDetail} />}
      {!loadFailedAt && attempted && (errors.reason || errors.evidence) && (
        <Alert tone="danger" title="Chưa thể xác nhận">
          Thiếu lý do hoặc căn cứ bắt buộc. Khách hàng giữ trạng thái Tạm ngưng.
        </Alert>
      )}
      {!loadFailedAt && blocked && (
        <Alert
          tone="warning"
          title="Chưa thể kích hoạt lại"
          action={
            <button type="button" className="alert__link" onClick={requestEvidence}>
              Yêu cầu bổ sung căn cứ
            </button>
          }
        >
          {debtUnmet
            ? 'Nguyên nhân tạm ngưng là công nợ nhưng chưa có xác nhận xử lý hợp lệ. Bổ sung xác nhận của Kế toán hoặc quyết định chấp thuận ngoại lệ; khách hàng giữ Tạm ngưng.'
            : 'Vấn đề vận hành hoặc tranh chấp là nguyên nhân tạm ngưng chưa được giải quyết. Cần bổ sung xác nhận của bộ phận phụ trách; khách hàng giữ Tạm ngưng.'}
        </Alert>
      )}
      {!loadFailedAt && exception && !blocked && (
        <Alert tone="info" title="Kích hoạt theo quyết định ngoại lệ">
          Khách hàng chưa hoàn thành toàn bộ nghĩa vụ nhưng được phép tiếp tục hợp tác. Quyết định ngoại lệ được ghi nhận làm căn cứ
          kích hoạt lại.
        </Alert>
      )}

      <div className="customer-layout">
        <div className="customer-layout__main">
          <section className="customer-card">
            <div className="customer-card__heading">
              <h2>Thông tin tạm ngưng</h2>
            </div>
            {loadFailedAt ? (
              <ul className="check-list">
                <li className="check-list__item">
                  <Icon name="x-circle" className="icon-tone--danger" />
                  <span className="check-list__text">
                    <span className="check-list__label">Không tải được lý do và hồ sơ tạm ngưng</span>
                    <span className="check-list__detail">Lỗi kết nối lúc {formatTime(loadFailedAt)}</span>
                  </span>
                  <StatusBadge label="Lỗi tải" tone="danger" />
                </li>
              </ul>
            ) : (
              context && (
                <dl className="customer-detail__grid customer-detail__grid--single">
                  <DecisionItem label="Nhóm lý do">{reasonGroupLabel(context.suspension.reasonGroup)}</DecisionItem>
                  <DecisionItem label="Nội dung">{context.suspension.reason}</DecisionItem>
                  <DecisionItem label="Người quyết định">
                    {context.suspension.decidedBy} · {formatDateTime(context.suspension.at)}
                  </DecisionItem>
                </dl>
              )
            )}
            {loading && !context && !loadFailedAt && <p className="side-card__subtitle">Đang tải thông tin tạm ngưng…</p>}
          </section>

          <section className="customer-card">
            <div className="customer-card__heading">
              <h2>Điều kiện kích hoạt lại</h2>
              <p>Theo nguyên nhân tạm ngưng: công nợ, vận hành, tranh chấp.</p>
            </div>
            <ul className="check-list">
              {loadFailedAt || !context ? (
                <li className="check-list__item">
                  <Icon name="info" className="icon-tone--neutral" />
                  <span className="check-list__text">
                    <span className="check-list__label">Chưa đủ dữ liệu để kiểm tra điều kiện</span>
                    <span className="check-list__detail">Tải lại thông tin tạm ngưng trước khi xem xét</span>
                  </span>
                  <StatusBadge label="Chưa kiểm tra" tone="neutral" />
                </li>
              ) : (
                checks.map((check) => {
                  const view = CHECK_VIEW[check.status];
                  return (
                    <li key={check.id} className="check-list__item">
                      <Icon name={view.icon} className={`icon-tone--${view.tone}`} />
                      <span className="check-list__text">
                        <span className="check-list__label">{check.label}</span>
                        <span className="check-list__detail">{check.detail}</span>
                        {/* A4.3: chỉ nghĩa vụ công nợ được chấp thuận ngoại lệ; vận hành/tranh chấp phải được xử lý (A4.2). */}
                        {check.id === 'debt' && check.status !== 'met' && (
                          <button type="button" className="link-button" onClick={() => setExceptionOpen(true)}>
                            {exception ? 'Sửa quyết định ngoại lệ' : 'Ghi nhận quyết định ngoại lệ'}
                          </button>
                        )}
                      </span>
                      <StatusBadge label={view.badge} tone={view.badgeTone} />
                    </li>
                  );
                })
              )}
            </ul>
          </section>

          <section className="customer-card">
            <div className="customer-card__heading">
              <h2>Quyết định kích hoạt lại</h2>
              <p>Lý do và căn cứ là bắt buộc, được lưu cùng lịch sử chuyển trạng thái.</p>
            </div>
            <TextAreaField
              label="Lý do kích hoạt lại"
              required
              placeholder="Nhập lý do kích hoạt lại"
              value={reason}
              error={errors.reason}
              disabled={submitting}
              onChange={(e) => setReason(e.target.value)}
            />
            <FileUploadField
              label="Căn cứ xác nhận đủ điều kiện"
              required
              files={evidence}
              error={errors.evidence}
              disabled={submitting}
              onChange={setEvidence}
            />
          </section>
        </div>

        <aside className="customer-layout__side">
          <StatusHistoryCard customer={customer} />
          <section className="side-card">
            <h2 className="side-card__title">Sau khi kích hoạt lại</h2>
            <ul className="side-card__notes">
              {AFTER_REACTIVATION.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {exceptionOpen && (
        <ExceptionDialog
          initial={exception}
          onClose={() => setExceptionOpen(false)}
          onSave={(value) => {
            setException(value);
            setExceptionOpen(false);
            setServerAlert(null);
          }}
        />
      )}
    </>
  );
}

function reasonGroupLabel(code: string) {
  return customerStatusApi.getSuspensionReasonGroups().find((g) => g.code === code)?.label ?? code;
}

/** Ghi nhận quyết định chấp thuận ngoại lệ cho nghĩa vụ công nợ (A4.3 – frame 04.3). */
function ExceptionDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: ReactivationException | null;
  onClose: () => void;
  onSave: (value: ReactivationException | null) => void;
}) {
  const [decisionNo, setDecisionNo] = useState(initial?.decisionNo ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [attempted, setAttempted] = useState(false);

  function save() {
    setAttempted(true);
    if (!decisionNo.trim() || !content.trim()) return;
    onSave({ decisionNo: decisionNo.trim(), content: content.trim() });
  }

  return (
    <Dialog
      title="Ghi nhận quyết định ngoại lệ"
      icon="alert"
      width={520}
      initialFocus="first"
      onClose={onClose}
      actions={
        <>
          {initial && (
            <Button variant="secondary" onClick={() => onSave(null)}>
              Bỏ ngoại lệ
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={save}>Ghi nhận</Button>
        </>
      }
    >
      <p className="dialog__body">
        Chỉ dùng khi khách hàng chưa hoàn thành nghĩa vụ công nợ nhưng có quyết định chấp thuận tiếp tục hợp tác của cấp có thẩm
        quyền. Tải văn bản quyết định ở mục căn cứ.
      </p>
      <InputField
        label="Số quyết định / văn bản"
        required
        placeholder="VD: QĐ-BGĐ-2026-018"
        value={decisionNo}
        error={attempted && !decisionNo.trim() ? 'Vui lòng nhập số quyết định.' : undefined}
        onChange={(e) => setDecisionNo(e.target.value)}
      />
      <TextAreaField
        label="Nội dung chấp thuận"
        required
        placeholder="VD: chấp thuận tiếp tục hợp tác, trả nợ theo lộ trình 3 tháng"
        value={content}
        error={attempted && !content.trim() ? 'Vui lòng nhập nội dung chấp thuận.' : undefined}
        onChange={(e) => setContent(e.target.value)}
      />
    </Dialog>
  );
}

type AlertBannerProps = { kind: ServerAlert; retrying: boolean; onRetry: () => void; onReload: () => void };

function ReactivateAlertBanner({ kind, retrying, onRetry, onReload }: AlertBannerProps) {
  const retry = (
    <button type="button" className="alert__link" disabled={retrying} onClick={onRetry}>
      {retrying ? 'Đang kiểm tra…' : 'Kiểm tra kết quả và thử lại'}
    </button>
  );
  switch (kind) {
    case 'save-failed':
      return (
        <Alert tone="danger" title="Kích hoạt lại không thành công" action={retry}>
          Không lưu được trạng thái hoặc lịch sử, thao tác đã được hoàn tác; khách hàng vẫn Tạm ngưng.
        </Alert>
      );
    case 'network':
      return (
        <Alert tone="danger" title="Chưa nhận được kết quả kích hoạt lại" action={retry}>
          Kết nối bị gián đoạn sau khi xác nhận. Hệ thống kiểm tra kết quả thao tác đã gửi trước khi cho thử lại, không ghi nhận
          trùng.
        </Alert>
      );
    case 'conflict':
      return (
        <Alert
          tone="danger"
          title="Không thể kích hoạt lại"
          action={
            <button type="button" className="alert__link" onClick={onReload}>
              Mở lại hồ sơ khách hàng
            </button>
          }
        >
          Quyền hoặc trạng thái khách hàng đã thay đổi kể từ khi bắt đầu thao tác; hệ thống từ chối yêu cầu.
        </Alert>
      );
    case 'forbidden':
      return (
        <Alert tone="danger" title="Không còn quyền kích hoạt lại khách hàng">
          Quyền của tài khoản đã thay đổi nên yêu cầu bị từ chối; khách hàng vẫn Tạm ngưng.
        </Alert>
      );
    case 'conditions':
      return (
        <Alert tone="warning" title="Chưa đủ điều kiện kích hoạt lại">
          Điều kiện đã thay đổi tại thời điểm xác nhận; khách hàng giữ Tạm ngưng.
        </Alert>
      );
  }
}
