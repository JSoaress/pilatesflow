import type { FormTemplate } from './types';
import { pilates } from './templates/pilates';
import { musculoesqueletica } from './templates/musculoesqueletica';
import { postural } from './templates/postural';
import { fibromialgia } from './templates/fibromialgia';
import { gerontologia } from './templates/gerontologia';
import { obstetricia } from './templates/obstetricia';

/** Fichas prontas do sistema (versionadas no código; cada avaliação guarda uma cópia do modelo usado). */
export const SYSTEM_TEMPLATES: FormTemplate[] = [pilates, musculoesqueletica, postural, fibromialgia, gerontologia, obstetricia];
export const systemTemplate = (key: string) => SYSTEM_TEMPLATES.find((t) => t.key === key) ?? null;
export * from './types';
export * from './engine';
