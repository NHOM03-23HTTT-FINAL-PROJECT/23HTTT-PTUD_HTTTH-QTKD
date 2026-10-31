import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSession, useUnsavedChanges } from '@/app/providers/SessionProvider';
import { Button, ButtonLink } from '@/components/button/Button';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { Alert } from '@/components/feedback/Alert';
import { Dialog } from '@/components/feedback/Dialog';
import { InputField } from '@/components/form/InputField';
import { MultiSelectField, SelectField } from '@/components/form/SelectField';
import { Icon } from '@/components/icon/Icon';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { ROUTES } from '@/constants/routes';
import { formatDateTime } from '@/utils/format';
import { workflowApi } from '../api/workflowApi';
import { newId } from '../hooks/useContractDraftForm';
import {
  WorkflowConfigError,
  type ParticipantMode,
  type WorkflowConfig,
  type WorkflowConfigRow,
  type WorkflowDocType,
  type WorkflowDraft,
  type WorkflowErrors,
  type WorkflowStage,
} from '../types/workflowConfig';
import {
  CONFIRM_DEPARTMENTS,
  countWorkflowErrors,
  defaultStages,
  DOC_TYPE_LABELS,
  emptyWorkflowDraft,
  MODE_LABELS,
  STAGE_LABELS,
  stageChanged,
  validateWorkflowDraft,
  WORKFLOW_SCOPES,
} from '../utils/workflowConfig';
import './Contracts.css';

type ActivatedState = { activated?: { code: string; version: number } };

/** 10.1 · Danh sách cấu hình người tham gia theo loại hồ sơ + phạm vi phòng ban. */
export function WorkflowConfigListPage() {
  const { user } = useAuth();
  const { endSession } = useSession();
  const location = useLocation();
  const activated = (location.state as ActivatedState | null)?.activated;
  const [rows, setRows] = useState<WorkflowConfigRow[] | null>(null);
  const [error, setError] = useState<'forbidden' | 'error' | null>(null);
  const [retry, setRetry] = useState(0);
  const [historyOf, setHistoryOf] = useState<WorkflowConfig | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setError(null);
    workflowApi
      .list(user.id, user.signedInAt)
      .then((result) => active && setRows(result))
      .catch((err) => {
        if (!active) return;
        if (err instanceof WorkflowConfigError && err.code === 'SESSION_ENDED') endSession(err.sessionStatus ?? 'expired');
        else setError(err instanceof WorkflowConfigError && err.code === 'FORBIDDEN' ? 'forbidden' : 'error');
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retry, user?.id]);

  const columns: Column<WorkflowConfigRow>[] = [
    { key: 'code', header: 'Mã cấu hình', width: 120, render: (row) => row.config ? <strong className={row.config.code === activated?.code ? 'contract-list__code contract-list__code--highlight' : 'contract-list__code'}>{row.config.code}</strong> : '—' },
    { key: 'type', header: 'Loại hồ sơ · phạm vi', render: (row) => <span className="contract-list__stack"><span>{DOC_TYPE_LABELS[row.docType]}</span><small>{row.scope}</small></span> },
    { key: 'version', header: 'Phiên bản đang áp dụng', width: 160, render: (row) => (row.config ? `v${row.config.version}` : '—') },
    { key: 'activatedAt', header: 'Kích hoạt lúc', width: 140, render: (row) => (row.config ? formatDateTime(row.config.activatedAt) : '—') },
    { key: 'status', header: 'Trạng thái', width: 140, render: (row) => <StatusBadge label={row.config ? 'Đang áp dụng' : 'Chưa cấu hình'} tone={row.config ? 'success' : 'neutral'} /> },
    { key: 'by', header: 'Người cập nhật', width: 130, render: (row) => row.config?.activatedByName ?? '—' },
    {
      key: 'actions', header: '', width: 210, align: 'end',
      render: (row) => row.config ? (
        <span className="workflow-row-actions"><button type="button" className="btn btn--ghost" onClick={() => setHistoryOf(row.config!)}>Lịch sử phiên bản</button><Link to={ROUTES.workflowEdit(row.config.code)} className="btn btn--secondary">Cập nhật</Link></span>
      ) : <Link to={`${ROUTES.workflowCreate}?docType=${row.docType}&scope=${encodeURIComponent(row.scope)}`} className="btn btn--secondary">Tạo cấu hình</Link>,
    },
  ];

  return (
    <>
      <nav className="breadcrumb" aria-label="Đường dẫn"><span>Quy trình</span><span className="breadcrumb__separator">/</span><span className="breadcrumb__current" aria-current="page">Cấu hình người tham gia</span></nav>
      <div className="page-header">
        <div className="page-header__title"><h1>Cấu hình người tham gia</h1><p>Người tham gia từng giai đoạn từ lập đến ký kết theo loại hồ sơ và phạm vi phòng ban. Mỗi hồ sơ dùng phiên bản đang áp dụng tại thời điểm trình.</p></div>
        <div className="page-header__actions"><ButtonLink to={ROUTES.workflowCreate}>+ Tạo mới</ButtonLink></div>
      </div>
      {activated && <Alert tone="success" title="Kích hoạt cấu hình thành công">{activated.code} phiên bản {activated.version} là cấu hình đang áp dụng cho các hồ sơ lập và trình từ bây giờ. Hồ sơ đã trình tiếp tục theo phiên bản gắn lúc trình.</Alert>}
      <section className="contract-results">
        <div className="contract-results__header"><h2>{rows ? `${rows.filter((row) => row.config).length}/${rows.length} phạm vi đã cấu hình` : 'Đang tải…'}</h2><p>5 giai đoạn cố định: Lập & trình hồ sơ → Rà soát kinh doanh → Rà soát pháp lý → Phê duyệt → Ký kết.</p></div>
        {error === 'forbidden' && <div className="contract-results__message"><Alert tone="danger" title="Không đủ quyền quản trị quy trình">Tài khoản không còn quyền quản trị quy trình của phân hệ Hợp đồng.</Alert></div>}
        {error === 'error' && <div className="contract-results__message"><Alert tone="danger" title="Không thể tải danh sách cấu hình" action={<button type="button" className="alert__link" onClick={() => setRetry((n) => n + 1)}>Tải lại</button>}>Đã xảy ra lỗi truy xuất dữ liệu.</Alert></div>}
        {rows && !error && <DataTable columns={columns} rows={rows} rowKey={(row) => `${row.docType}-${row.scope}`} />}
      </section>
      {historyOf && <HistoryDialog config={historyOf} onClose={() => setHistoryOf(null)} />}
    </>
  );
}

/** 10.9 · Lịch sử phiên bản – phiên bản cũ chỉ xem, không sửa hoặc kích hoạt lại trực tiếp. */
function HistoryDialog({ config, onClose }: { config: WorkflowConfig; onClose: () => void }) {
  const people = workflowApi.getPeople();
  const name = (id: string) => people.find((person) => person.id === id)?.name ?? id;
  const [open, setOpen] = useState<number>(config.version);
  return (
    <Dialog title={`Lịch sử phiên bản · ${config.code}`} icon="history" tone="info" width={720} initialFocus="first" onClose={onClose} actions={<Button variant="secondary" onClick={onClose}>Đóng</Button>}>
      <div className="dialog__body workflow-history">
        {[...config.history].reverse().map((version) => (
          <div key={version.version} className="workflow-history__item">
            <button type="button" className="workflow-history__head" aria-expanded={open === version.version} onClick={() => setOpen(open === version.version ? -1 : version.version)}>
              <strong>Phiên bản {version.version}</strong>
              <StatusBadge label={version.version === config.version ? 'Đang áp dụng' : 'Chỉ xem'} tone={version.version === config.version ? 'success' : 'neutral'} />
              <span>{version.activatedByName} · {formatDateTime(version.activatedAt)}</span>
            </button>
            <p>{version.summary}</p>
            {open === version.version && (
              <ul className="workflow-history__stages">
                {version.stages.filter((stage) => stage.enabled).map((stage) => <li key={stage.key}><strong>{STAGE_LABELS[stage.key]}</strong><span>{stage.participants.map(name).join(', ') || '—'}{stage.backups.length ? ` · dự phòng: ${stage.backups.map(name).join(', ')}` : ''}</span></li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Dialog>
  );
}

type FormAlert =
  | { kind: 'invalid'; count: number }
  | { kind: 'duplicate' }
  | { kind: 'conflict' }
  | { kind: 'save-failed' }
  | { kind: 'forbidden' }
  | { kind: 'network' };

/** 10.2 → 10.8, 10.10 → 10.14 · Tạo hoặc cập nhật cấu hình người tham gia, kiểm tra rồi lưu và kích hoạt. */
export function WorkflowConfigFormPage() {
  const { code } = useParams();
  const [searchParams] = useSearchParams();
  const existing = useMemo(() => (code ? workflowApi.getConfig(code) : undefined), [code]);
  if (code && !existing) {
    return <div className="contract-card contract-not-found"><span className="contract-not-found__icon"><Icon name="workflow" size={28} /></span><h1>Không tìm thấy cấu hình {code}</h1><div className="contract-not-found__actions"><ButtonLink to={ROUTES.workflows} variant="secondary">Về danh sách cấu hình</ButtonLink></div></div>;
  }
  const docType = searchParams.get('docType') as WorkflowDocType | null;
  const initial: WorkflowDraft = existing
    ? { name: existing.name, docType: existing.docType, scope: existing.scope, stages: existing.stages.map((stage) => ({ ...stage })) }
    : { ...emptyWorkflowDraft(), docType: docType ?? '', scope: searchParams.get('scope') ?? '', stages: defaultStages(docType ?? '') };
  return <WorkflowForm key={`${code ?? 'new'}-${existing?.version ?? 0}`} existing={existing} initial={initial} />;
}

function WorkflowForm({ existing, initial }: { existing?: WorkflowConfig; initial: WorkflowDraft }) {
  const { user } = useAuth();
  const { endSession } = useSession();
  const navigate = useNavigate();
  const people = useMemo(() => workflowApi.getPeople(), []);
  const requestId = useRef(newId());
  const [draft, setDraft] = useState<WorkflowDraft>(initial);
  const [errors, setErrors] = useState<WorkflowErrors>({});
  const [checked, setChecked] = useState(false);
  const [alert, setAlert] = useState<FormAlert | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useUnsavedChanges(dirty ? `Cấu hình người tham gia${draft.name ? ` – ${draft.name}` : ''}` : null);
  const nameOf = (id: string) => people.find((person) => person.id === id)?.name ?? id;

  if (!user) return null;

  function change(patch: Partial<WorkflowDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setChecked(false);
    setAlert(null);
    // Mỗi lần sửa sau khi kiểm tra là một lần gửi mới (E6 chỉ chặn gửi lặp của cùng nội dung).
    requestId.current = newId();
  }

  function changeStage(key: WorkflowStage['key'], patch: Partial<WorkflowStage>) {
    change({ stages: draft.stages.map((stage) => (stage.key === key ? { ...stage, ...patch } : stage)) });
    setErrors((current) => ({ ...current, stages: { ...current.stages, [key]: undefined } }));
  }

  function check() {
    const next = validateWorkflowDraft(draft, people);
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setChecked(false);
      setAlert({ kind: 'invalid', count: countWorkflowErrors(next) });
      return;
    }
    setAlert(null);
    setChecked(true);
  }

  async function activate(replaceExisting = false) {
    if (busy || !user) return;
    setBusy(true);
    try {
      const result = await workflowApi.activate({ userId: user.id, signedInAt: user.signedInAt, idempotencyKey: requestId.current, code: existing?.code, baseVersion: existing?.version, replaceExisting, draft });
      const state: ActivatedState = { activated: { code: result.config.code, version: result.config.version } };
      navigate(ROUTES.workflows, { replace: true, state });
    } catch (error) {
      setConfirmOpen(false);
      setChecked(false);
      if (!(error instanceof WorkflowConfigError)) setAlert({ kind: 'network' });
      else if (error.code === 'SESSION_ENDED') endSession(error.sessionStatus ?? 'expired');
      else if (error.code === 'VALIDATION') {
        setErrors(error.errors ?? {});
        setAlert({ kind: 'invalid', count: countWorkflowErrors(error.errors ?? {}) });
      } else setAlert({ kind: error.code === 'DUPLICATE_SCOPE' ? 'duplicate' : error.code === 'CONFLICT' ? 'conflict' : error.code === 'SAVE_FAILED' ? 'save-failed' : error.code === 'FORBIDDEN' ? 'forbidden' : 'network' });
    } finally {
      setBusy(false);
    }
  }

  const options = people.map((person) => ({ value: person.id, label: `${person.name} · ${person.title}${person.active ? '' : ' (vô hiệu hóa)'}` }));
  const savedStage = (key: WorkflowStage['key']) => existing?.stages.find((stage) => stage.key === key);

  return (
    <>
      <nav className="breadcrumb" aria-label="Đường dẫn"><Link to={ROUTES.workflows}>Cấu hình người tham gia</Link><span className="breadcrumb__separator">/</span><span className="breadcrumb__current" aria-current="page">{existing ? `Cập nhật ${existing.code}` : 'Tạo mới'}</span></nav>
      <div className="page-header">
        <div className="page-header__title"><h1>{existing ? `Cập nhật cấu hình ${existing.code}` : 'Tạo cấu hình người tham gia'}</h1><p>{existing ? `Đang chỉnh từ phiên bản ${existing.version}; lưu sẽ tạo phiên bản mới, không ghi đè phiên bản đã được các lượt duyệt sử dụng.` : 'Thiết lập người tham gia cho 5 giai đoạn cố định; không thêm, xóa hoặc đảo thứ tự giai đoạn.'}</p></div>
        <div className="page-header__actions">
          <Button variant="secondary" disabled={busy} onClick={() => (dirty ? setLeaveOpen(true) : navigate(ROUTES.workflows))}>Hủy</Button>
          <Button variant="secondary" disabled={busy} onClick={check}>Kiểm tra cấu hình</Button>
          <Button disabled={!checked || busy} onClick={() => setConfirmOpen(true)}>Lưu và kích hoạt</Button>
        </div>
      </div>

      {alert && <FormAlertBanner alert={alert} busy={busy} onReplace={() => void activate(true)} onRetry={() => setConfirmOpen(true)} onReload={() => navigate(0)} />}
      {checked && <Alert tone="success" title="Cấu hình hợp lệ">Mỗi giai đoạn có người còn hoạt động, không ai vừa lập vừa duyệt và người ký đại diện có thẩm quyền ký. Xem lại "Người tham gia sẽ áp dụng" rồi chọn "Lưu và kích hoạt".</Alert>}

      <div className="contract-layout">
        <div className="contract-card">
          <div className="contract-grid">
            <InputField className="contract-span-2" label="Tên cấu hình" required value={draft.name} error={errors.name} placeholder="VD: Hợp đồng dịch vụ – Phòng Kinh doanh 1" onChange={(event) => change({ name: event.target.value })} />
            <SelectField label="Loại hồ sơ" required placeholder="Chọn loại hồ sơ" disabled={Boolean(existing)} options={(Object.keys(DOC_TYPE_LABELS) as WorkflowDocType[]).map((value) => ({ value, label: DOC_TYPE_LABELS[value] }))} value={draft.docType} error={errors.docType} onChange={(value) => change({ docType: value as WorkflowDocType, stages: defaultStages(value as WorkflowDocType) })} />
            <SelectField label="Phạm vi áp dụng" required placeholder="Chọn phòng ban" disabled={Boolean(existing)} options={WORKFLOW_SCOPES.map((value) => ({ value, label: value }))} value={draft.scope} error={errors.scope} onChange={(value) => change({ scope: value })} />
          </div>
          {(draft.docType === 'cancel-agreement' || draft.docType === 'termination') && <Alert tone="info" title="Cấu hình cho thỏa thuận hủy / biên bản chấm dứt">Kích hoạt cấu hình không đồng nghĩa chấp thuận hủy hoặc chấm dứt hợp đồng; từng hồ sơ vẫn phải được lập, trình và ký riêng.</Alert>}
          <hr className="contract-divider" />
          <ol className="workflow-stages">
            {draft.stages.map((stage, index) => {
              const isSigning = stage.key === 'signing';
              const changedStage = existing && stageChanged(stage, savedStage(stage.key));
              const stageError = errors.stages?.[stage.key];
              return (
                <li key={stage.key} className={['workflow-stage', !stage.enabled && 'workflow-stage--disabled', stageError && 'workflow-stage--error'].filter(Boolean).join(' ')}>
                  <div className="workflow-stage__head">
                    <span className="workflow-stage__no">{index + 1}</span>
                    <strong>{STAGE_LABELS[stage.key]}</strong>
                    {stage.key === 'dept-confirm' && <StatusBadge label="Tùy chọn" tone="info" />}
                    {changedStage && <StatusBadge label="Đã sửa" tone="accent" />}
                    {stage.key === 'dept-confirm' && <label className="contract-switch workflow-stage__toggle"><input type="checkbox" checked={stage.enabled} onChange={(event) => changeStage(stage.key, { enabled: event.target.checked })} /><span>{stage.enabled ? 'Bật' : 'Tắt'}</span></label>}
                  </div>
                  {stage.enabled && (
                    <div className="workflow-stage__body">
                      {stage.key === 'dept-confirm' && (
                        <div className="contract-grid">
                          <InputField label="Điều kiện áp dụng" required value={stage.condition ?? ''} placeholder="VD: Nội dung điều chỉnh thuộc khu vực khai thác" onChange={(event) => changeStage(stage.key, { condition: event.target.value })} />
                          <SelectField label="Bộ phận xác nhận" required placeholder="Chọn bộ phận" options={CONFIRM_DEPARTMENTS.map((value) => ({ value, label: value }))} value={stage.confirmDepartment ?? ''} onChange={(value) => changeStage(stage.key, { confirmDepartment: value })} />
                        </div>
                      )}
                      <div className="contract-grid">
                        <InputField label="Vai trò tham gia" required value={stage.role} onChange={(event) => changeStage(stage.key, { role: event.target.value })} />
                        <SelectField label="Cách xác định người" required placeholder="Chọn cách xác định" options={(Object.keys(MODE_LABELS) as ParticipantMode[]).map((value) => ({ value, label: MODE_LABELS[value] }))} value={stage.mode} onChange={(value) => changeStage(stage.key, { mode: value as ParticipantMode })} />
                        <MultiSelectField label={isSigning ? 'Người ký đại diện công ty' : 'Người tham gia'} required placeholder="Chọn người" options={options} value={stage.participants} onChange={(value) => changeStage(stage.key, { participants: value })} />
                        <MultiSelectField label={isSigning ? 'Người được ủy quyền ký' : 'Người dự phòng / được ủy quyền'} placeholder="Không bắt buộc" options={options} value={stage.backups} onChange={(value) => changeStage(stage.key, { backups: value })} />
                        <MultiSelectField label={isSigning ? 'Người theo dõi ký' : 'Người nhận thông báo'} placeholder="Không bắt buộc" options={options} value={stage.notify} onChange={(value) => changeStage(stage.key, { notify: value })} />
                      </div>
                      {isSigning && <p className="workflow-stage__note"><Icon name="info" size={14} /> Khách hàng ký qua dịch vụ ký điện tử bên ngoài – không cấu hình tại đây (UC-CTR-03).</p>}
                      {stage.key === 'dept-confirm' && <p className="workflow-stage__note"><Icon name="info" size={14} /> Phụ lục không thỏa điều kiện sẽ bỏ qua giai đoạn này; các giai đoạn còn lại vẫn bắt buộc.</p>}
                    </div>
                  )}
                  {stageError && <p className="field__error">{stageError}</p>}
                </li>
              );
            })}
          </ol>
        </div>

        <aside className="contract-layout__side">
          <section className="side-card">
            <h2 className="side-card__title">{checked ? 'Người tham gia sẽ áp dụng' : 'Sơ đồ người tham gia'}</h2>
            <ol className="workflow-diagram">
              {draft.stages.filter((stage) => stage.enabled).map((stage) => <li key={stage.key}><strong>{STAGE_LABELS[stage.key]}</strong><span>{stage.participants.map(nameOf).join(', ') || 'Chưa chọn'}</span></li>)}
            </ol>
          </section>
          <section className="side-card">
            <h2 className="side-card__title">Phiên bản</h2>
            <div className="side-card__item"><span className="side-card__label">Loại hồ sơ · phạm vi</span><span className="side-card__value">{draft.docType ? DOC_TYPE_LABELS[draft.docType] : '—'} · {draft.scope || '—'}</span></div>
            <div className="side-card__item"><span className="side-card__label">Phiên bản đang áp dụng</span><span className="side-card__value">{existing ? `v${existing.version}` : 'Chưa có'}</span></div>
            <div className="side-card__item"><span className="side-card__label">Phiên bản sẽ tạo khi kích hoạt</span><span className="side-card__value">v{(existing?.version ?? 0) + 1}</span></div>
          </section>
          <section className="side-card">
            <h2 className="side-card__title">Kiểm tra khi kích hoạt</h2>
            <ul className="side-card__notes"><li>Mỗi giai đoạn xác định được ít nhất 1 người còn hoạt động.</li><li>Một người không vừa lập vừa duyệt cùng một hồ sơ.</li><li>Người ký đại diện phải có thẩm quyền ký.</li><li>Mỗi loại hồ sơ + phạm vi chỉ có 1 cấu hình đang áp dụng.</li></ul>
          </section>
        </aside>
      </div>

      {confirmOpen && (
        <Dialog title="Lưu và kích hoạt cấu hình người tham gia?" icon="workflow" tone="info" width={560} initialFocus="first" onClose={busy ? () => undefined : () => setConfirmOpen(false)} actions={<><Button variant="secondary" disabled={busy} onClick={() => setConfirmOpen(false)}>Hủy</Button><Button disabled={busy} onClick={() => void activate()}>{busy ? 'Đang kích hoạt…' : 'Xác nhận kích hoạt'}</Button></>}>
          <div className="dialog__body contract-dialog-summary">
            <dl>
              <div><dt>Loại hồ sơ · phạm vi</dt><dd>{draft.docType ? DOC_TYPE_LABELS[draft.docType] : ''} · {draft.scope}</dd></div>
              <div><dt>Phiên bản mới</dt><dd>v{(existing?.version ?? 0) + 1}{existing ? ` (thay v${existing.version})` : ' (chưa có phiên bản đang áp dụng)'}</dd></div>
              <div><dt>Giai đoạn</dt><dd>{draft.stages.filter((stage) => stage.enabled).map((stage) => STAGE_LABELS[stage.key]).join(' → ')}</dd></div>
            </dl>
            <p>Áp dụng cho các hồ sơ lập và trình từ thời điểm kích hoạt. Hồ sơ đã trình tiếp tục theo phiên bản cấu hình được gắn lúc trình.</p>
          </div>
        </Dialog>
      )}
      {leaveOpen && <Dialog title="Hủy thao tác cấu hình?" icon="alert" width={480} initialFocus="first" onClose={() => setLeaveOpen(false)} actions={<><Button variant="secondary" onClick={() => setLeaveOpen(false)}>Tiếp tục chỉnh</Button><Button variant="danger" onClick={() => navigate(ROUTES.workflows)}>Bỏ thay đổi</Button></>}><p className="dialog__body">Các thay đổi chưa lưu sẽ bị bỏ; cấu hình đang áp dụng giữ nguyên.</p></Dialog>}
    </>
  );
}

function FormAlertBanner({ alert, busy, onReplace, onRetry, onReload }: { alert: FormAlert; busy: boolean; onReplace: () => void; onRetry: () => void; onReload: () => void }) {
  if (alert.kind === 'invalid') return <Alert tone="danger" title={`Cấu hình không hợp lệ – ${alert.count} lỗi cần sửa`}>Lỗi được chỉ ra tại từng giai đoạn; dữ liệu đã nhập được giữ. Cấu hình chưa được kích hoạt.</Alert>;
  if (alert.kind === 'duplicate') return <Alert tone="warning" title="Phạm vi áp dụng bị trùng" action={<button type="button" className="alert__link" disabled={busy} onClick={onReplace}>{busy ? 'Đang kích hoạt…' : 'Xác nhận thay thế phiên bản đang áp dụng'}</button>}>Loại hồ sơ + phạm vi phòng ban này đã có cấu hình đang áp dụng. Điều chỉnh phạm vi áp dụng hoặc xác nhận thay thế.</Alert>;
  if (alert.kind === 'conflict') return <Alert tone="warning" title="Cấu hình đã bị thay đổi đồng thời" action={<button type="button" className="alert__link" onClick={onReload}>Tải lại cấu hình</button>}>Phiên bản đang áp dụng vừa được cập nhật bởi người khác. Hệ thống không ghi đè; tải lại và kiểm tra trước khi xác nhận.</Alert>;
  if (alert.kind === 'forbidden') return <Alert tone="danger" title="Không đủ quyền quản trị quy trình">Quyền của tài khoản đã bị thu hồi; cấu hình không được lưu hoặc kích hoạt.</Alert>;
  return <Alert tone="danger" title="Kích hoạt thất bại" action={<button type="button" className="alert__link" disabled={busy} onClick={onRetry}>Thử lại</button>}>Hệ thống không ghi nhận phiên bản dở dang; phiên bản đang áp dụng giữ nguyên.</Alert>;
}
