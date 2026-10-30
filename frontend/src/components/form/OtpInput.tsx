import { forwardRef, useImperativeHandle, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import './OtpInput.css';

export type OtpInputHandle = { focus: () => void };

type OtpInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
};

/** Ô nhập mã xác thực tách từng chữ số (frame 02.3): tự chuyển ô, hỗ trợ dán cả mã. */
export const OtpInput = forwardRef<OtpInputHandle, OtpInputProps>(function OtpInput(
  { label, value, onChange, length = 6, disabled },
  ref,
) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  useImperativeHandle(ref, () => ({
    focus: () => inputs.current[Math.min(value.length, length - 1)]?.focus(),
  }));

  function setDigits(next: string[], focusIndex: number) {
    onChange(next.join('').slice(0, length));
    inputs.current[Math.max(0, Math.min(focusIndex, length - 1))]?.focus();
  }

  function handleInput(index: number, raw: string) {
    const typed = raw.replace(/\D/g, '');
    if (!typed) return;
    const next = [...digits];
    // Gõ đè hoặc gõ nhanh nhiều số: điền lần lượt từ ô hiện tại.
    typed.split('').forEach((digit, offset) => {
      if (index + offset < length) next[index + offset] = digit;
    });
    setDigits(next, index + typed.length);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const next = [...digits];
      if (next[index]) {
        next[index] = '';
        setDigits(next, index);
      } else if (index > 0) {
        next[index - 1] = '';
        setDigits(next, index - 1);
      }
    } else if (event.key === 'ArrowLeft') {
      inputs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowRight') {
      inputs.current[index + 1]?.focus();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    setDigits(pasted.split(''), pasted.length);
  }

  return (
    <fieldset className="otp" disabled={disabled}>
      <legend className="otp__label">{label}</legend>
      <div className="otp__boxes">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputs.current[index] = el;
            }}
            className="otp__digit"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={length}
            aria-label={`Chữ số ${index + 1}`}
            value={digit}
            onChange={(e) => handleInput(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.target.select()}
          />
        ))}
      </div>
    </fieldset>
  );
});
