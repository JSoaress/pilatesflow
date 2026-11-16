import type { FormTemplate } from '../types';
import { area, BMI_BANDS, bilateral, bp, calc, date, EVN_BANDS, grid, info, MRC, multi, num, opts, scale, single, text, yesnoSpec, yesno } from '../build';

export const musculoesqueletica: FormTemplate = {
  key: 'sys:musculoesqueletica', name: 'Avaliação Musculoesquelética', specialty: 'Ortopedia / Traumatologia', version: 1, assessmentType: 'physical',
  description: 'Anamnese, sinais vitais, exame físico (goniometria, força, perimetria), dor com triagem DN4, movimento, postura e plano de reabilitação.',
  summary: ['imc', 'dn4_total', 'evn_score', 'discrepancia_dif'],
  references: ['DN4: Bouhassira et al., 2005; versão brasileira Santos et al., 2010 (ponto de corte ≥ 4).', 'IMC: classificação OMS.', 'Força muscular: escala MRC (0–5).'],
  sections: [
    { id: 'ident', title: 'Identificação complementar', description: 'Nome, contato e nascimento vêm do cadastro do aluno.', fields: [
      single('estado_civil', 'Estado civil', opts('Solteiro(a)', 'Casado(a) / união estável', 'Divorciado(a) / separado(a)', 'Viúvo(a)'), { span: 4 }),
      text('cidade', 'Cidade de residência'), text('acompanhante', 'Acompanhante'),
      text('encaminhamento', 'Encaminhado por / médico'), text('cid', 'CID-10', { span: 1 }), text('cbdf', 'CBDF (diagnóstico fisioterapêutico)', { span: 1, help: 'Classificação Brasileira de Diagnósticos Fisioterapêuticos' }),
    ] },
    { id: 'anamnese', title: 'Anamnese', fields: [
      area('qp', 'Queixa principal (QP)', { lines: 2 }),
      area('hma', 'História da moléstia atual (HMA)', { lines: 4, help: 'Início, mecanismo, evolução, tratamentos já feitos.' }),
      area('hmp', 'História da moléstia pregressa (HMP)'),
      area('medicamentos', 'Medicamentos em uso', { lines: 2 }),
      area('sintomas', 'Sintomas associados', { lines: 2 }),
      yesnoSpec('cirurgias', 'Cirurgias prévias?', 'Quais e quando'),
      single('atividade', 'Atividade física', opts('Sedentário', 'Irregular', '1–2x por semana', '3x ou mais por semana'), { detail: { when: ['1_2x_por_semana', '3x_ou_mais_por_semana', 'irregular'], label: 'Qual atividade' } }),
    ] },
    { id: 'vitais', title: 'Sinais vitais e antropometria', fields: [
      num('massa', 'Massa', 'kg', { min: 2, max: 400, step: 0.1, maps: 'weight_kg' }), num('altura', 'Altura', 'm', { min: 0.5, max: 2.5, step: 0.01, maps: 'height_m' }),
      calc('imc', 'IMC', { kind: 'bmi', weight: 'massa', height: 'altura' }, { bands: BMI_BANDS, unit: 'kg/m²' }),
      bp('pa'), num('fc', 'FC', 'bpm', { min: 20, max: 250 }), num('fr', 'FR', 'irpm', { min: 4, max: 80 }), num('spo2', 'SpO₂', '%', { min: 50, max: 100 }),
      area('ausculta', 'Ausculta cardiopulmonar', { lines: 2 }),
    ] },
    { id: 'exame', title: 'Exame físico', fields: [
      area('inspecao', 'Inspeção', { lines: 2, help: 'Edema, cicatrizes, deformidades, trofismo, coloração.' }),
      area('palpacao', 'Exame palpatório', { lines: 2, help: 'Temperatura, tônus, pontos dolorosos, crepitação.' }),
      grid('goniometria', 'Goniometria (ADM ativa, em graus)', ['Ombro — flexão', 'Ombro — abdução', 'Ombro — rotação externa', 'Ombro — rotação interna', 'Cotovelo — flexão', 'Punho — flexão', 'Punho — extensão', 'Quadril — flexão', 'Quadril — abdução', 'Quadril — rotação interna', 'Joelho — flexão', 'Joelho — extensão', 'Tornozelo — dorsiflexão', 'Tornozelo — flexão plantar'], ['Direito', 'Esquerdo'], { type: 'number', unit: '°' }),
      area('goniometria_obs', 'Outras articulações / observações de ADM', { lines: 2 }),
      grid('forca', 'Força muscular (escala MRC)', ['Flexores de ombro', 'Abdutores de ombro', 'Flexores de cotovelo', 'Extensores de cotovelo', 'Extensores de punho', 'Flexores de quadril', 'Abdutores de quadril', 'Extensores de quadril', 'Extensores de joelho', 'Flexores de joelho', 'Dorsiflexores', 'Flexores plantares'], ['Direito', 'Esquerdo'], { type: 'single', options: MRC }),
      text('rm', 'Teste de RM / dinamometria', { span: 4 }),
      grid('perimetria', 'Perimetria (cm)', ['Braço', 'Antebraço', 'Coxa (10 cm acima da patela)', 'Coxa (20 cm acima da patela)', 'Joelho (interlinha)', 'Perna (maior volume)', 'Tornozelo'], ['Direito', 'Esquerdo'], { type: 'number', unit: 'cm' }),
      bilateral('discrepancia', 'Comprimento real dos membros inferiores (EIAS → maléolo medial)', { type: 'number', unit: 'cm' }),
      calc('discrepancia_dif', 'Discrepância de membros', { kind: 'bilateral_diff', field: 'discrepancia' }, { unit: 'cm', bands: [{ max: 0.99, label: 'Sem discrepância relevante', tone: 'ok' }, { min: 1, label: 'Discrepância ≥ 1 cm', tone: 'warn' }] }),
    ] },
    { id: 'dor', title: 'Avaliação da dor', fields: [
      scale('evn', 'Escala Visual Numérica (EVN)', 0, 10, { maps: 'pain_scale' }),
      calc('evn_score', 'Intensidade da dor', { kind: 'sum', fields: ['evn'] }, { bands: EVN_BANDS }),
      info('dn4_info', 'Questionário DN4 — triagem de dor neuropática', 'Marque o que se aplica à dor do paciente. Cada item vale 1 ponto.'),
      multi('dn4_q1', '1. A dor tem uma ou mais destas características?', opts('Queimação', 'Sensação de frio dolorosa', 'Choque elétrico')),
      multi('dn4_q2', '2. Há na mesma área algum destes sintomas?', opts('Formigamento', 'Alfinetada e agulhada', 'Adormecimento', 'Coceira')),
      multi('dn4_q3', '3. O exame físico revela na área dolorosa:', opts('Hipoestesia ao toque', 'Hipoestesia à picada de agulha')),
      multi('dn4_q4', '4. Na área dolorosa, a dor é causada ou aumentada por:', opts('Escovação')),
      calc('dn4_total', 'Escore DN4', { kind: 'count', fields: ['dn4_q1', 'dn4_q2', 'dn4_q3', 'dn4_q4'] }, { unit: '/ 10', bands: [{ max: 3, label: 'Dor neuropática improvável', tone: 'ok' }, { min: 4, label: 'Sugere componente neuropático (≥ 4)', tone: 'alert' }] }),
      area('dor_local', 'Localização e comportamento da dor', { help: 'Irradiação, tempo de aparecimento, comportamento ao longo do dia, trigger points.' }),
      text('dor_piora', 'Fatores de piora'), text('dor_melhora', 'Fatores de melhora'),
      multi('sensibilidade', 'Sensibilidade alterada', opts('Tátil', 'Térmica', 'Dolorosa', 'Proprioceptiva'), { detail: { when: ['tatil', 'termica', 'dolorosa', 'proprioceptiva'], label: 'Região / dermátomo' } }),
    ] },
    { id: 'movimento', title: 'Avaliação do movimento', fields: [
      yesnoSpec('ruidos', 'Ruídos articulares?', 'Articulação e tipo (estalo, crepitação)'),
      single('endfeel', 'Sensação final do movimento (end-feel)', opts('Normal / fisiológica', 'Óssea (dura)', 'Capsular (firme)', 'Elástica', 'Vazia', 'Espasmo muscular'), { detail: { when: ['ossea_dura', 'capsular_firme', 'elastica', 'vazia', 'espasmo_muscular'], label: 'Articulação / movimento' } }),
      area('marcha', 'Avaliação da marcha', { lines: 2 }),
      area('flexibilidade', 'Flexibilidade', { lines: 2, help: 'Ex.: sentar e alcançar, Thomas, 90/90.' }),
      area('reflexos', 'Reflexos (profundos e superficiais)', { lines: 2 }),
      area('testes', 'Testes ortopédicos / especiais', { help: 'Teste, lado e resultado (positivo/negativo).' }),
    ] },
    { id: 'postura', title: 'Avaliação postural resumida', description: 'Para análise detalhada use a Ficha de Avaliação Postural.', fields: [
      area('post_ant', 'Vista anterior', { lines: 2 }), area('post_post', 'Vista posterior', { lines: 2 }), area('post_lat', 'Vista lateral (D/E)', { lines: 2 }),
    ] },
    { id: 'exames', title: 'Exames complementares', fields: [area('exames', 'Imagem, laboratório e outros (data e laudo)')] },
    { id: 'reab', title: 'Diagnóstico e reabilitação', fields: [
      area('diagnostico', 'Diagnóstico cinético-funcional', { lines: 2 }),
      area('obj_curto', 'Objetivos a curto prazo', { lines: 2 }), area('obj_longo', 'Objetivos a médio/longo prazo', { lines: 2 }),
      area('conduta', 'Plano de tratamento / conduta fisioterapêutica', { lines: 4 }),
      text('frequencia', 'Frequência sugerida', { span: 2 }), date('reavaliacao', 'Reavaliar em', { span: 2 }),
    ] },
  ],
};
