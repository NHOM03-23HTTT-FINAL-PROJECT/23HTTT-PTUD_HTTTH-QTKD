/** Mô tả ngắn trình duyệt + hệ điều hành, ví dụ "Chrome trên Windows". */
export function describeClient(userAgent: string = navigator.userAgent): string {
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Trình duyệt';

  const os = /iPad/.test(userAgent)
    ? 'iPad'
    : /iPhone/.test(userAgent)
      ? 'iPhone'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Mac OS X/.test(userAgent)
            ? 'macOS'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : 'thiết bị không xác định';

  return `${browser} trên ${os}`;
}
