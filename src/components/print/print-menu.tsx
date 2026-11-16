'use client';
import { Printer, FileText, ClipboardList, Dumbbell, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Menu, MenuLink } from '@/components/ui/menu';

/** Menu "Imprimir" da ficha do aluno. Abre a versão para impressão em nova aba. */
export function PrintMenu({ patientId, can, lastAssessmentId, programs }: {
  patientId: string; can: { record: boolean; handout: boolean; assessment: boolean; program: boolean };
  lastAssessmentId: string | null; programs: { id: string; name: string }[];
}) {
  if (!can.record && !can.handout && !can.assessment && !can.program) return null;
  return (
    <Menu trigger={(p) => <Button variant="outline" {...p}><Printer /> Imprimir</Button>}>
      {(close) => (
        <>
          {can.handout && <MenuLink href={`/imprimir/folha?aluno=${patientId}`} onClick={close}><FileText /> Folha de orientações para o aluno</MenuLink>}
          {can.program && programs.map((p) => <MenuLink key={p.id} href={`/imprimir/programa/${p.id}`} onClick={close}><Dumbbell /> Exercícios: {p.name}</MenuLink>)}
          {can.assessment && lastAssessmentId && <MenuLink href={`/imprimir/avaliacao/${lastAssessmentId}`} onClick={close}><Activity /> Relatório da última avaliação</MenuLink>}
          {can.assessment && <MenuLink href={`/app/avaliacoes/nova?aluno=${patientId}`} onClick={close}><ClipboardList /> Fichas de avaliação (preencher ou imprimir em branco)</MenuLink>}
          {(can.record || can.assessment) && <MenuLink href={`/imprimir/laudos/${patientId}`} onClick={close}><FileText /> Resumo dos laudos e exames</MenuLink>}
          {can.record && <MenuLink href={`/imprimir/prontuario/${patientId}`} onClick={close}><ClipboardList /> Prontuário completo (uso interno)</MenuLink>}
        </>
      )}
    </Menu>
  );
}
