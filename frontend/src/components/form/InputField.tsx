import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icon/Icon';
import './InputField.css';

type InputFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label: string;
  required?: boolean;
  icon?: IconName;
  error?: string;
  /** Thông báo hợp lệ bên dưới ô nhập, ví dụ "Mật khẩu xác nhận đã khớp." */
  success?: string;
  /** Gợi ý dưới ô nhập khi không có lỗi, ví dụ lý do trường bị khóa. */
  hint?: string;
  /** Giá trị khác bản đang lưu (state "Changed" – form cập nhật): nền nhấn và nhãn "Đã sửa". */
  changed?: boolean;
  trailing?: ReactNode;
};

/** Field theo component Figma 9:1003 (Default, Focus, Disabled, Error, Changed). */
export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(function InputField(
  { label, required, icon, error, success, hint, changed, trailing, id, disabled, className, ...inputProps },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  const boxClass = [
    'field__box',
    changed && 'field__box--changed',
    error && 'field__box--error',
    disabled && 'field__box--disabled',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className ? `field ${className}` : 'field'}>
      <label className="field__label" htmlFor={inputId}>
        {label}
        {required && <span className="field__required">*</span>}
        {changed && <ChangedTag />}
      </label>
      <div className={boxClass}>
        {icon && <Icon name={icon} className="field__icon" />}
        <input
          ref={ref}
          id={inputId}
          className="field__input"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...inputProps}
        />
        {trailing}
      </div>
      {error ? (
        <p id={errorId} className="field__error">
          {error}
        </p>
      ) : success ? (
        <p className="field__success">{success}</p>
      ) : (
        hint && <p className="field__hint">{hint}</p>
      )}
    </div>
  );
});

/** Nhãn "Đã sửa" cạnh tên trường trên form cập nhật. */
export function ChangedTag() {
  return <span className="field__changed-tag">Đã sửa</span>;
}
