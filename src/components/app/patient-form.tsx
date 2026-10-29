'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { maskCPF, maskPhone } from '@/lib/utils';
import * as L from '@/lib/labels';
import { createPatient, updatePatient } from '@/lib/actions/patients';

type Opt = { value: string; label: string };
const UF = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

/** Formulário completo de aluno/paciente (dados pessoais, contato, endereço, emergência e administrativo). */
export function PatientForm({ patient, units, onDone }: { patient?: Record<string, any> | null; units: Opt[]; onDone?: (id: string) => void }) {
  const router = useRouter();
  const [v, setV] = React.useState<Record<string, any>>(() => ({
    full_name: '', social_name: '', birth_date: '', cpf: '', rg: '', gender: '', profession: '', phone: '', whatsapp: '', email: '',
    address_zip: '', address_street: '', address_number: '', address_complement: '', address_district: '', address_city: '', address_state: '',
    unit_id: units[0]?.value ?? '', origin: '', referred_by_name: '', status: 'active', notes: '', checkin_pin: '',
    emergency_name: '', emergency_relationship: '', emergency_phone: '',
    ...Object.fromEntries(Object.entries(patient ?? {}).map(([k, x]) => [k, x ?? ''])),
  }));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const [cepLoading, setCepLoading] = React.useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((o) => ({ ...o, [k]: e.target.value }));
  const editing = !!patient?.id;

  const lookupCep = async () => {
    const cep = String(v.address_zip).replace(/\D/g, '');
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const j = await r.json();
      if (!j.erro) setV((o) => ({ ...o, address_street: j.logradouro || o.address_street, address_district: j.bairro || o.address_district, address_city: j.localidade || o.address_city, address_state: j.uf || o.address_state }));
    } catch { /* consulta opcional */ } finally { setCepLoading(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const res = editing ? await updatePatient(patient!.id, v) : await createPatient(v);
    setPending(false);
    if (!res.ok) { setErrors(res.fieldErrors ?? {}); toast.error(res.error); return; }
    toast.success(editing ? 'Cadastro atualizado.' : 'Aluno cadastrado.');
    const id = (res.data as { id: string }).id;
    if (onDone) onDone(id); else router.push(`/app/alunos/${id}`);
    router.refresh();
  };

  const F = (name: string, label: string, el: React.ReactNode, opts?: { required?: boolean; className?: string; hint?: string }) => (
    <Field label={label} htmlFor={name} error={errors[name]} required={opts?.required} className={opts?.className} hint={opts?.hint}>{el}</Field>
  );

  return (
    <form onSubmit={submit} className="space-y-8">
      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-3 text-sm font-semibold text-muted-foreground">Dados pessoais</legend>
        {F('full_name', 'Nome completo', <Input id="full_name" value={v.full_name} onChange={set('full_name')} required aria-invalid={!!errors.full_name} />, { required: true, className: 'lg:col-span-2' })}
        {F('social_name', 'Nome social', <Input id="social_name" value={v.social_name} onChange={set('social_name')} />)}
        {F('birth_date', 'Data de nascimento', <Input id="birth_date" type="date" value={v.birth_date} onChange={set('birth_date')} />)}
        {F('cpf', 'CPF', <Input id="cpf" inputMode="numeric" value={v.cpf} onChange={(e) => setV((o) => ({ ...o, cpf: maskCPF(e.target.value) }))} />)}
        {F('rg', 'RG', <Input id="rg" value={v.rg} onChange={set('rg')} />)}
        {F('gender', 'Sexo', <Select id="gender" value={v.gender} onChange={set('gender')}><option value="">—</option>{Object.entries(L.gender).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>)}
        {F('profession', 'Profissão', <Input id="profession" value={v.profession} onChange={set('profession')} />)}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-3 text-sm font-semibold text-muted-foreground">Contato</legend>
        {F('phone', 'Telefone', <Input id="phone" type="tel" value={v.phone} onChange={(e) => setV((o) => ({ ...o, phone: maskPhone(e.target.value) }))} />)}
        {F('whatsapp', 'WhatsApp', <Input id="whatsapp" type="tel" value={v.whatsapp} onChange={(e) => setV((o) => ({ ...o, whatsapp: maskPhone(e.target.value) }))} />)}
        {F('email', 'E-mail', <Input id="email" type="email" value={v.email} onChange={set('email')} />, { hint: 'Necessário para acesso ao portal.' })}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-3 text-sm font-semibold text-muted-foreground">Endereço</legend>
        {F('address_zip', 'CEP', <Input id="address_zip" value={v.address_zip} onChange={set('address_zip')} onBlur={lookupCep} placeholder="00000-000" />, { hint: cepLoading ? 'Buscando endereço…' : undefined })}
        {F('address_street', 'Logradouro', <Input id="address_street" value={v.address_street} onChange={set('address_street')} />, { className: 'lg:col-span-2' })}
        {F('address_number', 'Número', <Input id="address_number" value={v.address_number} onChange={set('address_number')} />)}
        {F('address_complement', 'Complemento', <Input id="address_complement" value={v.address_complement} onChange={set('address_complement')} />)}
        {F('address_district', 'Bairro', <Input id="address_district" value={v.address_district} onChange={set('address_district')} />)}
        {F('address_city', 'Cidade', <Input id="address_city" value={v.address_city} onChange={set('address_city')} />)}
        {F('address_state', 'UF', <Select id="address_state" value={v.address_state} onChange={set('address_state')}><option value="">—</option>{UF.map((u) => <option key={u}>{u}</option>)}</Select>)}
      </fieldset>

      {!editing && (
        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-3 text-sm font-semibold text-muted-foreground">Contato de emergência</legend>
          {F('emergency_name', 'Nome', <Input id="emergency_name" value={v.emergency_name} onChange={set('emergency_name')} />)}
          {F('emergency_relationship', 'Parentesco', <Input id="emergency_relationship" value={v.emergency_relationship} onChange={set('emergency_relationship')} />)}
          {F('emergency_phone', 'Telefone', <Input id="emergency_phone" type="tel" value={v.emergency_phone} onChange={(e) => setV((o) => ({ ...o, emergency_phone: maskPhone(e.target.value) }))} />)}
        </fieldset>
      )}

      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-3 text-sm font-semibold text-muted-foreground">Informações administrativas</legend>
        {F('unit_id', 'Unidade', <Select id="unit_id" value={v.unit_id} onChange={set('unit_id')}>{units.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}</Select>)}
        {F('status', 'Status', <Select id="status" value={v.status} onChange={set('status')}>{Object.entries(L.patientStatus).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>)}
        {F('origin', 'Origem', <Select id="origin" value={v.origin} onChange={set('origin')}><option value="">—</option>{Object.entries(L.origin).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>)}
        {F('referred_by_name', 'Indicado por', <Input id="referred_by_name" value={v.referred_by_name} onChange={set('referred_by_name')} />)}
        {F('checkin_pin', 'PIN de check-in', <Input id="checkin_pin" inputMode="numeric" maxLength={6} value={v.checkin_pin} onChange={set('checkin_pin')} />, { hint: '4 a 6 números.' })}
        {F('notes', 'Observações administrativas', <Textarea id="notes" value={v.notes} onChange={set('notes')} />, { className: 'sm:col-span-2 lg:col-span-3', hint: 'Não registre informações clínicas aqui — use o prontuário.' })}
      </fieldset>

      <div className="flex gap-2">
        <Button type="submit" loading={pending}>{editing ? 'Salvar alterações' : 'Cadastrar aluno'}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
      </div>
    </form>
  );
}
