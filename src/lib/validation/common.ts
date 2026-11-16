import { z } from 'zod';
import { isValidCPF, isValidCNPJ, onlyDigits } from '@/lib/utils';

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

export const optText = (max = 500) => z.preprocess(emptyToNull, z.string().trim().max(max, `Máximo de ${max} caracteres.`).nullable().optional());
export const reqText = (label: string, min = 1, max = 200) =>
  z.string({ error: `Informe ${label}.` }).trim().min(min, `Informe ${label}.`).max(max, `Máximo de ${max} caracteres.`);
export const optEmail = z.preprocess(emptyToNull, z.string().trim().toLowerCase().email('E-mail inválido.').nullable().optional());
export const optPhone = z.preprocess(emptyToNull, z.string().trim().refine((v) => onlyDigits(v).length >= 10 && onlyDigits(v).length <= 13, 'Telefone inválido (inclua o DDD).').nullable().optional());
export const optCPF = z.preprocess(emptyToNull, z.string().trim().refine(isValidCPF, 'CPF inválido.').nullable().optional());
export const optCNPJ = z.preprocess(emptyToNull, z.string().trim().refine(isValidCNPJ, 'CNPJ inválido.').nullable().optional());
export const optDate = z.preprocess(emptyToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.').nullable().optional());
export const reqDate = (label = 'a data') => z.string({ error: `Informe ${label}.` }).regex(/^\d{4}-\d{2}-\d{2}$/, `Informe ${label}.`);
export const optUuid = z.preprocess(emptyToNull, z.string().uuid('Seleção inválida.').nullable().optional());
export const reqUuid = (label: string) => z.string({ error: `Selecione ${label}.` }).uuid(`Selecione ${label}.`);
export const money = (label = 'o valor') =>
  z.preprocess((v) => (typeof v === 'string' ? Number(v.replace(/\./g, '').replace(',', '.')) : v),
    z.number({ error: `Informe ${label}.` }).min(0, 'O valor não pode ser negativo.').max(10_000_000));
export const optMoney = z.preprocess((v) => (v === '' || v === null || v === undefined ? null : typeof v === 'string' ? Number(v.replace(/\./g, '').replace(',', '.')) : v),
  z.number().min(0).max(10_000_000).nullable().optional());
export const optInt = (min = 0, max = 1_000_000) => z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().int().min(min).max(max).nullable().optional());
export const reqInt = (label: string, min = 0, max = 1_000_000) => z.preprocess((v) => (v === '' ? undefined : Number(v)), z.number({ error: `Informe ${label}.` }).int().min(min, `Valor mínimo: ${min}.`).max(max, `Valor máximo: ${max}.`));
export const bool = z.preprocess((v) => v === true || v === 'true' || v === 'on' || v === '1', z.boolean());
export const enumOf = <T extends string>(values: readonly [T, ...T[]], msg = 'Selecione uma opção válida.') => z.enum(values, { error: msg });
export const password = z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.').regex(/[A-Za-z]/, 'A senha deve conter letras.').regex(/\d/, 'A senha deve conter números.');
