import type { FormTemplate } from '../types';
import { area, bilateral, calc, multi, opts, single, SIDES, text } from '../build';

const LR = (id: string, label: string, showValues: string[]) => single(id, `${label} — lado`, opts('Direito', 'Esquerdo', 'Bilateral'), { showIf: { field: id.replace(/_lado$/, ''), in: showValues }, span: 4 });

export const postural: FormTemplate = {
  key: 'sys:postural', name: 'Avaliação Postural', specialty: 'Postura', version: 1, assessmentType: 'postural',
  description: 'Inspeção estática anterior, posterior e sagital, rolamento, teste de Adams e encurtamentos musculares. Pode ser combinada com fotos posturais.',
  summary: ['achados_total'],
  sections: [
    { id: 'ident', title: 'Identificação', fields: [
      single('dominancia', 'Dominância', opts('Destro', 'Canhoto', 'Ambidestro')),
      text('avaliador', 'Avaliador / acadêmico', { span: 4 }),
    ] },
    { id: 'anterior', title: 'Inspeção estática — vista anterior', fields: [
      single('cabeca', 'Cabeça', opts('Alinhada', 'Inclinada', 'Rotacionada', 'Inclinada e rotacionada')), LR('cabeca_lado', 'Cabeça', ['inclinada', 'rotacionada', 'inclinada_e_rotacionada']),
      single('ombro_ant', 'Ombros', opts('Simétricos', 'Elevado', 'Rotacionado anteriormente', 'Elevado e rotacionado')), LR('ombro_ant_lado', 'Ombro', ['elevado', 'rotacionado_anteriormente', 'elevado_e_rotacionado']),
      single('clavicula', 'Clavículas', opts('Simétricas', 'Retilínea', 'Oblíqua')), LR('clavicula_lado', 'Clavícula', ['retilinea', 'obliqua']),
      single('thales_ant', 'Triângulo de Tales', opts('Simétrico', 'Aumentado à direita', 'Aumentado à esquerda')),
      bilateral('antebraco', 'Posicionamento do antebraço', { type: 'single', options: opts('Neutro', 'Pronado', 'Supinado') }),
      bilateral('pelve_ant', 'Pelve', { type: 'single', options: opts('Simétrica', 'Elevada', 'Rotacionada anteriormente', 'Rot. interna + adução do quadril') }),
      bilateral('joelho_ant', 'Joelhos', { type: 'single', options: opts('Normal', 'Valgo', 'Varo', 'Rotação medial', 'Rotação lateral') }),
      bilateral('artelhos', 'Artelhos', { type: 'single', options: opts('Normal', 'Hálux valgo', 'Dedos em garra', 'Dedos em martelo') }),
      bilateral('arco', 'Arco plantar', { type: 'single', options: opts('Normal', 'Plano', 'Cavo') }),
    ] },
    { id: 'posterior', title: 'Inspeção estática — vista posterior', fields: [
      single('ombro_post', 'Ombros', opts('Simétricos', 'Elevado')), LR('ombro_post_lado', 'Ombro', ['elevado']),
      bilateral('escapula', 'Escápulas (marque todos que se aplicam)', { type: 'multi', options: opts('Simétrica', 'Elevada', 'Abdução', 'Adução', 'Báscula externa do ângulo inferior', 'Báscula interna do ângulo inferior', 'Alada') }),
      single('thales_post', 'Triângulo de Tales', opts('Simétrico', 'Aumentado à direita', 'Aumentado à esquerda')),
      single('coluna_post', 'Alinhamento da coluna (fio de prumo)', opts('Alinhada', 'Desvio para a direita', 'Desvio para a esquerda', 'Curva em S'), { detail: { when: ['desvio_para_a_direita', 'desvio_para_a_esquerda', 'curva_em_s'], label: 'Região (cervical, torácica, lombar)' } }),
      bilateral('eips', 'Espinha ilíaca póstero-superior (EIPS)', { type: 'single', options: opts('Simétrica', 'Elevada') }),
      bilateral('joelho_post', 'Joelhos', { type: 'single', options: opts('Normal', 'Valgo', 'Varo') }),
      bilateral('tornozelo', 'Tornozelos / retropé', { type: 'single', options: opts('Normal', 'Valgo', 'Varo') }),
    ] },
    { id: 'sagital', title: 'Inspeção estática — vista lateral (sagital)', fields: [
      single('cabeca_sag', 'Cabeça', opts('Alinhada', 'Protrusa (anteriorizada)')),
      single('cervical', 'Lordose cervical', opts('Normal', 'Hiperlordose', 'Retificação')),
      single('ombros_sag', 'Ombros', opts('Normais', 'Protrusos')),
      single('toracica', 'Cifose torácica', opts('Normal', 'Hipercifose', 'Retificação')),
      single('diafragmatica', 'Lordose diafragmática', opts('Ausente', 'Presente')),
      single('lombar', 'Lordose lombar', opts('Normal', 'Hiperlordose', 'Retificação')),
      single('pelve_sag', 'Pelve', opts('Neutra', 'Anteversão', 'Retroversão', 'Antepulsão')),
      single('joelhos_sag', 'Joelhos', opts('Normais', 'Hiperextensão (recurvato)', 'Semiflexão')),
    ] },
    { id: 'rolamento', title: 'Inspeção no rolamento (flexão anterior)', fields: [
      single('rol_cabeca', 'Cabeça', opts('Rolamento normal', 'Extensão')),
      single('rol_toracica', 'Cifose torácica', opts('Curva normal', 'Hipercifose alta', 'Retificação')),
      single('rol_lombar', 'Lordose lombar', opts('Curva normal', 'Hiperlordose', 'Verticalizada')),
      single('rol_coxofemoral', 'Ângulo coxofemoral', opts('Normal', 'Aumentado')),
      single('rol_joelho', 'Joelhos', opts('Alinhados', 'Hiperextensão', 'Flexão')),
      single('rol_tibiotarsico', 'Ângulo tíbio-társico', opts('Normal', 'Aumentado')),
    ] },
    { id: 'adams', title: 'Teste de Adams', description: 'Flexão anterior do tronco com joelhos estendidos; observar gibosidades.', fields: [
      bilateral('adams', 'Resultado (marque todos que se aplicam)', { type: 'multi', options: opts('Normal', 'Gibosidade cervical', 'Gibosidade torácica', 'Gibosidade toracolombar', 'Gibosidade lombar') }),
      text('adams_obs', 'Observações (escoliômetro, graus)', { span: 4 }),
    ] },
    { id: 'encurtamentos', title: 'Encurtamentos musculares', fields: [
      multi('encurtamentos', 'Músculos encurtados', opts('Isquiotibiais', 'Iliopsoas', 'Reto femoral', 'Tensor da fáscia lata / banda iliotibial', 'Piriforme', 'Adutores', 'Tríceps sural', 'Paravertebrais lombares', 'Quadrado lombar', 'Peitoral maior/menor', 'Trapézio superior', 'Esternocleidomastóideo', 'Escalenos'), { other: true }),
      area('encurt_desc', 'Descrição (membro acometido, teste utilizado, grau)', { lines: 2 }),
      calc('achados_total', 'Encurtamentos identificados', { kind: 'count', fields: ['encurtamentos'] }),
    ] },
    { id: 'conclusao', title: 'Conclusão', fields: [
      area('sintese', 'Síntese dos achados posturais', { lines: 3 }),
      area('conduta', 'Conduta / exercícios prioritários', { lines: 3 }),
    ] },
  ],
};
void SIDES;
