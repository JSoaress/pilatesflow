import { z } from 'zod';
import { enumOf, optCPF, optDate, optEmail, optPhone, optText, optUuid, reqText } from './common';

export const patientSchema = z.object({
  full_name: reqText('o nome completo', 3, 160),
  social_name: optText(120),
  birth_date: optDate.refine((v) => !v || new Date(v) <= new Date(), 'A data de nascimento não pode estar no futuro.'),
  cpf: optCPF,
  rg: optText(30),
  gender: z.preprocess((v) => (v === '' ? null : v), enumOf(['female', 'male', 'other', 'not_informed']).nullable().optional()),
  profession: optText(120),
  phone: optPhone,
  whatsapp: optPhone,
  email: optEmail,
  address_zip: optText(9),
  address_street: optText(160),
  address_number: optText(20),
  address_complement: optText(80),
  address_district: optText(80),
  address_city: optText(80),
  address_state: optText(2),
  unit_id: optUuid,
  origin: z.preprocess((v) => (v === '' ? null : v), enumOf(['instagram', 'google', 'referral', 'whatsapp', 'website', 'walk_in', 'event', 'other']).nullable().optional()),
  referred_by_name: optText(160),
  status: enumOf(['lead', 'trial', 'active', 'paused', 'inactive', 'cancelled']).default('active'),
  notes: optText(4000),
  checkin_pin: z.preprocess((v) => (v === '' ? null : v), z.string().regex(/^\d{4,6}$/, 'O PIN deve ter de 4 a 6 números.').nullable().optional()),
  emergency_name: optText(120),
  emergency_relationship: optText(60),
  emergency_phone: optPhone,
});
export type PatientInput = z.infer<typeof patientSchema>;
