// Estrutura das fichas de avaliação (modelos do sistema e personalizados)

export type Opt = { value: string; label: string; score?: number };
export type Tone = 'ok' | 'info' | 'warn' | 'alert';
export type Band = { min?: number; max?: number; label: string; tone?: Tone };

export type Compute =
  | { kind: 'bmi'; weight: string; height: string }                      // altura em metros
  | { kind: 'sum'; fields: string[] }                                     // soma números / pontuação das opções / itens marcados
  | { kind: 'count'; fields: string[]; exclude?: string[] }              // nº de opções marcadas (múltipla escolha, sim/não)
  | { kind: 'avg'; fields: string[] }
  | { kind: 'bilateral_diff'; field: string }                            // |D − E|
  | { kind: 'ratio'; numerator: number; field: string; decimals?: number } // ex.: 4,6 m ÷ tempo = velocidade
  | { kind: 'named'; name: NamedCompute; args?: Record<string, string> };

export type NamedCompute = 'mae' | 'fibro_regions' | 'fibro_criteria' | 'fibro_conclusion' | 'orthostatic' | 'gest_age' | 'dpp' | 'meem' | 'parq' | 'fried_fatigue';

export type CellSpec = { type: 'number' | 'text' | 'single' | 'multi' | 'date'; options?: Opt[]; unit?: string };

export type Field = {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'yesno' | 'single' | 'multi' | 'scale' | 'bp' | 'bilateral' | 'grid' | 'computed' | 'info';
  help?: string;
  unit?: string;
  min?: number; max?: number; step?: number;
  options?: Opt[];
  /** Mostra um campo de texto "Especificar" quando a resposta for um destes valores (sim/não usa 'yes'/'no'). */
  detail?: { when: string[]; label?: string };
  /** Opção "Outro" com texto livre. */
  other?: boolean;
  /** Largura no formulário (de 4 colunas). */
  span?: 1 | 2 | 3 | 4;
  showIf?: { field: string; in: string[] };
  bilateral?: { sides?: [string, string]; cell: CellSpec };
  grid?: { rows: { id: string; label: string }[]; columns: { id: string; label: string }[]; cell: CellSpec };
  compute?: Compute;
  bands?: Band[];
  decimals?: number;
  /** Linhas no papel (impressão em branco). */
  lines?: number;
  /** Copia a resposta para a coluna da avaliação (gráficos de evolução). */
  maps?: 'weight_kg' | 'height_m' | 'pain_scale';
  /** Pontuação para sim/não: [sim, não]. */
  yesNoScore?: [number, number];
};

export type Section = { id: string; title: string; description?: string; fields: Field[] };

export type FormTemplate = {
  key: string;                 // 'sys:postural' ou uuid de modelo personalizado
  name: string;
  specialty: string;
  description: string;
  version: number;
  assessmentType: 'physical' | 'postural' | 'functional' | 'reassessment' | 'clinical_form';
  sections: Section[];
  /** Resultados destacados no topo (ids de campos calculados). */
  summary?: string[];
  references?: string[];
};

export type Answers = Record<string, unknown>;
export type ScoreResult = { value: number | string | null; text: string; band?: Band };
export type Scores = Record<string, ScoreResult>;
export type EvalContext = { sex?: string | null; age?: number | null; date?: string | null };
