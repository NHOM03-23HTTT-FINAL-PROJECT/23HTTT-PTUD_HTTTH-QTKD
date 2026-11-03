import { useId, useRef, useState, type ChangeEvent } from 'react';
import { Icon } from '@/components/icon/Icon';
import '@/components/form/InputField.css';
import '@/components/file-upload/FileUploadField.css';

export type UploadedFile = { name: string; size: number; id?: string; file?: File; downloadUrl?: string };

type FileUploadFieldProps = {
  label: string;
  required?: boolean;
  files: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  error?: string;
  disabled?: boolean;
  buttonLabel?: string;
  accept?: string;
  multiple?: boolean;
  onDownload?: (file: UploadedFile) => void | Promise<void>;
};

export function formatFileSize(size: number): string {
  return size >= 1024 * 1024
    ? `${(size / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
    : `${Math.max(1, Math.round(size / 1024))} KB`;
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
  multiple = true,
  onDownload,
}: FileUploadFieldProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [downloadError, setDownloadError] = useState(false);

  function handleSelect(event: ChangeEvent<HTMLInputElement>) {
    const selected = [...(event.target.files ?? [])].map((file) => ({
      name: file.name,
      size: file.size,
      file,
    }));
    const names = new Set(files.map((f) => f.name));
    onChange([...files, ...selected.filter((f) => !names.has(f.name))]);
    // Cho phép chọn lại cùng tệp sau khi đã bỏ.
    event.target.value = '';
  }

  return (
    <div
      className="field"
      role="group"
      aria-labelledby={`${id}-label`}
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <span id={`${id}-label`} className="field__label">
        {label}
        {required && <span className="field__required">*</span>}
      </span>
      {files.length > 0 && (
        <ul className="file-list">
          {files.map((file) => (
            <li key={file.name} className="file-list__item">
              <Icon name="file" className="file-list__icon" />
              {onDownload && file.id ? (
                <button
                  type="button"
                  className="file-list__name"
                  onClick={() => {
                    setDownloadError(false);
                    void Promise.resolve(onDownload(file)).catch(() => setDownloadError(true));
                  }}
                >
                  {file.name}
                </button>
              ) : (
                <span className="file-list__name">{file.name}</span>
              )}
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
        <button
          type="button"
          className="file-upload__button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {buttonLabel}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept={accept}
          className="visually-hidden"
          tabIndex={-1}
          onChange={handleSelect}
        />
      </div>
      {downloadError && (
        <p role="alert" className="field__error">
          Chưa tải được tệp. Kiểm tra kết nối hoặc tải lại hồ sơ.
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}
