import type { AgendaAppointment } from '@/lib/actions/schedule';
export type { AgendaAppointment };
export type Opt = { id: string; name: string; color?: string | null; unit_id?: string | null; capacity?: number | null; default_duration_min?: number; default_capacity?: number; kind?: string };
export type AgendaOptions = {
  units: { id: string; name: string; business_hours?: Record<string, { start: string; end: string }[]> }[];
  services: Opt[];
  staff: Opt[];
  rooms: Opt[];
  equipment: Opt[];
};
export type AgendaPerms = { create: boolean; edit: boolean; override: boolean; medical: boolean };
