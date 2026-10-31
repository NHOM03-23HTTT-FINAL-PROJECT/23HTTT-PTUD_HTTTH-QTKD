import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '@/components/icon/Icon';
import { ChangedTag } from './InputField';
import './InputField.css';
import './SelectField.css';

export type SelectOption = { value: string; label: string };

type BaseProps = {
  label: string;
  required?: boolean;
  options: SelectOption[];
  placeholder: string;
  error?: string;
  disabled?: boolean;
  /** Khác bản đang lưu (form cập nhật). */
  changed?: boolean;
};

type SelectFieldProps = BaseProps & {
  value: string;
  onChange: (value: string) => void;
};

/** Select theo frame 01.1 "Select/Nhóm khách hàng": dùng `<select>` gốc, cùng khung với Field 9:1003. */
export function SelectField({ label, required, options, placeholder, error, disabled, changed, value, onChange }: SelectFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const boxClass = ['field__box', 'select-box', changed && 'field__box--changed', error && 'field__box--error', disabled && 'field__box--disabled']
    .filter(Boolean)
    .join(' ');

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {required && <span className="field__required">*</span>}
        {changed && <ChangedTag />}
      </label>
      <div className={boxClass}>
        <select
          id={id}
          className={value ? 'select-box__control' : 'select-box__control select-box__control--empty'}
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon name="chevron" className="select-box__chevron" />
      </div>
      {error && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}

type MultiSelectFieldProps = BaseProps & {
  value: string[];
  onChange: (value: string[]) => void;
};

/**
 * MultiSelect theo frame 01.1/01.2 "MultiSelect/Nhóm dịch vụ quan tâm": giá trị đã chọn hiển thị dạng chip có nút ×,
 * danh sách lựa chọn mở dưới ô. Esc hoặc bấm ra ngoài để đóng.
 */
export function MultiSelectField({
  label,
  required,
  options,
  placeholder,
  error,
  disabled,
  changed,
  value,
  onChange,
}: MultiSelectFieldProps) {
  const id = useId();
  const listId = `${id}-list`;
  const errorId = `${id}-error`;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = options.filter((option) => value.includes(option.value));

  function toggle(optionValue: string) {
    onChange(value.includes(optionValue) ? value.filter((v) => v !== optionValue) : [...value, optionValue]);
  }

  const boxClass = [
    'field__box',
    'multi-select__box',
    changed && 'field__box--changed',
    error && 'field__box--error',
    disabled && 'field__box--disabled',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={rootRef} className="field multi-select">
      <span className="field__label" id={`${id}-label`}>
        {label}
        {required && <span className="field__required">*</span>}
        {changed && <ChangedTag />}
      </span>
      <div className={boxClass} onClick={() => !disabled && setOpen(true)}>
        {selected.length > 0 && (
          <ul className="multi-select__chips" role="list" aria-label={`${label} đã chọn`}>
            {selected.map((option) => (
              <li key={option.value} className="multi-select__chip">
                {option.label}
                <button
                  type="button"
                  className="multi-select__remove"
                  aria-label={`Bỏ chọn ${option.label}`}
                  disabled={disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(option.value);
                  }}
                >
                  <Icon name="x" size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          ref={toggleRef}
          type="button"
          className="multi-select__toggle"
          aria-labelledby={`${id}-label`}
          aria-expanded={open}
          aria-controls={listId}
          aria-describedby={error ? errorId : undefined}
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((current) => !current);
          }}
        >
          {selected.length === 0 && <span className="multi-select__placeholder">{placeholder}</span>}
          <Icon name="chevron" className="select-box__chevron" />
        </button>
      </div>
      {open && (
        <div id={listId} className="multi-select__list" role="group" aria-labelledby={`${id}-label`}>
          {options.map((option) => (
            <label key={option.value} className="multi-select__option">
              <input type="checkbox" checked={value.includes(option.value)} onChange={() => toggle(option.value)} />
              {option.label}
            </label>
          ))}
        </div>
      )}
      {error && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}
