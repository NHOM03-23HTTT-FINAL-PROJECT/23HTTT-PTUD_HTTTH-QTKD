import type { CatalogOption, CustomerChange, EditableCustomerField } from '../types/customer';

export type CustomerCatalogs = { customerGroups: CatalogOption[]; serviceGroups: CatalogOption[] };

export const EMPTY_VALUE = '(để trống)';

function labelOf(options: CatalogOption[], code: string) {
  return options.find((o) => o.code === code)?.label ?? code;
}

/** Giá trị hiển thị của một trường; rỗng trả về chuỗi rỗng để nơi gọi tự chọn cách hiển thị. */
export function formatFieldValue(
  field: EditableCustomerField | 'taxCode',
  value: string | string[],
  catalogs: CustomerCatalogs,
): string {
  if (field === 'serviceGroups') return (value as string[]).map((code) => labelOf(catalogs.serviceGroups, code)).join(', ');
  if (field === 'customerGroup') return value ? labelOf(catalogs.customerGroups, value as string) : '';
  return value as string;
}

/** Giá trị mới của một thay đổi; nhóm dịch vụ hiển thị phần thêm/bớt như "+ Khai thác cảng" (02.1). */
export function formatChangeAfter(change: CustomerChange, catalogs: CustomerCatalogs): string {
  if (change.field === 'serviceGroups') {
    const before = change.before as string[];
    const after = change.after as string[];
    const added = after.filter((c) => !before.includes(c)).map((c) => `+ ${labelOf(catalogs.serviceGroups, c)}`);
    const removed = before.filter((c) => !after.includes(c)).map((c) => `− ${labelOf(catalogs.serviceGroups, c)}`);
    return [...added, ...removed].join(', ') || EMPTY_VALUE;
  }
  return formatFieldValue(change.field, change.after, catalogs) || EMPTY_VALUE;
}

export function formatChangeBefore(change: CustomerChange, catalogs: CustomerCatalogs): string {
  return formatFieldValue(change.field, change.before, catalogs) || EMPTY_VALUE;
}

/** Rút gọn giá trị dài trong lịch sử, ví dụ "125 Nguyễn Văn Cừ…". */
export function truncate(text: string, max = 22): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}
