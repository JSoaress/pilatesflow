'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Download, Trash2, FilePlus2, Send, FileDown, Archive, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Menu, MenuItem, MenuLink } from '@/components/ui/menu';
import { useConfirm } from '@/components/ui/confirm';
import { uploadAttachment, archiveAttachment, generateDocument, setDocumentStatus } from '@/lib/actions/clinical';
import { attachmentCategory } from '@/lib/labels';

export function UploadAttachmentButton({ patientId, allowClinical }: { patientId: string; allowClinical: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const clinical = ['exam', 'medical_report', 'prescription', 'certificate'];
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Upload /> Anexar arquivo</Button>
      <Dialog open={open} onOpenChange={setOpen} title="Anexar arquivo" description="PDF, JPG ou PNG até 20 MB. Armazenamento privado.">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setPending(true);
          const r = await uploadAttachment(patientId, fd);
          setPending(false);
          if (!r.ok) { toast.error(r.error); return; }
          toast.success('Arquivo anexado.');
          setOpen(false);
          router.refresh();
        }}>
          <Field label="Arquivo" htmlFor="att-file" required><Input id="att-file" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required /></Field>
          <Field label="Categoria" htmlFor="att-cat"><Select id="att-cat" name="category" defaultValue="document">{Object.entries(attachmentCategory).filter(([k]) => k !== 'exam' && k !== 'medical_report' && (allowClinical || !clinical.includes(k))).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Título" htmlFor="att-title"><Input id="att-title" name="title" placeholder="Ex.: Ressonância lombar 2025" /></Field>
          <Field label="Descrição" htmlFor="att-desc"><Textarea id="att-desc" name="description" rows={2} /></Field>
          <Button type="submit" loading={pending}>Enviar</Button>
        </form>
      </Dialog>
    </>
  );
}

export function AttachmentActions({ id, patientId, canDelete }: { id: string; patientId: string; canDelete: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  return (
    <div className="flex justify-end gap-1">
      <a href={`/api/files/attachment/${id}`} target="_blank" rel="noopener noreferrer"><Button variant="ghost" size="icon-sm" aria-label="Abrir arquivo"><Download /></Button></a>
      {canDelete && <Button variant="ghost" size="icon-sm" aria-label="Arquivar" onClick={async () => {
        const { confirmed } = await confirm({ title: 'Arquivar arquivo?', description: 'O arquivo deixa de aparecer, mas permanece guardado para fins de histórico e obrigações legais.', destructive: true, confirmLabel: 'Arquivar' });
        if (!confirmed) return;
        const r = await archiveAttachment(id, patientId);
        if (r.ok) { toast.success('Arquivo arquivado.'); router.refresh(); } else toast.error(r.error);
      }}><Trash2 className="text-destructive" /></Button>}
    </div>
  );
}

export function GenerateDocumentButton({ patientId, templates }: { patientId: string; templates: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [tpl, setTpl] = React.useState(templates[0]?.id ?? '');
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><FilePlus2 /> Gerar documento</Button>
      <Dialog open={open} onOpenChange={setOpen} size="sm" title="Gerar documento a partir de modelo"
        footer={<Button onClick={async () => { const r = await generateDocument(tpl, patientId); if (r.ok) { toast.success('Documento gerado (rascunho).'); setOpen(false); router.refresh(); } else toast.error(r.error); }}>Gerar</Button>}>
        <Field label="Modelo" htmlFor="doc-tpl"><Select id="doc-tpl" value={tpl} onChange={(e) => setTpl(e.target.value)}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
      </Dialog>
    </>
  );
}

export function DocumentActions({ id, status, canEdit }: { id: string; status: string; canEdit: boolean }) {
  const router = useRouter();
  return (
    <Menu trigger={(p) => <Button variant="ghost" size="icon-sm" aria-label="Ações do documento" {...p}><MoreHorizontal /></Button>}>
      {(close) => (
        <>
          <MenuLink href={`/api/documents/${id}/pdf`} onClick={close}><FileDown /> Baixar PDF</MenuLink>
          {canEdit && status === 'draft' && <MenuItem onClick={async () => { close(); const r = await setDocumentStatus(id, 'sent'); if (r.ok) { toast.success('Enviado ao portal do aluno para assinatura.'); router.refresh(); } else toast.error(r.error); }}><Send /> Enviar ao aluno</MenuItem>}
          {canEdit && status !== 'archived' && <MenuItem onClick={async () => { close(); const r = await setDocumentStatus(id, 'archived'); if (r.ok) router.refresh(); else toast.error(r.error); }}><Archive /> Arquivar</MenuItem>}
        </>
      )}
    </Menu>
  );
}
