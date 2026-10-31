import { Button } from '@/components/button/Button';
import { Dialog } from '@/components/feedback/Dialog';
import { Icon } from '@/components/icon/Icon';
import { formatDateTime } from '@/utils/format';
import type { Customer, CustomerChange, CustomerConflict, EditableCustomerDraft } from '../types/customer';
import { CUSTOMER_FIELD_LABELS, EDITABLE_FIELDS, sameValue, toEditableDraft } from '../utils/customerChanges';
import { normalizeCustomerDraft } from '../utils/customerValidation';
import { formatChangeAfter, formatChangeBefore, formatFieldValue, type CustomerCatalogs } from './customerFormat';

/** Thẻ "Thay đổi chưa lưu" bên phải biểu mẫu chỉnh sửa: giá trị đang lưu gạch ngang → giá trị mới (02.1). */
export function UnsavedChangesCard({ changes, catalogs }: { changes: CustomerChange[]; catalogs: CustomerCatalogs }) {
  return (
    <section className="side-card" aria-live="polite">
      <h2 className="side-card__title">Thay đổi chưa lưu</h2>
      {changes.length === 0 ? (
        <p className="side-card__subtitle">Chưa có thay đổi nào so với phiên bản đang lưu.</p>
      ) : (
        changes.map((change) => (
          <div key={change.field} className="change-diff">
            <span className="change-diff__label">{CUSTOMER_FIELD_LABELS[change.field]}</span>
            <del className="change-diff__before">{formatChangeBefore(change, catalogs)}</del>
            <span className="change-diff__after">
              <Icon name="arrow-right" />
              <span>{formatChangeAfter(change, catalogs)}</span>
            </span>
          </div>
        ))
      )}
    </section>
  );
}

type ConflictDialogProps = {
  conflict: CustomerConflict;
  /** Phiên bản người dùng đang sửa. */
  base: Customer;
  values: EditableCustomerDraft;
  catalogs: CustomerCatalogs;
  onDiscard: () => void;
  onReload: () => void;
  onClose: () => void;
};

/**
 * 02.4 · Hồ sơ đã được người khác cập nhật: không ghi đè, so sánh bản đang sửa với bản mới nhất theo từng trường;
 * thay đổi của mình tô xanh, của người khác tô vàng.
 */
export function CustomerConflictDialog({ conflict, base, values, catalogs, onDiscard, onReload, onClose }: ConflictDialogProps) {
  const { latest } = conflict;
  const saved = toEditableDraft(base);
  const mine = toEditableDraft(normalizeCustomerDraft({ ...values, taxCode: '' }));
  const theirs = toEditableDraft(latest);
  const rows = EDITABLE_FIELDS.filter((f) => !sameValue(saved[f], mine[f]) || !sameValue(saved[f], theirs[f])).map((field) => ({
    field,
    mine: formatFieldValue(field, mine[field], catalogs) || '—',
    theirs: formatFieldValue(field, theirs[field], catalogs) || '—',
    mineChanged: !sameValue(saved[field], mine[field]),
    theirsChanged: !sameValue(saved[field], theirs[field]),
  }));

  return (
    <Dialog
      title="Hồ sơ đã được người khác cập nhật"
      width={760}
      initialFocus="last"
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onDiscard}>
            Hủy chỉnh sửa
          </Button>
          <Button onClick={onReload}>Tải lại bản mới nhất và đối chiếu</Button>
        </>
      }
    >
      <p className="dialog__body">
        {conflict.updatedBy} đã lưu phiên bản {latest.version} lúc {formatDateTime(conflict.updatedAt)} trong khi bạn đang sửa
        phiên bản {base.version}. Hệ thống không ghi đè. Hãy tải lại và đối chiếu dữ liệu mới nhất trước khi tiếp tục cập nhật.
      </p>
      <div className="conflict-table__wrap">
        <table className="conflict-table">
          <thead>
            <tr>
              <th scope="col">Trường</th>
              <th scope="col">Bản bạn đang sửa</th>
              <th scope="col">Bản mới nhất (v{latest.version})</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.field}>
                <th scope="row">{CUSTOMER_FIELD_LABELS[row.field]}</th>
                <td>
                  <span className={row.mineChanged ? 'conflict-table__value conflict-table__value--mine' : 'conflict-table__value'}>
                    {row.mine}
                  </span>
                </td>
                <td>
                  <span className={row.theirsChanged ? 'conflict-table__value conflict-table__value--theirs' : 'conflict-table__value'}>
                    {row.theirs}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="conflict-legend">
        <span className="conflict-legend__swatch conflict-legend__swatch--mine" /> Thay đổi của bạn
        <span className="conflict-legend__swatch conflict-legend__swatch--theirs" /> Thay đổi của người khác
      </p>
    </Dialog>
  );
}
