// Rótulos em português para os valores armazenados no banco.
export const patientStatus: Record<string, string> = {
  lead: 'Lead', trial: 'Experimental', active: 'Ativo', paused: 'Pausado', inactive: 'Inativo', cancelled: 'Cancelado',
};
export const participantStatus: Record<string, string> = {
  scheduled: 'Agendado', confirmed: 'Confirmado', replacement: 'Reposição', present: 'Presente',
  completed: 'Concluído', cancelled: 'Cancelado', absent: 'Faltou', waiting: 'Em espera',
};
export const participantStatusColor: Record<string, string> = {
  scheduled: 'bg-info-soft text-info border-info/30',
  confirmed: 'bg-primary-soft text-primary border-primary/30',
  replacement: 'bg-accent text-accent-foreground border-accent-foreground/20',
  present: 'bg-success-soft text-success border-success/30',
  completed: 'bg-success-soft text-success border-success/30',
  cancelled: 'bg-muted text-muted-foreground border-border line-through',
  absent: 'bg-destructive-soft text-destructive border-destructive/30',
  waiting: 'bg-warning-soft text-warning border-warning/30',
};
export const serviceKind: Record<string, string> = {
  pilates_apparatus: 'Pilates aparelhos', pilates_mat: 'Pilates solo', pilates_individual: 'Pilates individual',
  pilates_duo: 'Pilates em dupla', pilates_group: 'Pilates em grupo', assessment: 'Avaliação', reassessment: 'Reavaliação',
  physiotherapy: 'Fisioterapia', trial: 'Aula experimental', other: 'Outro',
};
export const staffKind: Record<string, string> = {
  physiotherapist: 'Fisioterapeuta', pe_professional: 'Profissional de Educação Física', instructor: 'Instrutor',
  receptionist: 'Recepcionista', admin: 'Administrativo', finance: 'Financeiro', other: 'Outro',
};
export const staffStatus: Record<string, string> = { active: 'Ativo', inactive: 'Inativo', on_leave: 'Afastado' };
export const equipmentType: Record<string, string> = {
  reformer: 'Reformer', cadillac: 'Cadillac', chair: 'Chair', ladder_barrel: 'Ladder Barrel',
  spine_corrector: 'Spine Corrector', tower: 'Tower', mat: 'Mat', accessory: 'Acessório', other: 'Outro',
};
export const equipmentStatus: Record<string, string> = {
  available: 'Disponível', in_use: 'Em uso', maintenance: 'Manutenção', inactive: 'Inativo',
};
export const maintenanceType: Record<string, string> = {
  preventive: 'Preventiva', corrective: 'Corretiva', inspection: 'Inspeção', cleaning: 'Limpeza', other: 'Outra',
};
export const receivableStatus: Record<string, string> = {
  pending: 'Pendente', paid: 'Pago', overdue: 'Vencido', partial: 'Parcial', cancelled: 'Cancelado', refunded: 'Estornado',
};
export const payableStatus: Record<string, string> = { pending: 'Pendente', paid: 'Pago', overdue: 'Vencido', cancelled: 'Cancelado' };
export const paymentMethod: Record<string, string> = {
  pix: 'Pix', cash: 'Dinheiro', credit_card: 'Cartão de crédito', debit_card: 'Cartão de débito',
  boleto: 'Boleto', transfer: 'Transferência', other: 'Outro',
};
export const subscriptionStatus: Record<string, string> = {
  pending: 'Pendente', active: 'Ativo', paused: 'Pausado', cancelled: 'Cancelado', expired: 'Encerrado',
};
export const billingType: Record<string, string> = { monthly: 'Mensal (parcelas mensais)', upfront: 'À vista', installments: 'Parcelado' };
export const leadStage: Record<string, string> = {
  new: 'Novo lead', contacted: 'Contato realizado', trial_scheduled: 'Experimental marcada',
  trial_done: 'Experimental realizada', negotiation: 'Negociação', enrolled: 'Matriculado', lost: 'Perdido',
};
export const origin: Record<string, string> = {
  instagram: 'Instagram', google: 'Google', referral: 'Indicação', whatsapp: 'WhatsApp', website: 'Site',
  walk_in: 'Passou em frente', event: 'Evento', other: 'Outro',
};
export const gender: Record<string, string> = { female: 'Feminino', male: 'Masculino', other: 'Outro', not_informed: 'Prefere não informar' };
export const taskPriority: Record<string, string> = { low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente' };
export const taskStatus: Record<string, string> = { open: 'Aberta', in_progress: 'Em andamento', done: 'Concluída', cancelled: 'Cancelada' };
export const exerciseLevel: Record<string, string> = { beginner: 'Iniciante', intermediate: 'Intermediário', advanced: 'Avançado' };
export const assessmentType: Record<string, string> = { physical: 'Física', postural: 'Postural', functional: 'Funcional', reassessment: 'Reavaliação', clinical_form: 'Ficha clínica' };
export const posturalView: Record<string, string> = {
  anterior: 'Anterior', posterior: 'Posterior', right_lateral: 'Lateral direita', left_lateral: 'Lateral esquerda', other: 'Outra',
};
export const attachmentCategory: Record<string, string> = {
  exam: 'Exame', medical_report: 'Laudo', certificate: 'Atestado', prescription: 'Prescrição/encaminhamento',
  document: 'Documento', contract: 'Contrato', consent: 'Termo de consentimento', image_authorization: 'Autorização de imagem',
  receipt: 'Recibo', other: 'Outro',
};
export const documentType: Record<string, string> = {
  contract: 'Contrato', anamnesis: 'Anamnese', consent_term: 'Termo de consentimento', image_authorization: 'Autorização de uso de imagem',
  privacy_policy: 'Política de privacidade', assessment: 'Avaliação', certificate: 'Atestado', exam: 'Exame', receipt: 'Recibo', handout: 'Orientações ao aluno', other: 'Outros',
};
export const documentStatus: Record<string, string> = { draft: 'Rascunho', sent: 'Enviado', signed: 'Assinado', archived: 'Arquivado' };
export const contractStatus: Record<string, string> = { draft: 'Rascunho', sent: 'Enviado', accepted: 'Aceito', cancelled: 'Cancelado', expired: 'Vencido' };
export const messageStatus: Record<string, string> = {
  queued: 'Na fila', sending: 'Enviando', sent: 'Enviada', delivered: 'Entregue', read: 'Lida', failed: 'Falhou', cancelled: 'Cancelada',
};
export const channel: Record<string, string> = { whatsapp: 'WhatsApp', email: 'E-mail', sms: 'SMS', push: 'Push' };
export const integrationStatus: Record<string, string> = {
  not_connected: 'Não conectado', connected: 'Conectado', error: 'Erro', config_required: 'Configuração necessária',
};
export const inventoryMovementType: Record<string, string> = { in: 'Entrada', out: 'Saída', sale: 'Venda', adjustment: 'Ajuste', loss: 'Perda' };
export const dsrKind: Record<string, string> = {
  access: 'Acesso/consulta', correction: 'Correção', export: 'Exportação', anonymization: 'Anonimização', deletion: 'Exclusão',
  portability: 'Portabilidade', revoke_consent: 'Revogação de consentimento', information: 'Informação',
};
export const dsrStatus: Record<string, string> = { open: 'Aberta', in_progress: 'Em andamento', completed: 'Concluída', rejected: 'Indeferida' };
export const commissionBasis: Record<string, string> = {
  per_session: 'Por aula ministrada', per_attendance: 'Por aluno presente', percent_service: 'Percentual da modalidade',
  per_sale: 'Por venda de plano', fixed: 'Valor fixo mensal',
};
export const auditAction: Record<string, string> = {
  insert: 'Criou', update: 'Alterou', delete: 'Excluiu', soft_delete: 'Arquivou', refund: 'Estornou', finalize: 'Finalizou',
  export: 'Exportou', download: 'Baixou arquivo', anonymize: 'Anonimizou', grant_permission: 'Concedeu permissão',
  revoke_permission: 'Revogou permissão', login: 'Entrou', invite: 'Convidou', print: 'Imprimiu',
};
export const entityLabel: Record<string, string> = {
  patients: 'Aluno', appointments: 'Agendamento', appointment_participants: 'Participação', accounts_receivable: 'Conta a receber',
  payments: 'Pagamento', accounts_payable: 'Conta a pagar', cash_movements: 'Caixa', medical_records: 'Prontuário',
  clinical_evolutions: 'Evolução', assessments: 'Avaliação', anamnesis: 'Anamnese', subscriptions: 'Assinatura', plans: 'Plano',
  contracts: 'Contrato', roles: 'Perfil', role_permissions: 'Permissões', organization_members: 'Usuário', staff: 'Profissional',
  leads: 'Lead', equipment: 'Equipamento', units: 'Unidade', organizations: 'Clínica', system_settings: 'Configuração',
  attachments: 'Arquivo', documents: 'Documento', postural_photos: 'Foto postural', services: 'Modalidade', rooms: 'Sala',
  patient_programs: 'Programa de exercícios', receivables: 'Contas a receber', report: 'Relatório', 'cash-flow': 'Fluxo de caixa',
};
export function label(map: Record<string, string>, key: string | null | undefined) {
  if (!key) return '—';
  return map[key] ?? key;
}
