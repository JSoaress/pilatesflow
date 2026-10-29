'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Send, PhoneCall } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/input';
import { sendMessageAction } from '@/lib/actions/communication';
import { addCrmInteraction } from '@/lib/actions/patients';

export function SendMessageButton({ patientId, leadId, templates }: { patientId?: string; leadId?: string; templates: { id: string; key: string; channel: string; name: string; body: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState({ channel: 'whatsapp', template_key: 'custom', body: '' });
  const [pending, setPending] = React.useState(false);
  const tpls = templates.filter((t) => t.channel === v.channel);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Send /> Enviar mensagem</Button>
      <Dialog open={open} onOpenChange={setOpen} title="Enviar mensagem" description="Envio pelos canais oficiais configurados. O histórico registra data, destinatário, modelo, status e erro."
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button loading={pending} onClick={async () => {
          setPending(true);
          const r = await sendMessageAction({ patient_id: patientId ?? null, lead_id: leadId ?? null, channel: v.channel as any, template_key: v.template_key, body: v.body });
          setPending(false);
          if (!r.ok) { toast.error(r.error); return; }
          (r.data?.sent ? toast.success : toast.warning)(r.data?.message ?? 'Registrada.');
          setOpen(false);
          router.refresh();
        }}>Enviar</Button></>}>
        <div className="space-y-4">
          <Field label="Canal" htmlFor="msg-ch"><Select id="msg-ch" value={v.channel} onChange={(e) => setV({ ...v, channel: e.target.value, template_key: 'custom' })}><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="sms">SMS</option></Select></Field>
          <Field label="Modelo" htmlFor="msg-tpl"><Select id="msg-tpl" value={v.template_key} onChange={(e) => { const t = tpls.find((x) => x.key === e.target.value); setV({ ...v, template_key: e.target.value, body: t?.body ?? v.body }); }}>
            <option value="custom">Mensagem personalizada</option>{tpls.map((t) => <option key={t.id} value={t.key}>{t.name}</option>)}</Select></Field>
          <Field label="Mensagem" htmlFor="msg-body" hint="Variáveis como {{nome}} e {{clinica}} são preenchidas automaticamente."><Textarea id="msg-body" rows={6} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} /></Field>
        </div>
      </Dialog>
    </>
  );
}

export function InteractionButton({ patientId, leadId }: { patientId?: string; leadId?: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState({ channel: 'whatsapp', summary: '' });
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><PhoneCall /> Registrar contato</Button>
      <Dialog open={open} onOpenChange={setOpen} size="sm" title="Registrar contato"
        footer={<Button onClick={async () => {
          const r = await addCrmInteraction({ patient_id: patientId, lead_id: leadId, channel: v.channel, summary: v.summary });
          if (r.ok) { toast.success('Contato registrado.'); setOpen(false); setV({ ...v, summary: '' }); router.refresh(); } else toast.error(r.error);
        }}>Salvar</Button>}>
        <div className="space-y-4">
          <Field label="Canal" htmlFor="int-ch"><Select id="int-ch" value={v.channel} onChange={(e) => setV({ ...v, channel: e.target.value })}>
            {[['whatsapp', 'WhatsApp'], ['call', 'Ligação'], ['in_person', 'Presencial'], ['email', 'E-mail'], ['instagram', 'Instagram'], ['other', 'Outro']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Resumo" htmlFor="int-sum" required><Textarea id="int-sum" rows={4} value={v.summary} onChange={(e) => setV({ ...v, summary: e.target.value })} /></Field>
        </div>
      </Dialog>
    </>
  );
}
