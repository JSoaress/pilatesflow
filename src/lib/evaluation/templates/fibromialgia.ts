import type { FormTemplate } from '../types';
import { area, calc, info, multi, opts, scale, single, yesno, EVN_BANDS } from '../build';

const S03 = opts(['0', '0 — Ausente', 0], ['1', '1 — Leve (intermitente)', 1], ['2', '2 — Moderado (geralmente presente)', 2], ['3', '3 — Grave (contínuo)', 3]);
const S01 = opts(['0', 'Não', 0], ['1', 'Sim', 1]);

export const fibromialgia: FormTemplate = {
  key: 'sys:fibromialgia', name: 'Avaliação — Fibromialgia (critérios ACR)', specialty: 'Reumatologia / Dor crônica', version: 1, assessmentType: 'clinical_form',
  description: 'Índice de Dor Generalizada (IDG), Escore de Gravidade dos Sintomas (EGS) e critérios diagnósticos com cálculo automático.',
  summary: ['idg', 'egs', 'regioes', 'conclusao'],
  references: ['Wolfe F. et al. 2016 Revisions to the 2010/2011 fibromyalgia diagnostic criteria. Semin Arthritis Rheum, 2016.'],
  sections: [
    { id: 'idg', title: 'Índice de Dor Generalizada (IDG)', description: 'Marque as áreas em que o paciente sentiu dor na última semana.', fields: [
      multi('idg_r1', 'Região 1 — Superior esquerda', opts(['mandibula_e', 'Mandíbula esquerda'], ['cintura_esc_e', 'Cintura escapular esquerda'], ['braco_e', 'Braço esquerdo'], ['antebraco_e', 'Antebraço esquerdo'])),
      multi('idg_r2', 'Região 2 — Superior direita', opts(['mandibula_d', 'Mandíbula direita'], ['cintura_esc_d', 'Cintura escapular direita'], ['braco_d', 'Braço direito'], ['antebraco_d', 'Antebraço direito'])),
      multi('idg_r3', 'Região 3 — Inferior esquerda', opts(['quadril_e', 'Quadril esquerdo (glúteo/trocânter)'], ['coxa_e', 'Coxa esquerda'], ['perna_e', 'Perna esquerda'])),
      multi('idg_r4', 'Região 4 — Inferior direita', opts(['quadril_d', 'Quadril direito (glúteo/trocânter)'], ['coxa_d', 'Coxa direita'], ['perna_d', 'Perna direita'])),
      multi('idg_r5', 'Região 5 — Axial', opts(['cervical', 'Cervical'], ['dorso_sup', 'Dorso superior'], ['dorso_inf', 'Dorso inferior'], ['torax', 'Tórax'], ['abdome', 'Abdome'])),
      calc('idg', 'IDG — áreas dolorosas', { kind: 'count', fields: ['idg_r1', 'idg_r2', 'idg_r3', 'idg_r4', 'idg_r5'] }, { unit: '/ 19' }),
      calc('regioes', 'Regiões com dor (para dor generalizada)', { kind: 'named', name: 'fibro_regions' }, { help: 'Mandíbula, tórax e abdome não contam.' }),
    ] },
    { id: 'egs', title: 'Escore de Gravidade dos Sintomas (EGS)', fields: [
      info('egs_a', 'Parte A — gravidade na última semana (0 a 3)'),
      single('fadiga', 'Fadiga', S03), single('sono', 'Sono não reparador', S03), single('cognicao', 'Alterações cognitivas', S03),
      info('egs_b', 'Parte B — presença nos últimos 6 meses (0 ou 1)'),
      single('cefaleia', 'Cefaleia', S01, { span: 2 }), single('abdominal', 'Cãibras ou dor no abdome inferior', S01, { span: 2 }), single('depressao', 'Depressão', S01, { span: 2 }),
      calc('egs', 'EGS — escore total', { kind: 'sum', fields: ['fadiga', 'sono', 'cognicao', 'cefaleia', 'abdominal', 'depressao'] }, { unit: '/ 12' }),
    ] },
    { id: 'criterios', title: 'Critérios diagnósticos', fields: [
      calc('c1', '1. Pontuação: IDG ≥ 7 e EGS ≥ 5, ou IDG 4–6 e EGS ≥ 9', { kind: 'named', name: 'fibro_criteria', args: { idg: 'idg', egs: 'egs' } }, { span: 4 }),
      info('c2_info', '2. Dor generalizada: dor em pelo menos 4 das 5 regiões', 'Calculado automaticamente a partir do IDG (veja "Regiões com dor").'),
      yesno('c3', '3. Sintomas em nível semelhante há pelo menos 3 meses?', { span: 4 }),
      yesno('c4', '4. Diagnóstico independente de outras condições clínicas considerado?', { span: 4, help: 'O diagnóstico de fibromialgia é válido mesmo na presença de outras doenças.' }),
      calc('conclusao', 'Conclusão', { kind: 'named', name: 'fibro_conclusion', args: { c1: 'c1', regions: 'regioes', c3: 'c3', c4: 'c4' } }, { span: 4 }),
    ] },
    { id: 'complementar', title: 'Avaliação complementar', fields: [
      scale('evn', 'Intensidade média da dor na última semana (EVN)', 0, 10, { maps: 'pain_scale' }),
      calc('evn_score', 'Intensidade da dor', { kind: 'sum', fields: ['evn'] }, { bands: EVN_BANDS }),
      area('impacto', 'Impacto nas atividades diárias, trabalho e sono', { lines: 3 }),
      area('conduta', 'Objetivos e conduta (exercício gradual, educação em dor, higiene do sono)', { lines: 3 }),
    ] },
  ],
};
