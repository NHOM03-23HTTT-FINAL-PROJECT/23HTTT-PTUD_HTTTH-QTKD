import { useId } from 'react';
import { Icon } from '@/components/icon/Icon';
import type { Area } from '../types/area';
import '@/components/form/InputField.css';
import '@/components/form/SelectField.css';

type ParentAreaFieldProps = {
  parent: Area | null;
  /** Người dùng vừa xác nhận/bỏ chọn trên sơ đồ: viền nhấn và nhãn "Đã chọn" (02.2). */
  highlighted: boolean;
  hint: string;
  error?: string;
  disabled?: boolean;
  onOpen: () => void;
  onClear: () => void;
};

/** Ô "Khu vực cấp cha" trên biểu mẫu tạo khu vực: bấm để mở sơ đồ phân cấp (UC-ARE-02 bước 1). */
export function ParentAreaField({ parent, highlighted, hint, error, disabled, onOpen, onClear }: ParentAreaFieldProps) {
  const id = useId();
  const boxClass = [
    'field__box',
    'parent-field__box',
    highlighted && parent && 'field__box--changed',
    error && 'field__box--error',
    disabled && 'field__box--disabled',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="field">
      <span className="field__label" id={`${id}-label`}>
        Khu vực cấp cha
        {highlighted && parent && <span className="area-tag area-tag--accent">Đã chọn</span>}
      </span>
      <div className={boxClass}>
        <button
          type="button"
          className="parent-field__trigger"
          aria-labelledby={`${id}-label ${id}-value`}
          aria-haspopup="dialog"
          aria-invalid={error ? true : undefined}
          disabled={disabled}
          onClick={onOpen}
        >
          <Icon name="layers" className="field__icon" />
          <span id={`${id}-value`} className={parent ? 'parent-field__value' : 'parent-field__value parent-field__value--empty'}>
            {parent ? `${parent.code} · ${parent.name} (Cấp ${parent.level})` : 'Không chọn – khu vực Cấp 1 độc lập'}
          </span>
        </button>
        {parent && !disabled && (
          <button type="button" className="field__trailing" aria-label="Bỏ chọn khu vực cấp cha" onClick={onClear}>
            <Icon name="x" size={16} />
          </button>
        )}
        <Icon name="chevron" className="select-box__chevron" />
      </div>
      {error ? (
        <p className="field__error">{error}</p>
      ) : (
        <p className={highlighted && parent ? 'field__hint parent-field__hint--accent' : 'field__hint'}>{hint}</p>
      )}
    </div>
  );
}
