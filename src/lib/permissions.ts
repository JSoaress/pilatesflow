// Mapa de navegação ↔ permissão necessária (o servidor/RLS é quem garante o acesso;
// isto apenas esconde do menu o que o usuário não pode usar).
export type Permission = string;

export const NAV = [
  { href: '/app', label: 'Dashboard', icon: 'LayoutDashboard', perm: 'dashboard.view' },
  { href: '/app/agenda', label: 'Agenda', icon: 'CalendarDays', perm: 'schedule.view' },
  { href: '/app/alunos', label: 'Alunos', icon: 'Users', perm: 'patients.view' },
  { href: '/app/prontuarios', label: 'Prontuários', icon: 'FileHeart', perm: 'medical_records.view' },
  { href: '/app/avaliacoes', label: 'Avaliações', icon: 'Activity', perm: 'assessments.view' },
  { href: '/app/exercicios', label: 'Exercícios', icon: 'Dumbbell', perm: 'exercises.view' },
  { href: '/app/planos', label: 'Planos', icon: 'BadgePercent', perm: 'plans.view' },
  { href: '/app/financeiro', label: 'Financeiro', icon: 'Wallet', perm: 'finance.view' },
  { href: '/app/crm', label: 'CRM', icon: 'Target', perm: 'crm.view' },
  { href: '/app/comunicacao', label: 'Comunicação', icon: 'MessageCircle', perm: 'communication.view' },
  { href: '/app/equipe', label: 'Equipe', icon: 'UserCog', perm: 'staff.view' },
  { href: '/app/estoque', label: 'Estoque', icon: 'Package', perm: 'inventory.view' },
  { href: '/app/equipamentos', label: 'Equipamentos', icon: 'Wrench', perm: 'equipment.view' },
  { href: '/app/relatorios', label: 'Relatórios', icon: 'BarChart3', perm: 'reports.view' },
  { href: '/app/tarefas', label: 'Tarefas', icon: 'ListChecks', perm: 'tasks.view' },
  { href: '/app/configuracoes', label: 'Configurações', icon: 'Settings', perm: 'settings.view' },
] as const;

export function canAny(perms: Set<string>, list: string[]) {
  return list.some((p) => perms.has(p));
}
