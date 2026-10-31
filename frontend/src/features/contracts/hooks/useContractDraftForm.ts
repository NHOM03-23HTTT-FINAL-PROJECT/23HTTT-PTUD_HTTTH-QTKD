import { useMemo, useState } from 'react';
import type { ContractDraft, ContractFieldErrors, ContractServiceItem } from '../types/contract';
import { validateContractDraft } from '../utils/contractValidation';
import { contractsApi } from '../api/contractsApi';

export function newId() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/**
 * Trạng thái và thao tác của biểu mẫu hợp đồng dùng chung cho SYS-CTR-01 (tạo) và SYS-CTR-03 (chỉnh sửa):
 * chọn mẫu, đổi cách lập, thêm/sửa hạng mục và gộp lỗi phía máy khách với lỗi BE trả về.
 */
export function useContractDraftForm(initial: ContractDraft) {
  const options = useMemo(() => contractsApi.getFormOptions(), []);
  const [values, setValues] = useState<ContractDraft>(initial);
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<ContractFieldErrors>({});

  const clientErrors = attempted ? validateContractDraft(values) : {};
  const errors: ContractFieldErrors = {
    ...clientErrors,
    ...serverErrors,
    serviceAreas: { ...clientErrors.serviceAreas, ...serverErrors.serviceAreas },
  };

  function setField<K extends keyof ContractDraft>(field: K, value: ContractDraft[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setServerErrors((current) => ({ ...current, [field]: undefined }));
  }

  function chooseTemplate(code: string) {
    const template = options.templates.find((item) => item.code === code);
    if (!template) {
      setField('templateCode', '');
      return;
    }
    setValues((current) => ({
      ...current,
      sourceMode: 'template',
      templateCode: template.code,
      title: template.title,
      contractType: template.contractType,
      paymentTerm: template.paymentTerm,
      content: template.content,
      services: template.services.map((service, index) => ({ ...service, id: `${template.code}-${index}`, areaCode: '' })),
    }));
    setServerErrors({});
  }

  function changeSourceMode(sourceMode: ContractDraft['sourceMode']) {
    if (sourceMode === values.sourceMode) return;
    if (sourceMode === 'blank') {
      setValues((current) => ({ ...current, sourceMode, templateCode: '', title: '', contractType: '', paymentTerm: '', services: [], content: '' }));
    } else setValues((current) => ({ ...current, sourceMode }));
    setServerErrors({});
  }

  function addService() {
    const unused = options.services.find((option) => !values.services.some((item) => item.serviceCode === option.serviceCode));
    const service = unused ?? options.services[0];
    if (!service) return;
    setField('services', [...values.services, { ...service, id: newId(), areaCode: '' }]);
  }

  function updateService(id: string, patch: Partial<ContractServiceItem>) {
    setField('services', values.services.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setServerErrors((current) => ({
      ...current,
      serviceAreas: Object.fromEntries(Object.entries(current.serviceAreas ?? {}).filter(([key]) => key !== id)),
    }));
  }

  function chooseService(id: string, code: string) {
    const service = options.services.find((item) => item.serviceCode === code);
    if (service) updateService(id, { ...service, areaCode: '' });
  }

  function removeService(id: string) {
    setField('services', values.services.filter((item) => item.id !== id));
  }

  return {
    options,
    values,
    setValues,
    errors,
    attempted,
    setAttempted,
    setServerErrors,
    setField,
    chooseTemplate,
    changeSourceMode,
    addService,
    updateService,
    chooseService,
    removeService,
  };
}

export type ContractDraftForm = ReturnType<typeof useContractDraftForm>;
