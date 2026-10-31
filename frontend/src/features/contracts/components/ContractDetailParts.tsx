import { Link } from 'react-router-dom';
import { Button, ButtonLink } from '@/components/button/Button';
import { formatFileSize } from '@/components/file-upload/FileUploadField';
import { Icon, type IconName } from '@/components/icon/Icon';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { ROUTES } from '@/constants/routes';
import { formatDate, formatDateTime, formatMoney } from '@/utils/format';
import { contractsApi } from '../api/contractsApi';
import type { ApprovalRound, ApprovalStep, Contract } from '../types/contract';
import { CONTRACT_STATUS_BADGE, DECISION_LABELS, latestRound, STEP_STATE_BADGE } from '../utils/contractStatus';
import { ContractSection, CustomerSnapshot, Summary } from './ContractFormParts';

/** Nội dung hồ sơ chỉ xem (06.1): khách hàng, thông tin chung, hạng mục kèm khu vực, nội dung. */
export function ContractInfoSections({ contract }: { contract: Contract }) {
  const customer = contractsApi.getFormOptions().customers.find((item) => item.code === contract.customerCode);
  const activeAreas = new Set(contractsApi.getFormOptions().areas.map((area) => area.code));
  return (
    <div className="contract-card">
      <ContractSection title="Khách hàng"><CustomerSnapshot customer={customer} fallback={`${contract.customerCode} · ${contract.customerName}`} /></ContractSection>
      <hr className="contract-divider" />
      <ContractSection title="Thông tin chung">
        <dl className="contract-summary">
          <Summary label="Loại hợp đồng" value={contract.contractType} />
          <Summary label="Hiệu lực" value={`${formatDate(contract.effectiveFrom)} – ${formatDate(contract.effectiveTo)}`} />
          <Summary label="Giá trị" value={formatMoney(contract.value)} />
          <Summary label="Điều khoản thanh toán" value={contract.paymentTerm} />
        </dl>
      </ContractSection>
      <hr className="contract-divider" />
      <ContractSection title="Phạm vi dịch vụ & khu vực thực hiện">
        <div className="contract-detail-services">
          {contract.services.map((item) => (
            <div key={item.id} className="contract-detail-services__row">
              <span><strong>{item.serviceName}</strong><span>{item.serviceCode} · {item.unit}</span></span>
              {item.requiresArea ? (
                <span className="contract-detail-services__area"><Icon name="map-pin" size={14} />{item.areaCode || 'Chưa chọn khu vực'}{item.areaCode && !activeAreas.has(item.areaCode) && <StatusBadge label="Tạm ngưng" tone="warning" />}</span>
              ) : <span className="contract-detail-services__area">Không gắn mặt bằng</span>}
            </div>
          ))}
        </div>
      </ContractSection>
      <hr className="contract-divider" />
      <ContractSection title="Nội dung hợp đồng"><div className="contract-content-readonly">{contract.content}</div></ContractSection>
    </div>
  );
}

export function ManagementInfoCard({ contract }: { contract: Contract }) {
  const badge = CONTRACT_STATUS_BADGE[contract.status];
  return (
    <section className="side-card">
      <h2 className="side-card__title">Thông tin quản lý</h2>
      <div className="side-card__item"><span className="side-card__label">Mã hợp đồng</span><strong>{contract.code}</strong></div>
      <div className="side-card__item"><span className="side-card__label">Trạng thái</span><StatusBadge label={badge.label} tone={badge.tone} /></div>
      <div className="side-card__item"><span className="side-card__label">Người lập · phụ trách</span><span className="side-card__value">{contract.ownerName}</span></div>
      <div className="side-card__item"><span className="side-card__label">Thời điểm tạo</span><span className="side-card__value">{formatDateTime(contract.createdAt)}</span></div>
      <div className="side-card__item"><span className="side-card__label">Cập nhật gần nhất</span><span className="side-card__value">{formatDateTime(contract.updatedAt)} · phiên bản {contract.version}</span></div>
    </section>
  );
}

/** Danh sách tệp chỉ xem; trạng thái chưa có tài liệu theo SYS-CTR-06 A1. */
export function AttachmentList({ contract }: { contract: Contract }) {
  return (
    <section className="side-card">
      <h2 className="side-card__title">Tệp đính kèm ({contract.attachments.length})</h2>
      {contract.attachments.length === 0 ? (
        <p className="side-card__subtitle">Chưa có tệp đính kèm.</p>
      ) : (
        <ul className="file-list">
          {contract.attachments.map((file) => (
            <li key={file.name} className="file-list__item"><Icon name="file" className="file-list__icon" /><span className="file-list__name">{file.name}</span><span className="file-list__size">{formatFileSize(file.size)}</span></li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Tóm tắt tiến độ trên chi tiết (06 bước 7); chưa trình thì không hiển thị tuyến duyệt (A2). */
export function ProgressSummaryCard({ contract }: { contract: Contract }) {
  const round = latestRound(contract);
  return (
    <section className="side-card">
      <h2 className="side-card__title">Tiến độ phê duyệt</h2>
      {!round ? (
        <>
          <StatusBadge label="Chưa gửi trình duyệt" tone="neutral" />
          <p className="side-card__subtitle">Quy trình Trưởng phòng Kinh doanh → Pháp chế → Ban Giám đốc chỉ hiển thị sau khi hồ sơ được gửi trình duyệt.</p>
        </>
      ) : (
        <>
          <p className="side-card__subtitle">Lượt {round.no} · trình {formatDateTime(round.submittedAt)}{round.result === 'withdrawn' ? ' · đã rút' : ''}</p>
          <StepTimeline round={round} compact />
        </>
      )}
      <Link className="contract-link" to={ROUTES.contractProgress(contract.code)}>Tiến độ và lịch sử phê duyệt <Icon name="arrow-right" size={14} /></Link>
    </section>
  );
}

function stepMeta(step: ApprovalStep): string {
  if (step.state === 'done' || step.state === 'stopped') return `${step.decidedByName} · ${step.decidedAt ? formatDateTime(step.decidedAt) : ''}`;
  if (step.state === 'unassigned') return 'Chưa có người được giao';
  if (step.state === 'reviewing') return `${step.assigneeName} đang giữ${step.acceptedAt ? ` · tiếp nhận ${formatDateTime(step.acceptedAt)}` : ''}`;
  if (step.state === 'pending-accept') return `Giao ${step.assigneeName} · ${step.assignedAt ? formatDateTime(step.assignedAt) : ''}`;
  if (step.state === 'skipped') return 'Không thực hiện';
  return 'Chưa đến lượt';
}

/** Tuyến duyệt theo cấu hình của lượt (SYS-CTR-11 bước 5–7). */
export function StepTimeline({ round, compact, showComments = true }: { round: ApprovalRound; compact?: boolean; showComments?: boolean }) {
  return (
    <ol className={compact ? 'contract-steps contract-steps--compact' : 'contract-steps'}>
      {round.steps.map((step, index) => {
        const badge = step.state === 'stopped' && step.decision ? { label: DECISION_LABELS[step.decision], tone: step.decision === 'reject' ? 'danger' as const : 'warning' as const } : STEP_STATE_BADGE[step.state];
        return (
          <li key={step.key} className={`contract-steps__item contract-steps__item--${step.state}`}>
            <span className="contract-steps__marker">{step.state === 'done' ? <Icon name="check" size={14} /> : index + 1}</span>
            <div className="contract-steps__body">
              <div className="contract-steps__head"><strong>{step.label}</strong><StatusBadge label={badge.label} tone={badge.tone} /></div>
              <span className="contract-steps__meta">{stepMeta(step)}</span>
              {!compact && showComments && step.comment && (step.state === 'done' || step.state === 'stopped') && (
                <p className="contract-steps__comment">“{step.comment}”{step.reviewedVersion ? ` · phiên bản ${step.reviewedVersion}` : ''}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Thông tin yêu cầu chỉnh sửa / từ chối / hủy hồ sơ hiển thị trên chi tiết (03 A3, 05.5). */
export function RecordNotice({ contract }: { contract: Contract }) {
  if (contract.status === 'revision-requested' && contract.revisionRequest) {
    const r = contract.revisionRequest;
    return <NoticeCard icon="edit" tone="warning" title={`Yêu cầu chỉnh sửa từ ${r.stepLabel}`} meta={`${r.byName} · ${formatDateTime(r.at)}`} body={r.content} />;
  }
  if (contract.status === 'rejected' && contract.rejection) {
    const r = contract.rejection;
    return <NoticeCard icon="x-circle" tone="danger" title={`Bị từ chối tại bước ${r.stepLabel}`} meta={`${r.byName} · ${formatDateTime(r.at)}`} body={r.reason} />;
  }
  if (contract.status === 'cancelled' && contract.cancellation) {
    const c = contract.cancellation;
    return <NoticeCard icon="x-circle" tone="neutral" title="Thông tin hủy hồ sơ" meta={`${c.byName} · ${formatDateTime(c.at)}`} body={c.reason} />;
  }
  return null;
}

function NoticeCard({ icon, tone, title, meta, body }: { icon: IconName; tone: 'warning' | 'danger' | 'neutral'; title: string; meta: string; body: string }) {
  return <section className={`contract-notice contract-notice--${tone}`}><Icon name={icon} /><div><h2>{title}</h2><span>{meta}</span><p>{body}</p></div></section>;
}

/** Trạng thái không xem được hồ sơ: không có quyền, không tồn tại hoặc lỗi tải (02.6, 02.7, 06.4–06.6, 11.12–11.14). */
export function ContractUnavailable({ kind, code, onRetry, backTo = ROUTES.contracts, backLabel = 'Quay lại danh sách hợp đồng' }: { kind: 'forbidden' | 'not-found' | 'error'; code: string; onRetry?: () => void; backTo?: string; backLabel?: string }) {
  const content = {
    forbidden: { icon: 'lock' as IconName, title: 'Bạn không được phép xem hồ sơ này', body: `Hồ sơ ${code} nằm ngoài phạm vi được phân quyền. Hệ thống không hiển thị nội dung hợp đồng.` },
    'not-found': { icon: 'file' as IconName, title: 'Không tìm thấy hồ sơ có thể truy cập', body: `Hồ sơ ${code} không tồn tại hoặc không còn khả dụng.` },
    error: { icon: 'alert' as IconName, title: 'Không thể tải thông tin', body: 'Đã xảy ra lỗi khi truy xuất dữ liệu. Hệ thống không hiển thị thông tin chưa được xác thực.' },
  }[kind];
  return (
    <div className="contract-card contract-not-found">
      <span className="contract-not-found__icon"><Icon name={content.icon} size={28} /></span>
      <h1>{content.title}</h1>
      <p>{content.body}</p>
      <div className="contract-not-found__actions">
        {onRetry && <Button onClick={onRetry}>Tải lại</Button>}
        <ButtonLink to={backTo} variant="secondary">{backLabel}</ButtonLink>
      </div>
    </div>
  );
}
