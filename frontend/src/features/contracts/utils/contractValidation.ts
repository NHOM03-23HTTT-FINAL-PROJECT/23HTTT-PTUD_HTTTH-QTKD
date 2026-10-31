import type { ContractDraft, ContractFieldErrors } from '../types/contract';

export const EMPTY_CONTRACT_DRAFT: ContractDraft = {
  customerCode: '',
  sourceMode: 'template',
  templateCode: '',
  title: '',
  contractType: '',
  effectiveFrom: '',
  effectiveTo: '',
  value: '',
  paymentTerm: '',
  services: [],
  content: '',
};

export function parseContractValue(value: string): number {
  return Number(value.replace(/[^\d]/g, ''));
}

export function formatContractValueInput(value: string): string {
  const digits = value.replace(/[^\d]/g, '');
  return digits ? Number(digits).toLocaleString('vi-VN') : '';
}

export function validateContractDraft(draft: ContractDraft): ContractFieldErrors {
  const errors: ContractFieldErrors = {};
  if (!draft.customerCode) errors.customerCode = 'Chọn khách hàng đang Hoạt động.';
  if (draft.sourceMode === 'template' && !draft.templateCode) errors.templateCode = 'Chọn mẫu hợp đồng.';
  if (!draft.title.trim()) errors.title = 'Nhập tên hợp đồng.';
  if (!draft.contractType.trim()) errors.contractType = 'Nhập loại hợp đồng.';
  if (!draft.effectiveFrom) errors.effectiveFrom = 'Chọn ngày bắt đầu hiệu lực.';
  if (!draft.effectiveTo) errors.effectiveTo = 'Chọn ngày kết thúc hiệu lực.';
  if (draft.effectiveFrom && draft.effectiveTo && draft.effectiveTo < draft.effectiveFrom) {
    errors.effectiveTo = 'Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.';
  }
  if (!draft.value.trim()) errors.value = 'Nhập giá trị hợp đồng.';
  else if (!Number.isFinite(parseContractValue(draft.value)) || parseContractValue(draft.value) <= 0) {
    errors.value = 'Giá trị hợp đồng phải là số dương.';
  }
  if (!draft.paymentTerm.trim()) errors.paymentTerm = 'Nhập điều khoản thanh toán.';
  if (draft.services.length === 0) errors.services = 'Thêm ít nhất một hạng mục dịch vụ.';
  const serviceAreas = Object.fromEntries(
    draft.services.filter((item) => item.requiresArea && !item.areaCode).map((item) => [item.id, 'Chọn khu vực đang Hoạt động.']),
  );
  if (Object.keys(serviceAreas).length > 0) errors.serviceAreas = serviceAreas;
  if (!draft.content.trim()) errors.content = 'Nhập nội dung hợp đồng.';
  return errors;
}

export function countContractErrors(errors: ContractFieldErrors): number {
  return Object.keys(errors).filter((key) => key !== 'serviceAreas').length + Object.keys(errors.serviceAreas ?? {}).length;
}

export function isContractDraftEmpty(draft: ContractDraft): boolean {
  return JSON.stringify(draft) === JSON.stringify(EMPTY_CONTRACT_DRAFT);
}
