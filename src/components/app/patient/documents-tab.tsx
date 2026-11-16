import { getAppContext } from '@/lib/auth/context';
import { Section, Table, Th, Td, Tr, EmptyState } from '@/components/ui/misc';
import { Badge, statusVariant } from '@/components/ui/badge';
import { dateTime } from '@/lib/format';
import { label, attachmentCategory, documentType, documentStatus } from '@/lib/labels';
import { UploadAttachmentButton, AttachmentActions, GenerateDocumentButton, DocumentActions } from '@/components/app/clinical/document-actions';

export async function DocumentsTab({ patientId }: { patientId: string }) {
  const ctx = await getAppContext();
  const canClinical = ctx.can('medical_records.view') || ctx.can('assessments.view');
  const [atts, docs, templates] = await Promise.all([
    ctx.supabase.from('attachments').select('id, category, is_clinical, title, description, mime_type, size_bytes, created_at, uploaded_by, profiles:uploaded_by(full_name)')
      .eq('patient_id', patientId).not('category', 'in', '(exam,medical_report)').is('deleted_at', null).order('created_at', { ascending: false }),
    ctx.can('documents.view') ? ctx.supabase.from('documents').select('id, type, title, status, created_at, signed_at, signed_name, requires_signature').eq('patient_id', patientId).is('deleted_at', null).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    ctx.can('documents.create') ? ctx.supabase.from('document_templates').select('id, name, type').eq('organization_id', ctx.org.id).eq('is_active', true).order('name') : Promise.resolve({ data: [] }),
  ]);
  return (
    <div className="space-y-6">
      <Section title="Arquivos" description={<>{canClinical ? 'Atestados, prescrições, contratos e outros arquivos. ' : ''}Laudos e exames ficam na aba{' '}<a className="font-medium text-primary hover:underline" href={`/app/alunos/${patientId}?aba=laudos`}>Laudos e exames</a>, separados por área.</>}
        actions={(ctx.can('documents.create') || ctx.can('medical_records.create')) ? <UploadAttachmentButton patientId={patientId} allowClinical={ctx.can('medical_records.create') || ctx.can('assessments.create')} /> : undefined}>
        {(atts.data ?? []).length === 0 ? <EmptyState title="Nenhum arquivo" /> : (
          <Table>
            <thead><tr><Th>Arquivo</Th><Th>Categoria</Th><Th>Enviado por</Th><Th>Data</Th><Th /></tr></thead>
            <tbody>
              {((atts.data ?? []) as any[]).map((a) => (
                <Tr key={a.id}>
                  <Td><p className="font-medium">{a.title}</p>{a.description && <p className="text-xs text-muted-foreground">{a.description}</p>}</Td>
                  <Td>{label(attachmentCategory, a.category)}{a.is_clinical && <Badge variant="info" className="ml-2">clínico</Badge>}</Td>
                  <Td>{a.profiles?.full_name ?? '—'}</Td>
                  <Td className="whitespace-nowrap">{dateTime(a.created_at, ctx.tz)}</Td>
                  <Td className="text-right"><AttachmentActions id={a.id} patientId={patientId} canDelete={ctx.can('documents.delete')} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
      {ctx.can('documents.view') && (
        <Section title="Documentos e termos" actions={(templates.data ?? []).length ? <GenerateDocumentButton patientId={patientId} templates={(templates.data ?? []) as any[]} /> : undefined}>
          {(docs.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhum documento gerado.</p> : (
            <Table>
              <thead><tr><Th>Documento</Th><Th>Tipo</Th><Th>Status</Th><Th>Criado</Th><Th /></tr></thead>
              <tbody>
                {((docs.data ?? []) as any[]).map((d) => (
                  <Tr key={d.id}>
                    <Td>{d.title}{d.signed_at && <span className="block text-xs text-muted-foreground">Assinado por {d.signed_name} em {dateTime(d.signed_at, ctx.tz)}</span>}</Td>
                    <Td>{label(documentType, d.type)}</Td>
                    <Td><Badge variant={statusVariant[d.status] ?? 'neutral'}>{label(documentStatus, d.status)}</Badge></Td>
                    <Td className="whitespace-nowrap">{dateTime(d.created_at, ctx.tz)}</Td>
                    <Td className="text-right"><DocumentActions id={d.id} status={d.status} canEdit={ctx.can('documents.edit')} /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>
      )}
    </div>
  );
}
