import { useId, type TextareaHTMLAttributes } from 'react';
import './InputField.css';

type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
  label: string;
  required?: boolean;
  error?: string;
};

/** TextArea theo component Figma 9:1011 – ô nhiều dòng cao 88px, cùng nhãn/lỗi với Field. */
export function TextAreaField({ label, required, error, disabled, ...textareaProps }: TextAreaFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const boxClass = ['field__box', 'field__box--multiline', error && 'field__box--error', disabled && 'field__box--disabled']
    .filter(Boolean)
    .join(' ');

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {required && <span className="field__required">*</span>}
      </label>
      <div className={boxClass}>
        <textarea
          id={id}
          className="field__input field__textarea"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...textareaProps}
        />
      </div>
      {error && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}
