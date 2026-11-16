/** Utilitários da licença de uso (compartilhado servidor/cliente). */
export type LicenseStatus = 'trial' | 'active' | 'suspended';

export function daysLeft(until: string | null | undefined): number | null {
  if (!until) return null;
  return Math.ceil((new Date(until).getTime() - Date.now()) / 86400000);
}

export const LICENSE_LABEL: Record<LicenseStatus, string> = { trial: 'Em teste', active: 'Ativa', suspended: 'Suspensa' };

/** Contato do suporte/vendas — configure no .env.local */
export function supportContact() {
  const whatsapp = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '').replace(/\D/g, '');
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? '';
  return {
    whatsapp,
    email,
    whatsappUrl: (text: string) => (whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(text)}` : null),
  };
}
