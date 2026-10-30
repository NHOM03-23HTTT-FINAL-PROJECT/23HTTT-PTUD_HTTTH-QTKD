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
  trailing?: ReactNode;
};

/** Field theo component Figma 9:1003 (Default, Focus, Disabled, Error). */
export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(function InputField(
  { label, required, icon, error, success, trailing, id, disabled, className, ...inputProps },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  const boxClass = ['field__box', error && 'field__box--error', disabled && 'field__box--disabled']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className ? `field ${className}` : 'field'}>
      <label className="field__label" htmlFor={inputId}>
        {label}
        {required && <span className="field__required">*</span>}
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
      ) : (
        success && <p className="field__success">{success}</p>
      )}
    </div>
  );
});
