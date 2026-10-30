const TIME_ZONE = 'Asia/Ho_Chi_Minh';

function parts(value: string | number | Date) {
  const formatter = new Intl.DateTimeFormat('vi-VN', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(value))) map[part.type] = part.value;
  return map;
}

/** Định dạng "27/10/2026 17:45" theo giờ Việt Nam. */
export function formatDateTime(value: string | number | Date): string {
  const p = parts(value);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** Định dạng "08:02 · 28/10/2026" (menu tài khoản). */
export function formatTimeDate(value: string | number | Date): string {
  const p = parts(value);
  return `${p.hour}:${p.minute} · ${p.day}/${p.month}/${p.year}`;
}

/** Định dạng đếm ngược "mm:ss". */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Chữ viết tắt cho avatar, ví dụ "Nguyễn Văn An" → "NA". */
export function initials(fullName: string): string {
  const words = fullName.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
