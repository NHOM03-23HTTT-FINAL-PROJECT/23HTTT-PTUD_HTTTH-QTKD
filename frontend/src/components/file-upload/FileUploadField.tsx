import { useId, useRef, type ChangeEvent } from 'react';
import { Icon } from '@/components/icon/Icon';
import '@/components/form/InputField.css';
import './FileUploadField.css';

export type UploadedFile = { name: string; size: number };

type FileUploadFieldProps = {
  label: string;
  required?: boolean;
  files: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  error?: string;
  disabled?: boolean;
  buttonLabel?: string;
  accept?: string;
};

export function formatFileSize(size: number): string {
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}

/**
 * Tệp căn cứ đính kèm (frame 03.1 / 04.1): danh sách tệp đã chọn có nút bỏ và nút "+ Tải tệp căn cứ".
 * Prototype chỉ giữ tên và dung lượng; khi có BE, tệp được tải lên kho lưu trữ trước khi gửi thao tác.
 */
export function FileUploadField({
  label,
  required,
  files,
  onChange,
  error,
  disabled,
  buttonLabel = '+ Tải tệp căn cứ',
  accept = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png',
}: FileUploadFieldProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSelect(event: ChangeEvent<HTMLInputElement>) {
    const selected = [...(event.target.files ?? [])].map((file) => ({ name: file.name, size: file.size }));
    const names = new Set(files.map((f) => f.name));
    onChange([...files, ...selected.filter((f) => !names.has(f.name))]);
    // Cho phép chọn lại cùng tệp sau khi đã bỏ.
    event.target.value = '';
  }

  return (
    <div className="field" role="group" aria-labelledby={`${id}-label`} aria-describedby={error ? `${id}-error` : undefined}>
      <span id={`${id}-label`} className="field__label">
        {label}
        {required && <span className="field__required">*</span>}
      </span>
      {files.length > 0 && (
        <ul className="file-list">
          {files.map((file) => (
            <li key={file.name} className="file-list__item">
              <Icon name="file" className="file-list__icon" />
              <span className="file-list__name">{file.name}</span>
              <span className="file-list__size">{formatFileSize(file.size)}</span>
              <button
                type="button"
                className="file-list__remove"
                aria-label={`Bỏ tệp ${file.name}`}
                disabled={disabled}
                onClick={() => onChange(files.filter((f) => f.name !== file.name))}
              >
                <Icon name="x" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <button type="button" className="file-upload__button" disabled={disabled} onClick={() => inputRef.current?.click()}>
          {buttonLabel}
        </button>
        <input ref={inputRef} type="file" multiple accept={accept} className="visually-hidden" tabIndex={-1} onChange={handleSelect} />
      </div>
      {error && (
        <p id={`${id}-error`} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}
