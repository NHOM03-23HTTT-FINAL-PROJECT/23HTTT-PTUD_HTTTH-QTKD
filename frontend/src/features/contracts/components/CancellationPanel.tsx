import { useRef, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSession } from '@/app/providers/SessionProvider';
import { Alert } from '@/components/feedback/Alert';
import { Dialog } from '@/components/feedback/Dialog';
import { Button } from '@/components/button/Button';
import { TextAreaField } from '@/components/form/TextAreaField';
import { formatDateTime } from '@/utils/format';
import { serverContractsApi } from '../api/serverContractsApi';
import { ContractActionError, type Contract, type ContractCancellationRequest } from '../types/contract';

const LABELS = {
  'pending-sales': 'Chờ Trưởng phòng Kinh doanh',
  'pending-board': 'Chờ Ban Giám đốc',
  approved: 'Đã chấp thuận',
  rejected: 'Không chấp thuận',
};

export function CancellationPanel({
  contract,
  onChange,
}: {
  contract: Contract;
  onChange: (next: Contract) => void;
}) {
  const { user } = useAuth();
  const { endSession } = useSession();
  const [modal, setModal] = useState<'new' | ContractCancellationRequest | null>(null);
  const [error, setError] = useState('');
  if (!user) return null;
  const requests = contract.cancellationRequests ?? [];
  const pending = requests.some((r) => r.status === 'pending-sales' || r.status === 'pending-board');
  const mayRequest =
    user.id === contract.ownerId &&
    user.roles.includes('NV_KD') &&
    user.permissions.has('contracts.create') &&
    !pending &&
    ['submitted', 'under-review', 'revision-requested', 'approved'].includes(contract.status);
  if (!requests.length && !mayRequest) return null;

  function failed(err: unknown) {
    if (err instanceof ContractActionError && err.code === 'SESSION_ENDED') {
      endSession('expired');
      return;
    }
    const messages: Record<string, string> = {
      NO_APPROVER:
        'Chưa xác định được người có thẩm quyền quyết định. Kiểm tra trưởng phòng hoặc đại diện Ban Giám đốc.',
      CONFLICT: 'Hồ sơ hoặc đề nghị vừa thay đổi. Tải lại trang trước khi thao tác tiếp.',
      CANCELLATION_PENDING: 'Hồ sơ đã có một đề nghị hủy đang chờ quyết định.',
      SIGNING_CANCELLATION_REQUIRED:
        'Hồ sơ có phiên ký đang chạy. Cần dừng ký qua chức năng ký điện tử trước khi hoàn tất quyết định hủy.',
      STATUS: 'Trạng thái hồ sơ không còn cho phép thao tác này hoặc đã có chữ ký.',
      NOT_ASSIGNEE: 'Bạn không phải người được giao quyết định tại cấp hiện tại.',
      STEP_DONE: 'Đề nghị đã được xử lý. Tải lại trang để xem kết quả.',
      IDEMPOTENCY_CONFLICT:
        'Yêu cầu trước đã được ghi nhận với nội dung khác. Tải lại hồ sơ để kiểm tra kết quả.',
    };
    setError(
      err instanceof ContractActionError
        ? (messages[err.code] ??
            'Chưa nhận được kết quả. Giữ nguyên nội dung và thử lại hoặc tải lại hồ sơ để kiểm tra.')
        : 'Chưa kết nối được với backend.',
    );
  }

  return (
    <section className="contract-card contract-section">
      <div className="page-header">
        <div>
          <h2>Đề nghị hủy hồ sơ chưa ký</h2>
          <p>Hủy sau khi đã trình phải được người có thẩm quyền quyết định.</p>
        </div>
        {mayRequest && (
          <Button
            variant="secondary"
            onClick={() => {
              setError('');
              setModal('new');
            }}
          >
            Đề nghị hủy
          </Button>
        )}
      </div>
      {pending && (
        <Alert tone="warning" title="Hồ sơ có đề nghị hủy đang chờ quyết định">
          Nội dung và tệp đính kèm được giữ nguyên trong thời gian xem xét. Trạng thái hợp đồng chỉ đổi sau
          quyết định hủy cuối cùng.
        </Alert>
      )}
      {!requests.length && <p>Chưa có đề nghị hủy.</p>}
      {requests.map((r) => {
        const assigned =
          user.permissions.has('approvals.approve') &&
          (r.status === 'pending-sales'
            ? r.salesAssigneeId === user.id
            : r.status === 'pending-board' && r.boardAssigneeId === user.id);
        return (
          <article key={r.id} className="side-card">
            <h3>{LABELS[r.status]}</h3>
            <p>Bên đề nghị: {r.party === 'company' ? 'Công ty ABC' : 'Khách hàng'}</p>
            <p>{r.reason}</p>
            <p>
              {r.requestedByName} · {formatDateTime(r.requestedAt)}
            </p>
            <p>
              Trưởng phòng: {r.salesAssigneeName}
              {r.salesDecidedAt
                ? ` · ${r.salesApproved ? 'Chấp thuận' : 'Không chấp thuận'} · ${formatDateTime(r.salesDecidedAt)} · ${r.salesReason || 'Không có ý kiến thêm'}`
                : ''}
            </p>
            {r.boardAssigneeName && (
              <p>
                Ban Giám đốc: {r.boardAssigneeName}
                {r.boardDecidedAt
                  ? ` · ${r.boardApproved ? 'Chấp thuận' : 'Không chấp thuận'} · ${formatDateTime(r.boardDecidedAt)} · ${r.boardReason || 'Không có ý kiến thêm'}`
                  : ''}
              </p>
            )}
            {(r.status === 'approved' || r.status === 'rejected') && (
              <p>
                {r.notificationStatus === 'Sent'
                  ? 'Thông báo kết quả đã được tiếp nhận để gửi.'
                  : r.notificationStatus === 'Failed'
                    ? 'Chưa gửi được thông báo kết quả cho khách hàng. Liên hệ bộ phận phụ trách.'
                    : 'Thông báo kết quả cho khách hàng đang chờ gửi.'}
              </p>
            )}
            {assigned && (
              <Button
                onClick={() => {
                  setError('');
                  setModal(r);
                }}
              >
                Xem xét đề nghị
              </Button>
            )}
          </article>
        );
      })}
      {modal && (
        <CancellationDialog
          key={typeof modal === 'string' ? 'new' : modal.id}
          request={modal}
          contract={contract}
          error={error}
          onError={failed}
          onClose={() => setModal(null)}
          onDone={(next) => {
            setModal(null);
            setError('');
            onChange(next);
          }}
        />
      )}
    </section>
  );
}

function CancellationDialog({
  request,
  contract,
  error,
  onError,
  onClose,
  onDone,
}: {
  request: 'new' | ContractCancellationRequest;
  contract: Contract;
  error: string;
  onError: (error: unknown) => void;
  onClose: () => void;
  onDone: (next: Contract) => void;
}) {
  const [party, setParty] = useState('company');
  const [reason, setReason] = useState('');
  const [approve, setApprove] = useState(true);
  const [invalid, setInvalid] = useState('');
  const [busy, setBusy] = useState(false);
  const requestKey = useRef(crypto.randomUUID());
  async function save() {
    if (busy) return;
    if ((request === 'new' || !approve) && !reason.trim()) {
      setInvalid('Nhập lý do.');
      return;
    }
    setBusy(true);
    try {
      const next =
        request === 'new'
          ? await serverContractsApi.requestCancellation(
              contract.code,
              { baseVersion: contract.version, party, reason },
              requestKey.current,
            )
          : await serverContractsApi.decideCancellation(
              contract.code,
              request.id,
              { baseVersion: request.version, approve, reason },
              requestKey.current,
            );
      onDone(next);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={request === 'new' ? 'Gửi đề nghị hủy hồ sơ' : 'Quyết định đề nghị hủy'}
      width={560}
      initialFocus="first"
      onClose={busy ? () => undefined : onClose}
      actions={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Đóng
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? 'Đang lưu…' : 'Xác nhận'}
          </Button>
        </>
      }
    >
      <div className="dialog__body contract-dialog-form">
        <p>
          {contract.code} · {contract.title}
        </p>
        {request === 'new' ? (
          <label>
            Bên đề nghị
            <select value={party} disabled={busy} onChange={(e) => setParty(e.target.value)}>
              <option value="company">Công ty ABC</option>
              <option value="customer">Khách hàng</option>
            </select>
          </label>
        ) : (
          <>
            <p>Lý do đề nghị: {request.reason}</p>
            <label>
              Quyết định
              <select
                value={approve ? 'approve' : 'reject'}
                disabled={busy}
                onChange={(e) => setApprove(e.target.value === 'approve')}
              >
                <option value="approve">Chấp thuận</option>
                <option value="reject">Không chấp thuận</option>
              </select>
            </label>
          </>
        )}
        <TextAreaField
          label={request === 'new' ? 'Lý do đề nghị hủy' : 'Ý kiến / lý do quyết định'}
          required={request === 'new' || !approve}
          value={reason}
          disabled={busy}
          error={invalid}
          onChange={(e) => {
            setReason(e.target.value);
            setInvalid('');
          }}
        />
        {error && (
          <Alert tone="danger" title="Chưa hoàn tất thao tác">
            {error}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}
