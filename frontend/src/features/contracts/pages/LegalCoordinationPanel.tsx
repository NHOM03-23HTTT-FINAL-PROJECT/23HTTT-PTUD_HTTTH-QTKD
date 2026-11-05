import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { TextAreaField } from '@/components/form/TextAreaField';
import { SelectField } from '@/components/form/SelectField';
import { Dialog } from '@/components/feedback/Dialog';
import { approvalApi, type ReviewCoordination, type ReviewDocument } from '../api/approvalApi';
import { ApiError } from '@/lib/http/client';
import { IS_MOCK_AUTH } from '@/features/auth/api/authApi';

export function LegalCoordinationPanel({ document, editable }: { document: ReviewDocument; editable: boolean }) {
  const [items, setItems] = useState<ReviewCoordination[]>([]);
  const [department, setDepartment] = useState('KT');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [requestOpen, setRequestOpen] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    if (IS_MOCK_AUTH) return;
    let active = true;
    approvalApi.coordinations(document.id).then(v => { if (active) { setItems(v); setError(''); } })
      .catch(() => { if (active) setError('Không thể tải yêu cầu phối hợp. Hãy thử tải lại.'); });
    return () => { active = false; };
  }, [document.id, document.roundId, reload]);
  async function send() {
    if (inFlight.current || !content.trim()) return;
    const step = document.steps.find(s => s.key === 'legal');
    if (!step) return;
    inFlight.current = true; setBusy(true);
    try {
      const item = await approvalApi.coordinate(document.id, { roundId: document.roundId, stepId: step.id, step: 'legal', viewedVersion: document.version }, department, content.trim(), crypto.randomUUID());
      setItems(v => [...v, item]); setContent(''); setError(''); setRequestOpen(false);
    } catch { setError('Chưa gửi được yêu cầu phối hợp. Kiểm tra hồ sơ và thử lại.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="review-coordination"><div className="review-coordination__head"><strong>Phối hợp phòng ban chuyên môn</strong>
    <div className="review-panel__actions"><Button variant="secondary" disabled={busy} onClick={() => setReload(n => n + 1)}>Tải lại phản hồi</Button>
      {editable && <Button variant="secondary" disabled={busy} onClick={() => setRequestOpen(true)}>Yêu cầu phối hợp</Button>}</div></div>
    {error && <Alert tone="danger" title="Chưa hoàn tất">{error}</Alert>}
    {!items.length && <p className="review-panel__text">Chưa có yêu cầu phối hợp trong lượt này.</p>}
    {items.map(i => <div className="review-coordination__item" key={i.id}><strong>{i.department} · {i.reply ? 'Đã phản hồi' : 'Chờ phản hồi'}</strong><p>{i.content}</p><p>{i.requestedBy}</p>{i.reply && <p>Phản hồi: {i.reply} · {i.repliedBy}</p>}</div>)}
    {editable && requestOpen && <Dialog title="Yêu cầu phối hợp phòng ban" icon="users" tone="info" width={560} initialFocus="first" onClose={() => { if (!busy) setRequestOpen(false); }}
      actions={<><Button variant="secondary" disabled={busy} onClick={() => setRequestOpen(false)}>Hủy</Button><Button disabled={busy || !content.trim()} onClick={() => void send()}>{busy ? 'Đang gửi…' : 'Gửi yêu cầu phối hợp'}</Button></>}>
      <div className="dialog__body contract-dialog-form"><p>{document.code ?? document.id} · Lượt {document.roundNo}</p>
        <SelectField label="Phòng ban chuyên môn" placeholder="Chọn phòng ban" required value={department} disabled={busy} onChange={setDepartment} options={[
          { value: 'KT', label: 'Khai thác' }, { value: 'KTOAN', label: 'Kế toán' }, { value: 'KD', label: 'Kinh doanh' }, { value: 'BGD', label: 'Ban Giám đốc' },
        ]} />
        <TextAreaField label="Nội dung cần xác minh / tài liệu liên quan" required maxLength={4000} value={content} disabled={busy} onChange={e => setContent(e.target.value)} />
      </div></Dialog>}
  </section>;
}

export function CoordinationInboxPage() {
  const [items, setItems] = useState<ReviewCoordination[]>([]);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    if (IS_MOCK_AUTH) { setError('Danh sách phối hợp chưa được kết nối trong phiên dùng thử.'); return; }
    let active = true;
    approvalApi.coordinationInbox().then(v => { if (active) { setItems(v); setError(''); } })
      .catch(() => { if (active) setError('Không thể tải yêu cầu phối hợp của phòng ban.'); });
    return () => { active = false; };
  }, [reload]);
  async function reply(item: ReviewCoordination) {
    if (inFlight.current || !replies[item.id]?.trim()) return;
    inFlight.current = true; setBusy(true);
    try {
      const saved = await approvalApi.reply(item.documentId, item.id, replies[item.id].trim(), crypto.randomUUID());
      setItems(v => v.map(i => i.id === saved.id ? saved : i)); setError('');
    } catch (e) { setError(e instanceof ApiError && e.status === 409 ? 'Yêu cầu đã được trả lời hoặc bước Pháp chế đã kết thúc. Hãy tải lại.' : 'Không thể ghi nhận phản hồi.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <><h1>Yêu cầu phối hợp của phòng ban</h1><Button variant="secondary" onClick={() => setReload(n => n + 1)}>Tải lại</Button>
    {error && <Alert tone="danger" title="Chưa hoàn tất">{error}</Alert>}
    {items.map(item => <section className="side-card" key={item.id}><h2>Hồ sơ {item.documentId}</h2><p>{item.content} · {item.requestedBy}</p>
      {item.reply ? <p>Phản hồi: {item.reply} · {item.repliedBy}</p> : <><TextAreaField label="Thông tin / ý kiến phản hồi" required value={replies[item.id] ?? ''} disabled={busy} onChange={e => setReplies(v => ({ ...v, [item.id]: e.target.value }))} />
        <Button disabled={busy || !replies[item.id]?.trim()} onClick={() => void reply(item)}>Gửi phản hồi</Button></>}
    </section>)}
  </>;
}
