/** Laudos e exames: áreas (iguais às fichas de avaliação) e tipos de exame. Compartilhado entre servidor e cliente. */

export const EXAM_AREAS = [
  { key: 'pilates', label: 'Pilates', ficha: 'sys:pilates', hint: 'Liberação médica, atestados para atividade física' },
  { key: 'musculoesqueletica', label: 'Musculoesquelética', ficha: 'sys:musculoesqueletica', hint: 'Coluna, articulações, lesões, pós-operatório' },
  { key: 'postural', label: 'Postural', ficha: 'sys:postural', hint: 'Escoliose, panorâmica de coluna, baropodometria' },
  { key: 'fibromialgia', label: 'Fibromialgia', ficha: 'sys:fibromialgia', hint: 'Laudo reumatológico, exames laboratoriais' },
  { key: 'gerontologia', label: 'Gerontologia', ficha: 'sys:gerontologia', hint: 'Densitometria, risco de queda, cognição' },
  { key: 'obstetricia', label: 'Obstetrícia', ficha: 'sys:obstetricia', hint: 'Ultrassom obstétrico, pré-natal, liberação do obstetra' },
  { key: 'neurologia', label: 'Neurológica', ficha: null, hint: 'Eletroneuromiografia, ressonância de crânio' },
  { key: 'cardiorrespiratoria', label: 'Cardiorrespiratória', ficha: null, hint: 'ECG, ecocardiograma, teste ergométrico, espirometria' },
  { key: 'geral', label: 'Geral', ficha: null, hint: 'Exames sem área definida' },
  { key: 'outro', label: 'Outros', ficha: null, hint: '' },
] as const;

export type ExamArea = (typeof EXAM_AREAS)[number]['key'];
export const EXAM_AREA_KEYS = EXAM_AREAS.map((a) => a.key) as [ExamArea, ...ExamArea[]];
export const examAreaLabel = (k?: string | null) => EXAM_AREAS.find((a) => a.key === k)?.label ?? 'Geral';

/** Área do laudo correspondente a uma ficha de avaliação (sys:fibromialgia → fibromialgia). */
export function areaForForm(formKey?: string | null): ExamArea | null {
  if (!formKey) return null;
  return (EXAM_AREAS.find((a) => a.ficha === formKey)?.key as ExamArea | undefined) ?? null;
}

export const EXAM_KINDS: Record<string, string> = {
  raio_x: 'Raio-X',
  ressonancia: 'Ressonância magnética',
  tomografia: 'Tomografia',
  ultrassom: 'Ultrassonografia',
  densitometria: 'Densitometria óssea',
  eletroneuromiografia: 'Eletroneuromiografia',
  laboratorial: 'Exame laboratorial (sangue/urina)',
  ecocardiograma: 'Ecocardiograma',
  eletrocardiograma: 'Eletrocardiograma',
  ergometrico: 'Teste ergométrico',
  espirometria: 'Espirometria',
  baropodometria: 'Baropodometria',
  polissonografia: 'Polissonografia',
  relatorio_medico: 'Relatório / laudo médico',
  encaminhamento: 'Encaminhamento / liberação médica',
  outro: 'Outro exame',
};
export const EXAM_KIND_KEYS = Object.keys(EXAM_KINDS) as [string, ...string[]];
export const examKindLabel = (k?: string | null) => (k ? EXAM_KINDS[k] ?? k : 'Exame');

/** Sugestões de tipo de exame por área (aparecem primeiro no formulário). */
export const SUGGESTED_KINDS: Record<string, string[]> = {
  pilates: ['encaminhamento', 'relatorio_medico', 'eletrocardiograma'],
  musculoesqueletica: ['raio_x', 'ressonancia', 'tomografia', 'ultrassom', 'eletroneuromiografia'],
  postural: ['raio_x', 'baropodometria', 'ressonancia'],
  fibromialgia: ['laboratorial', 'relatorio_medico', 'polissonografia'],
  gerontologia: ['densitometria', 'laboratorial', 'raio_x', 'relatorio_medico'],
  obstetricia: ['ultrassom', 'laboratorial', 'encaminhamento'],
  neurologia: ['eletroneuromiografia', 'ressonancia', 'tomografia'],
  cardiorrespiratoria: ['eletrocardiograma', 'ecocardiograma', 'ergometrico', 'espirometria'],
};

export type ExamReport = {
  id: string; title: string; category: string; exam_area: string | null; exam_kind: string | null; exam_date: string | null;
  issuer: string | null; findings: string | null; description: string | null; assessment_id: string | null;
  mime_type: string | null; size_bytes: number | null; created_at: string; profiles?: { full_name: string | null } | null;
};

export const EXAM_REPORT_COLUMNS = 'id, title, category, exam_area, exam_kind, exam_date, issuer, findings, description, assessment_id, mime_type, size_bytes, created_at, profiles:uploaded_by(full_name)';
