import { useState } from 'react';
import type { CurrentUser } from '@/app/providers/AuthProvider';
import { useSession } from '@/app/providers/SessionProvider';
import { Button } from '@/components/button/Button';
import { Alert, type AlertTone } from '@/components/feedback/Alert';
import { Dialog } from '@/components/feedback/Dialog';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { formatDateTime } from '@/utils/format';
import { contractsApi } from '../api/contractsApi';
import { ContractActionError, type ApprovalDecision, type ApprovalStepKey, type Contract } from '../types/contract';
import { activeStep, CONTRACT_STATUS_BADGE, latestRound, STEP_LABELS, STEP_ORDER } from '../utils/contractStatus';

export type PageNotice = { tone: AlertTone; title: string; body: string };

/** Bước duyệt ứng với vai trò của người dùng. */
export function reviewStepOf(user: CurrentUser): ApprovalStepKey | undefined {
  if (user.roles.includes('TP_KD')) return 'sales';
  if (user.roles.includes('NV_PC')) return 'legal';
  if (user.roles.includes('GD')) return 'board';
  return undefined;
}

const DECISION_COPY: Record<ApprovalStepKey, Record<ApprovalDecision, { option: string; field: string; placeholder: string }>> = {
  sales: {
    approve: { option: 'Chấp thuận', field: 'Ý kiến rà soát', placeholder: 'Nhận xét về nội dung kinh doanh, giá trị, điều kiện thương mại…' },
    revision: { option: 'Yêu cầu chỉnh sửa', field: 'Nội dung cần chỉnh sửa và lý do', placeholder: 'Nêu rõ điều khoản/thông tin cần sửa…' },
    reject: { option: 'Từ chối', field: 'Lý do từ chối', placeholder: 'Nêu lý do không chấp thuận hồ sơ…' },
  },
  legal: {
    approve: { option: 'Đạt yêu cầu – trình Ban Giám đốc', field: 'Kết luận rà soát pháp lý', placeholder: 'Kết luận về tính đầy đủ, hợp lệ và pháp lý của hồ sơ…' },
    revision: { option: 'Yêu cầu chỉnh sửa, bổ sung', field: 'Nội dung cần chỉnh sửa/bổ sung và lý do', placeholder: 'Nêu cụ thể điều khoản, tài liệu cần bổ sung…' },
    reject: { option: 'Từ chối – không đáp ứng pháp lý', field: 'Lý do từ chối', placeholder: 'Nêu căn cứ pháp lý không đáp ứng…' },
  },
  board: {
    approve: { option: 'Phê duyệt', field: 'Ý kiến phê duyệt', placeholder: 'Ý kiến của Ban Giám đốc…' },
    revision: { option: 'Yêu cầu chỉnh sửa', field: 'Nội dung cần chỉnh sửa và lý do', placeholder: 'Nêu rõ nội dung cần chỉnh sửa…' },
    reject: { option: 'Từ chối', field: 'Lý do từ chối', placeholder: 'Nêu lý do từ chối hợp đồng…' },
  },
};

const SUCCESS_COPY: Record<ApprovalStepKey, Record<ApprovalDecision, PageNotice>> = {
  sales: {
    approve: { tone: 'success', title: 'Chấp thuận thành công', body: 'Kết quả rà soát của Trưởng phòng đã được ghi nhận và hồ sơ đã gửi sang Phòng Pháp chế. Hợp đồng vẫn ở trạng thái Đang rà soát.' },
    revision: { tone: 'warning', title: 'Đã gửi yêu cầu chỉnh sửa', body: 'Hợp đồng chuyển sang Yêu cầu chỉnh sửa, lượt duyệt hiện tại dừng lại. Người phụ trách được thông báo để chỉnh sửa và trình lại.' },
    reject: { tone: 'danger', title: 'Đã từ chối hợp đồng', body: 'Hợp đồng chuyển sang Bị từ chối và lượt duyệt kết thúc; hồ sơ không được chuyển đến Pháp chế.' },
  },
  legal: {
    approve: { tone: 'success', title: 'Đạt yêu cầu – đã trình Ban Giám đốc', body: 'Kết luận rà soát pháp lý đã được lưu; hồ sơ được bàn giao trong cùng lượt duyệt cho người được giao tại Ban Giám đốc.' },
    revision: { tone: 'warning', title: 'Đã gửi yêu cầu chỉnh sửa, bổ sung', body: 'Hợp đồng chuyển sang Yêu cầu chỉnh sửa; Nhân viên Kinh doanh và Trưởng phòng Kinh doanh được thông báo. Hồ sơ trình lại từ bước Trưởng phòng.' },
    reject: { tone: 'danger', title: 'Đã từ chối hồ sơ', body: 'Hợp đồng chuyển sang Bị từ chối; kết quả và lý do được gửi tới Kinh doanh. Hồ sơ không được trình Ban Giám đốc.' },
  },
  board: {
    approve: { tone: 'success', title: 'Phê duyệt thành công', body: 'Hợp đồng chuyển sang Đã duyệt, phiên bản được duyệt bị khóa chỉnh sửa. Người phụ trách được thông báo để thực hiện ký kết.' },
    revision: { tone: 'warning', title: 'Đã gửi yêu cầu chỉnh sửa', body: 'Hợp đồng chuyển sang Yêu cầu chỉnh sửa và phải trình lại từ Trưởng phòng Kinh doanh; kết quả trên phiên bản cũ không áp dụng cho phiên bản mới.' },
    reject: { tone: 'danger', title: 'Đã từ chối hợp đồng', body: 'Hợp đồng chuyển sang Bị từ chối, lượt duyệt kết thúc và không chuyển sang ký kết.' },
  },
};

function errorNotice(error: unknown, contract: Contract): PageNotice {
  if (!(error instanceof ContractActionError)) return { tone: 'danger', title: 'Chưa nhận được kết quả', body: 'Mất kết nối khi gửi quyết định. Hãy tải lại hồ sơ để kiểm tra trước khi thử lại.' };
  const latest = CONTRACT_STATUS_BADGE[error.status ?? contract.status].label;
  switch (error.code) {
    case 'NOT_ASSIGNEE':
    case 'FORBIDDEN':
      return { tone: 'danger', title: 'Không phải người được giao', body: 'Bạn không phải người được giao chính thức tại bước hiện tại; thao tác bị từ chối và dữ liệu giữ nguyên.' };
    case 'STEP_DONE':
      return { tone: 'warning', title: 'Bước duyệt đã có quyết định', body: `Bước này đã được xử lý hoặc lượt duyệt đã kết thúc (trạng thái hiện tại: ${latest}). Hệ thống không ghi nhận thêm quyết định.` };
    case 'STEP_NOT_READY':
      return { tone: 'warning', title: 'Hồ sơ chưa đến bước của bạn', body: 'Các bước bắt buộc trước đó chưa hoàn thành hợp lệ nên chưa thể quyết định.' };
    case 'VERSION_MISMATCH':
      return { tone: 'warning', title: 'Phiên bản hồ sơ không khớp', body: 'Phiên bản đang xem khác phiên bản đã trình. Quyết định chưa được ghi nhận; hãy tải lại và kiểm tra hồ sơ.' };
    case 'SAVE_FAILED':
      return { tone: 'danger', title: 'Ghi nhận quyết định thất bại', body: 'Hệ thống chưa lưu quyết định và không chuyển bước. Nội dung đã nhập được giữ để thử lại.' };
    default:
      return { tone: 'danger', title: 'Không thể ghi nhận quyết định', body: 'Đã xảy ra lỗi. Hãy thử lại.' };
  }
}

type Props = {
  user: CurrentUser;
  contract: Contract;
  onChange: (contract: Contract | null, notice: PageNotice | null) => void;
};

/**
 * Khối rà soát theo vai trò: SYS-CTR-07 (Trưởng phòng KD), 08 (Pháp chế), 09 (Ban Giám đốc).
 * Hiển thị thao tác khi người dùng là người được giao ở bước hiện tại; ngược lại giải thích vì sao không thao tác được.
 */
export function ReviewPanel({ user, contract, onChange }: Props) {
  const { endSession } = useSession();
  const myStep = reviewStepOf(user);
  const round = latestRound(contract);
  const current = activeStep(round);
  const [decision, setDecision] = useState<ApprovalDecision>('approve');
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState('');
  const [busy, setBusy] = useState(false);
  const [coordinateOpen, setCoordinateOpen] = useState(false);
  if (!myStep || !round) return null;

  const mine = round.steps.find((step) => step.key === myStep)!;
  const assigned = current?.key === myStep && current.assigneeId === user.id;

  function handleError(error: unknown) {
    if (error instanceof ContractActionError && error.code === 'SESSION_ENDED') {
      endSession(error.sessionStatus ?? 'expired');
      return;
    }
    if (error instanceof ContractActionError && error.code === 'VALIDATION') {
      setCommentError('Nhập nội dung trước khi xác nhận quyết định.');
      return;
    }
    onChange(null, errorNotice(error, contract));
  }

  async function accept() {
    setBusy(true);
    try {
      const next = await contractsApi.acceptReview({ userId: user.id, signedInAt: user.signedInAt, code: contract.code });
      onChange(next, { tone: 'info', title: 'Đã tiếp nhận rà soát', body: 'Hồ sơ chuyển sang Đang rà soát; thời điểm tiếp nhận đã được ghi nhận.' });
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  async function decide() {
    if (!comment.trim()) {
      setCommentError(decision === 'approve' ? 'Nhập ý kiến/kết luận rà soát trước khi chấp thuận.' : 'Nhập nội dung hoặc lý do bắt buộc.');
      return;
    }
    if (!myStep || !round) return;
    setBusy(true);
    try {
      const result = await contractsApi.decide({ userId: user.id, signedInAt: user.signedInAt, code: contract.code, step: myStep, roundNo: round.no, viewedVersion: contract.version, decision, comment });
      const base = SUCCESS_COPY[myStep][decision];
      const notice = result.pendingTask ? { ...base, tone: 'warning' as const, body: `${base.body} ${result.pendingTask}` } : base;
      setComment('');
      onChange(result.contract, notice);
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <div className="review-panel__head">
      <div><h2>Rà soát · {STEP_LABELS[myStep]}</h2><p>Lượt {round.no} · trình {formatDateTime(round.submittedAt)} bởi {round.submittedByName} · phiên bản hồ sơ {round.contractVersion}</p></div>
      {current && <StatusBadge label={current.key === myStep ? 'Bước hiện tại' : `Đang ở bước ${current.label}`} tone={current.key === myStep ? 'accent' : 'neutral'} />}
    </div>
  );

  if (!assigned) {
    const myIndex = STEP_ORDER.indexOf(myStep);
    const currentIndex = current ? STEP_ORDER.indexOf(current.key) : -1;
    let info: PageNotice | null = null;
    if (current?.key === myStep && current.state === 'unassigned') info = { tone: 'warning', title: 'Bước đang chờ phân công', body: 'Chưa có người được giao tại bước này. Đầu mối có thẩm quyền đã được thông báo để hoàn tất phân công.' };
    else if (current?.key === myStep) info = { tone: 'info', title: 'Bạn không phải người được giao ở bước hiện tại', body: `Hồ sơ đang được giao cho ${current.assigneeName}. Bạn chỉ xem được thông tin, không thể ghi nhận quyết định.` };
    else if (current && currentIndex < myIndex) info = { tone: 'info', title: myStep === 'board' ? 'Chưa đủ các bước bắt buộc trước khi phê duyệt' : 'Hồ sơ chưa đến bước của bạn', body: `Hồ sơ đang ở bước ${current.label}. ${STEP_ORDER.slice(currentIndex, myIndex).map((key) => STEP_LABELS[key]).join(', ')} phải chấp thuận hợp lệ trước khi bạn quyết định.` };
    else if (mine.decidedById === user.id) info = { tone: 'success', title: 'Bước duyệt đã có quyết định', body: `Bạn đã ghi nhận "${mine.decision === 'approve' ? 'Chấp thuận' : mine.decision === 'revision' ? 'Yêu cầu chỉnh sửa' : 'Từ chối'}" lúc ${mine.decidedAt ? formatDateTime(mine.decidedAt) : ''}. Không thể quyết định lại trên lượt này.` };
    if (!info) return null;
    return <section className="review-panel">{header}<Alert tone={info.tone} title={info.title}>{info.body}</Alert></section>;
  }

  if (current?.state === 'pending-accept') {
    return (
      <section className="review-panel">
        {header}
        <p className="review-panel__text">Hồ sơ đã được trình và giao cho bạn ở bước rà soát kinh doanh. Tiếp nhận để chuyển hồ sơ sang Đang rà soát và ghi nhận thời điểm tiếp nhận.</p>
        <div className="review-panel__actions"><Button disabled={busy} onClick={() => void accept()}>{busy ? 'Đang tiếp nhận…' : 'Tiếp nhận rà soát'}</Button></div>
      </section>
    );
  }

  const copy = DECISION_COPY[myStep];
  const previous = round.steps.filter((step) => STEP_ORDER.indexOf(step.key) < STEP_ORDER.indexOf(myStep) && step.state === 'done');
  return (
    <section className="review-panel">
      {header}
      {previous.length > 0 && (
        <div className="review-panel__previous">
          {previous.map((step) => <div key={step.key}><strong>{step.label} · {step.decidedByName}</strong><span>“{step.comment}”</span></div>)}
        </div>
      )}
      {myStep === 'legal' && <CoordinationList user={user} contract={contract} onChange={onChange} onRequest={() => setCoordinateOpen(true)} />}
      <div className="review-panel__decisions" role="radiogroup" aria-label="Quyết định">
        {(Object.keys(copy) as ApprovalDecision[]).map((key) => (
          <button key={key} type="button" role="radio" aria-checked={decision === key} className={`review-option review-option--${key}${decision === key ? ' review-option--selected' : ''}`} onClick={() => { setDecision(key); setCommentError(''); }}>
            <span className="contract-radio" />{copy[key].option}
          </button>
        ))}
      </div>
      <TextAreaField label={copy[decision].field} required value={comment} error={commentError} placeholder={copy[decision].placeholder} disabled={busy} onChange={(event) => { setComment(event.target.value); setCommentError(''); }} />
      <div className="review-panel__actions">
        <Button variant={decision === 'reject' ? 'danger' : 'primary'} disabled={busy} onClick={() => void decide()}>{busy ? 'Đang ghi nhận…' : `Xác nhận: ${copy[decision].option}`}</Button>
      </div>
      {coordinateOpen && <CoordinationDialog user={user} contract={contract} onClose={() => setCoordinateOpen(false)} onDone={(next) => { setCoordinateOpen(false); onChange(next, { tone: 'info', title: 'Đã gửi yêu cầu phối hợp', body: 'Phòng ban chuyên môn sẽ xem xét và phản hồi; bạn tiếp tục rà soát sau khi đối chiếu phản hồi.' }); }} onError={handleError} />}
    </section>
  );
}

/** SYS-CTR-08 A1: danh sách yêu cầu phối hợp và phản hồi của phòng ban chuyên môn. */
function CoordinationList({ user, contract, onChange, onRequest }: Props & { onRequest: () => void }) {
  const round = latestRound(contract)!;
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  async function saveReply(id: string) {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      const next = await contractsApi.replyCoordination({ userId: user.id, signedInAt: user.signedInAt, code: contract.code, id, reply });
      setReplyFor(null);
      setReply('');
      onChange(next, { tone: 'success', title: 'Đã nhận phản hồi phối hợp', body: 'Đối chiếu thông tin phản hồi rồi ghi nhận kết luận rà soát pháp lý.' });
    } catch {
      onChange(null, { tone: 'danger', title: 'Chưa ghi nhận được phản hồi', body: 'Hãy thử lại.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="review-coordination">
      <div className="review-coordination__head"><strong>Phối hợp phòng ban chuyên môn</strong><Button variant="secondary" onClick={onRequest}>+ Yêu cầu phối hợp</Button></div>
      {round.coordinations.length === 0 ? <p>Chưa có yêu cầu phối hợp trong lượt này.</p> : round.coordinations.map((item) => (
        <div key={item.id} className="review-coordination__item">
          <div className="review-coordination__row"><strong>{item.department}</strong><StatusBadge label={item.reply ? 'Đã phản hồi' : 'Chờ phản hồi'} tone={item.reply ? 'success' : 'warning'} /></div>
          <p>{item.content}</p>
          <span>{item.requestedByName} · {formatDateTime(item.requestedAt)}</span>
          {item.reply ? <p className="review-coordination__reply">Phản hồi: {item.reply} <span>({item.repliedByName} · {item.repliedAt ? formatDateTime(item.repliedAt) : ''})</span></p> : replyFor === item.id ? (
            <div className="review-coordination__form">
              <TextAreaField label="Nội dung phản hồi của phòng ban" required value={reply} disabled={busy} onChange={(event) => setReply(event.target.value)} />
              <div className="review-panel__actions"><Button variant="secondary" disabled={busy} onClick={() => setReplyFor(null)}>Hủy</Button><Button disabled={busy || !reply.trim()} onClick={() => void saveReply(item.id)}>Ghi nhận phản hồi</Button></div>
            </div>
          ) : <button type="button" className="alert__link" onClick={() => { setReplyFor(item.id); setReply(''); }}>Ghi nhận phản hồi</button>}
        </div>
      ))}
    </div>
  );
}

function CoordinationDialog({ user, contract, onClose, onDone, onError }: { user: CurrentUser; contract: Contract; onClose: () => void; onDone: (contract: Contract) => void; onError: (error: unknown) => void }) {
  const departments = contractsApi.getListFilterOptions().coordinationDepartments;
  const [department, setDepartment] = useState('');
  const [content, setContent] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send() {
    setAttempted(true);
    if (!department || !content.trim()) return;
    setBusy(true);
    try {
      onDone(await contractsApi.requestCoordination({ userId: user.id, signedInAt: user.signedInAt, code: contract.code, department, content }));
    } catch (error) {
      onError(error);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Yêu cầu phối hợp phòng ban" icon="users" tone="info" width={560} initialFocus="first" onClose={onClose} actions={<><Button variant="secondary" disabled={busy} onClick={onClose}>Hủy</Button><Button disabled={busy} onClick={() => void send()}>{busy ? 'Đang gửi…' : 'Gửi yêu cầu'}</Button></>}>
      <div className="dialog__body contract-dialog-form">
        <p>Hồ sơ {contract.code} · {contract.customerName}. Nêu rõ nội dung cần xác minh và tài liệu liên quan.</p>
        <SelectField label="Phòng ban chuyên môn" required placeholder="Chọn phòng ban" options={departments.map((item) => ({ value: item, label: item }))} value={department} error={attempted && !department ? 'Chọn phòng ban.' : undefined} onChange={setDepartment} />
        <TextAreaField label="Nội dung cần xác minh" required value={content} error={attempted && !content.trim() ? 'Nhập nội dung cần xác minh.' : undefined} onChange={(event) => setContent(event.target.value)} />
      </div>
    </Dialog>
  );
}
