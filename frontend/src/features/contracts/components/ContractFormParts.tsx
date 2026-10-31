import { useState, type ReactNode } from 'react';
import { Button } from '@/components/button/Button';
import { InputField } from '@/components/form/InputField';
import { SelectField } from '@/components/form/SelectField';
import { Icon } from '@/components/icon/Icon';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import type { Customer } from '@/features/customers/types/customer';
import type { ContractDraftForm } from '../hooks/useContractDraftForm';
import type { ContractServiceItem } from '../types/contract';
import { formatContractValueInput } from '../utils/contractValidation';

export function ContractSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="contract-section"><div className="contract-section__heading"><h2>{title}</h2>{description && <p>{description}</p>}</div>{children}</section>;
}

function SourceCard({ checked, title, description, onClick }: { checked: boolean; title: string; description: string; onClick: () => void }) {
  return <button type="button" role="radio" aria-checked={checked} className={checked ? 'contract-source-card contract-source-card--selected' : 'contract-source-card'} onClick={onClick}><span className="contract-radio" /><span><strong>{title}</strong><small>{description}</small></span></button>;
}

function CustomerPicker({ customers, value, error, disabled, onChange }: { customers: Customer[]; value: string; error?: string; disabled?: boolean; onChange: (value: string) => void }) {
  const [keyword, setKeyword] = useState('');
  const [open, setOpen] = useState(false);
  const selected = customers.find((customer) => customer.code === value);
  const normalized = keyword.toLocaleLowerCase('vi');
  const filtered = customers.filter((customer) => `${customer.code} ${customer.name} ${customer.taxCode}`.toLocaleLowerCase('vi').includes(normalized)).slice(0, 8);
  return <div className="field contract-customer-picker"><label className="field__label" htmlFor="contract-customer">Khách hàng<span className="field__required">*</span></label><div className={error ? 'field__box field__box--error' : 'field__box'}><Icon name="search" className="field__icon" /><input id="contract-customer" className="field__input" value={open ? keyword : selected ? `${selected.code} · ${selected.name}` : keyword} disabled={disabled} aria-invalid={error ? true : undefined} placeholder="Tìm theo mã, tên hoặc mã số thuế" onFocus={() => { setKeyword(''); setOpen(true); }} onChange={(event) => { setKeyword(event.target.value); setOpen(true); }} /></div>{open && <div className="contract-customer-options">{filtered.length ? filtered.map((customer) => <button type="button" key={customer.code} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(customer.code); setOpen(false); setKeyword(''); }}><span><strong>{customer.name}</strong><small>{customer.code} · MST {customer.taxCode}</small></span><StatusBadge label="Hoạt động" tone="success" /></button>) : <p>Không tìm thấy khách hàng đang Hoạt động.</p>}</div>}{error && <p className="field__error">{error}</p>}</div>;
}

export function CustomerSnapshot({ customer, fallback }: { customer?: Customer; fallback?: string }) {
  if (!customer) return fallback ? <div className="contract-customer-snapshot"><strong>{fallback}</strong></div> : null;
  return <div className="contract-customer-snapshot"><div><span>Tên khách hàng</span><strong>{customer.name}</strong></div><div><span>Mã số thuế</span><strong>{customer.taxCode}</strong></div><div className="contract-span-2"><span>Địa chỉ</span><strong>{customer.address}</strong></div><div><span>Người đại diện</span><strong>{customer.representative}</strong></div><div><span>Liên hệ</span><strong>{customer.contactName || customer.email || customer.phone || '—'}</strong></div></div>;
}

function ServiceTable({ items, serviceOptions, areaOptions, errors, disabled, onChoose, onUpdate, onRemove }: { items: ContractServiceItem[]; serviceOptions: Omit<ContractServiceItem, 'id' | 'areaCode'>[]; areaOptions: { code: string; name: string }[]; errors?: Record<string, string>; disabled?: boolean; onChoose: (id: string, code: string) => void; onUpdate: (id: string, patch: Partial<ContractServiceItem>) => void; onRemove: (id: string) => void }) {
  if (!items.length) return <div className="contract-empty-services"><Icon name="list" /><p>Chưa có hạng mục dịch vụ.</p></div>;
  return <div className="contract-service-wrap"><table className="contract-service-table"><thead><tr><th>STT</th><th>Hạng mục dịch vụ</th><th>Gắn mặt bằng</th><th>Khu vực thực hiện</th><th><span className="visually-hidden">Thao tác</span></th></tr></thead><tbody>{items.map((item, index) => <tr key={item.id}><td>{index + 1}</td><td><select value={item.serviceCode} disabled={disabled} onChange={(event) => onChoose(item.id, event.target.value)}>{serviceOptions.map((service) => <option key={service.serviceCode} value={service.serviceCode}>{service.serviceName}</option>)}</select><small>{item.serviceCode} · Đơn vị: {item.unit}</small></td><td><label className="contract-switch"><input type="checkbox" checked={item.requiresArea} disabled={disabled} onChange={(event) => onUpdate(item.id, { requiresArea: event.target.checked, areaCode: '' })} /><span>{item.requiresArea ? 'Có' : 'Không'}</span></label></td><td><select value={item.areaCode} disabled={disabled || !item.requiresArea} aria-invalid={errors?.[item.id] ? true : undefined} onChange={(event) => onUpdate(item.id, { areaCode: event.target.value })}><option value="">{item.requiresArea ? 'Chọn khu vực' : 'Không áp dụng'}</option>{item.areaCode && !areaOptions.some((area) => area.code === item.areaCode) && <option value={item.areaCode}>{item.areaCode} · không còn Hoạt động</option>}{areaOptions.map((area) => <option key={area.code} value={area.code}>{area.code} · {area.name}</option>)}</select>{errors?.[item.id] && <small className="field__error">{errors[item.id]}</small>}</td><td><button type="button" className="contract-icon-button" disabled={disabled} aria-label={`Xóa ${item.serviceName}`} onClick={() => onRemove(item.id)}><Icon name="x" size={16} /></button></td></tr>)}</tbody></table></div>;
}

export function Summary({ label, value }: { label: string; value: ReactNode }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }

/** Các nhóm trường của hồ sơ hợp đồng (01.2 / 03.1): khách hàng, mẫu, thông tin chung, phạm vi dịch vụ, nội dung. */
export function ContractFormFields({ form, disabled }: { form: ContractDraftForm; disabled?: boolean }) {
  const { options, values, errors, setField } = form;
  const selectedCustomer = options.customers.find((customer) => customer.code === values.customerCode);
  const selectedTemplate = options.templates.find((template) => template.code === values.templateCode);
  return (
    <>
      <ContractSection title="Khách hàng" description="Chỉ chọn khách hàng đang ở trạng thái Hoạt động.">
        <CustomerPicker customers={options.customers} value={values.customerCode} error={errors.customerCode} disabled={disabled} onChange={(code) => setField('customerCode', code)} />
        {selectedCustomer && <CustomerSnapshot customer={selectedCustomer} />}
      </ContractSection>

      <hr className="contract-divider" />
      <ContractSection title="Mẫu hợp đồng" description="Dùng mẫu đã ban hành hoặc tự lập nội dung dự thảo mới.">
        <div className="contract-source-cards" role="radiogroup" aria-label="Cách lập hợp đồng">
          <SourceCard checked={values.sourceMode === 'template'} title="Dùng mẫu hợp đồng" description="Tải sẵn nội dung và điều khoản phổ biến." onClick={() => form.changeSourceMode('template')} />
          <SourceCard checked={values.sourceMode === 'blank'} title="Lập dự thảo mới" description="Tự nhập toàn bộ nội dung hợp đồng." onClick={() => form.changeSourceMode('blank')} />
        </div>
        {values.sourceMode === 'template' && (
          <div className="contract-grid">
            <SelectField
              label="Mẫu hợp đồng" required placeholder="Chọn mẫu hợp đồng"
              options={options.templates.map((item) => ({ value: item.code, label: `${item.code} · ${item.name}` }))}
              value={values.templateCode} error={errors.templateCode} disabled={disabled} onChange={form.chooseTemplate}
            />
            <InputField label="Phiên bản mẫu" value={selectedTemplate?.version ?? ''} placeholder="Tự hiển thị theo mẫu" disabled hint="Phiên bản đang có hiệu lực của mẫu đã chọn." />
          </div>
        )}
      </ContractSection>

      <hr className="contract-divider" />
      <ContractSection title="Thông tin chung">
        <InputField className="contract-span-2" label="Tên hợp đồng" required value={values.title} error={errors.title} disabled={disabled} placeholder="Nhập tên hợp đồng" onChange={(event) => setField('title', event.target.value)} />
        <div className="contract-grid">
          <InputField label="Loại hợp đồng" required list="contract-types" value={values.contractType} error={errors.contractType} disabled={disabled} placeholder="Chọn hoặc nhập loại hợp đồng" onChange={(event) => setField('contractType', event.target.value)} />
          <datalist id="contract-types">{options.contractTypes.map((type) => <option key={type} value={type} />)}</datalist>
          <div className="contract-date-grid">
            <InputField label="Bắt đầu hiệu lực" type="date" required value={values.effectiveFrom} error={errors.effectiveFrom} disabled={disabled} onChange={(event) => setField('effectiveFrom', event.target.value)} />
            <InputField label="Kết thúc hiệu lực" type="date" required value={values.effectiveTo} error={errors.effectiveTo} disabled={disabled} onChange={(event) => setField('effectiveTo', event.target.value)} />
          </div>
          <InputField label="Giá trị hợp đồng" required inputMode="numeric" value={values.value} error={errors.value} disabled={disabled} placeholder="0" trailing={<span className="field__suffix">₫</span>} onChange={(event) => setField('value', formatContractValueInput(event.target.value))} />
          <InputField label="Điều khoản thanh toán" required value={values.paymentTerm} error={errors.paymentTerm} disabled={disabled} placeholder="VD: Chuyển khoản trong 30 ngày" onChange={(event) => setField('paymentTerm', event.target.value)} />
        </div>
      </ContractSection>

      <hr className="contract-divider" />
      <ContractSection title="Phạm vi dịch vụ & khu vực thực hiện" description="Hạng mục có gắn mặt bằng bắt buộc chọn khu vực đang Hoạt động.">
        <ServiceTable
          items={values.services} serviceOptions={options.services} areaOptions={options.areas}
          errors={errors.serviceAreas} disabled={disabled}
          onChoose={form.chooseService} onUpdate={form.updateService} onRemove={form.removeService}
        />
        {errors.services && <p className="field__error">{errors.services}</p>}
        <Button variant="secondary" className="contract-add-service" disabled={disabled} onClick={form.addService}>+ Thêm hạng mục dịch vụ</Button>
      </ContractSection>

      <hr className="contract-divider" />
      <ContractSection title="Nội dung hợp đồng" description={values.sourceMode === 'template' ? 'Nội dung được nạp từ mẫu và có thể điều chỉnh trong bản nháp.' : 'Nhập nội dung dự thảo theo thỏa thuận với khách hàng.'}>
        <div className={errors.content ? 'contract-editor contract-editor--error' : 'contract-editor'}>
          <div className="contract-editor__toolbar" aria-hidden="true"><strong>B</strong><em>I</em><span>Danh sách</span><span>Căn lề</span></div>
          <div className="contract-editor__body">
            {values.sourceMode === 'template' && <nav className="contract-editor__clauses" aria-label="Điều khoản"><strong>Điều khoản</strong><span>1. Phạm vi dịch vụ</span><span>2. Giá trị & thanh toán</span><span>3. Hiệu lực</span></nav>}
            <textarea aria-label="Nội dung hợp đồng" aria-invalid={errors.content ? true : undefined} value={values.content} disabled={disabled} placeholder="Nhập nội dung hợp đồng…" onChange={(event) => setField('content', event.target.value)} />
          </div>
        </div>
        {errors.content && <p className="field__error">{errors.content}</p>}
      </ContractSection>
    </>
  );
}
