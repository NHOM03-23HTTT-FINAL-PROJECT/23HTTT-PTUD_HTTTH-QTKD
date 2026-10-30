import { useEffect, useState } from 'react';

/**
 * Thời điểm hiện tại, cập nhật mỗi `intervalMs`; truyền null để dừng cập nhật.
 * Đổi `syncKey` (ví dụ khi vừa nhận mốc hết hạn mới) để đồng bộ lại ngay, tránh đếm ngược lệch một nhịp.
 */
export function useNow(intervalMs: number | null, syncKey?: unknown): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (intervalMs === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, syncKey]);

  return now;
}
