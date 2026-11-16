import type { FormTemplate } from '../types';
import { area, BMI_BANDS, bp, calc, date, multi, num, opts, scale, single, text, yesno, EVN_BANDS } from '../build';

const PARQ = [
  'Algum médico já disse que você possui algum problema de coração ou pressão arterial e que só deveria realizar atividade física supervisionada?',
  'Você sente dor no peito quando pratica atividade física?',
  'No último mês, você sentiu dor no peito ao praticar atividade física?',
  'Você perde o equilíbrio por causa de tontura ou já perdeu a consciência?',
  'Você tem algum problema ósseo ou articular que poderia piorar com a atividade física?',
  'Você toma atualmente algum medicamento para pressão arterial ou problema de coração?',
  'Sabe de alguma outra razão pela qual não deveria realizar atividade física?',
];

export const pilates: FormTemplate = {
  key: 'sys:pilates', name: 'Avaliação Inicial de Pilates', specialty: 'Pilates', version: 1, assessmentType: 'physical',
  description: 'Triagem PAR-Q, objetivos, histórico, testes de mobilidade, estabilidade e força e plano de aulas — para alunos de Pilates.',
  summary: ['parq_result', 'imc', 'evn_score'],
  references: ['PAR-Q: Physical Activity Readiness Questionnaire (versão em português).'],
  sections: [
    { id: 'objetivos', title: 'Objetivos e histórico', fields: [
      multi('objetivos', 'Objetivos com o Pilates', opts('Aliviar dores', 'Melhorar a postura', 'Ganhar flexibilidade', 'Fortalecer', 'Reabilitação de lesão', 'Condicionamento físico', 'Gestação / pós-parto', 'Qualidade de vida / estresse', 'Complemento a outro esporte'), { other: true }),
      single('experiencia', 'Já praticou Pilates?', opts('Nunca', 'Menos de 6 meses', '6 meses a 2 anos', 'Mais de 2 anos')),
      single('nivel', 'Nível de atividade física atual', opts('Sedentário', 'Leve (1–2x/semana)', 'Moderado (3–4x/semana)', 'Intenso (5x ou mais)'), { detail: { when: ['leve_1_2x_semana', 'moderado_3_4x_semana', 'intenso_5x_ou_mais'], label: 'Quais atividades' } }),
      text('profissao_rotina', 'Rotina de trabalho / postura predominante', { span: 4 }),
      area('historico', 'Lesões, cirurgias e condições de saúde', { lines: 3 }),
      area('medicamentos', 'Medicamentos em uso', { lines: 2 }),
    ] },
    { id: 'parq', title: 'Prontidão para atividade física (PAR-Q)', fields: [
      ...PARQ.map((q, i) => yesno(`parq_${i + 1}`, `${i + 1}. ${q}`, { span: 4 as const })),
      calc('parq_result', 'Resultado do PAR-Q', { kind: 'named', name: 'parq', args: { fields: PARQ.map((_, i) => `parq_${i + 1}`).join(',') } }, { span: 4 }),
    ] },
    { id: 'saude', title: 'Medidas e dor', fields: [
      num('massa', 'Peso', 'kg', { step: 0.1, maps: 'weight_kg' }), num('altura', 'Altura', 'm', { step: 0.01, maps: 'height_m' }),
      calc('imc', 'IMC', { kind: 'bmi', weight: 'massa', height: 'altura' }, { unit: 'kg/m²', bands: BMI_BANDS }),
      bp('pa'), num('fc', 'FC de repouso', 'bpm'),
      scale('evn', 'Dor hoje (EVN)', 0, 10, { maps: 'pain_scale' }),
      calc('evn_score', 'Intensidade da dor', { kind: 'sum', fields: ['evn'] }, { bands: EVN_BANDS }),
      text('dor_local', 'Local da dor', { span: 4 }),
    ] },
    { id: 'testes', title: 'Testes de movimento', fields: [
      num('sentar_alcancar', 'Sentar e alcançar (banco de Wells)', 'cm', { step: 0.5 }),
      num('prancha', 'Prancha ventral', 's'), num('ponte_unipodal_d', 'Ponte unipodal D', 's'), num('ponte_unipodal_e', 'Ponte unipodal E', 's'),
      single('respiracao', 'Padrão respiratório', opts('Costal lateral adequado', 'Predominantemente apical', 'Predominantemente abdominal', 'Paradoxal')),
      single('centro', 'Controle do centro (powerhouse) no Hundred / imprint', opts(['0', 'Não consegue ativar', 0], ['1', 'Ativa com perda de controle', 1], ['2', 'Controle parcial', 2], ['3', 'Controle completo', 3])),
      single('roll_up', 'Roll up', opts('Realiza com fluidez', 'Realiza com compensações', 'Não realiza')),
      single('agachamento', 'Agachamento bipodal', opts('Alinhado', 'Valgo dinâmico', 'Elevação dos calcanhares', 'Flexão excessiva de tronco')),
      single('mob_coluna', 'Mobilidade da coluna (articulação vértebra a vértebra)', opts('Boa', 'Regular', 'Limitada')),
      single('mob_ombro', 'Mobilidade de ombros (braços acima da cabeça, costas na parede)', opts('Completa', 'Parcial', 'Limitada')),
      area('testes_obs', 'Observações dos testes', { lines: 2 }),
    ] },
    { id: 'plano', title: 'Plano de aulas', fields: [
      multi('contraindicacoes', 'Cuidados / contraindicações', opts('Evitar flexão de coluna carregada', 'Evitar extensão de coluna', 'Evitar impacto', 'Evitar decúbito ventral', 'Controlar carga em ombros', 'Gestante — adaptar decúbitos'), { other: true }),
      single('modalidade', 'Modalidade indicada', opts('Pilates aparelhos', 'Pilates solo', 'Individual', 'Dupla', 'Grupo', 'Fisioterapia + Pilates')),
      single('frequencia', 'Frequência indicada', opts('1x por semana', '2x por semana', '3x por semana')),
      area('foco', 'Foco das primeiras aulas', { lines: 3 }),
      date('reavaliacao', 'Reavaliar em', { help: 'Sugestão: a cada 3 meses' }),
    ] },
  ],
};
