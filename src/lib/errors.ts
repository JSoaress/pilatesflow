// Converte erros do banco/Supabase em mensagens amigáveis em português.
export type PgLikeError = { code?: string; message?: string; details?: string; hint?: string; status?: number };

const GENERIC = 'Não foi possível concluir a operação. Tente novamente em instantes.';

export function friendlyError(error: unknown): string {
  if (!error) return GENERIC;
  const e = error as PgLikeError;
  const msg = e.message ?? '';
  switch (e.code) {
    case 'P0001': // RAISE EXCEPTION das regras de negócio (já em português)
    case '28000':
      return msg || GENERIC;
    case '42501':
      return msg && /permiss|acesso|somente|proprietário|não pode/i.test(msg) ? msg : 'Você não tem permissão para esta ação.';
    case '23505':
      if (/cpf/i.test(msg + (e.details ?? ''))) return 'Já existe um cadastro com este CPF.';
      if (/sku/i.test(msg + (e.details ?? ''))) return 'Já existe um produto com este SKU.';
      if (/slug/i.test(msg + (e.details ?? ''))) return 'Este endereço (slug) já está em uso.';
      return 'Já existe um registro com estes dados.';
    case '23503':
      return 'Este registro está vinculado a outros dados e não pode ser removido ou alterado assim.';
    case '23514':
      return 'Algum valor informado não é válido. Revise os campos.';
    case '23502':
      return 'Preencha todos os campos obrigatórios.';
    case '22P02':
    case '22007':
    case '22008':
      return 'Formato de dado inválido. Revise datas e números.';
    case 'PGRST116':
      return 'Registro não encontrado.';
    case 'PGRST301':
    case '401':
      return 'Sua sessão expirou. Faça login novamente.';
  }
  if (/JWT|session|not authenticated/i.test(msg)) return 'Sua sessão expirou. Faça login novamente.';
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.';
  if (/User already registered/i.test(msg)) return 'Este e-mail já possui cadastro.';
  if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  if (/Password should be/i.test(msg)) return 'A senha deve ter pelo menos 8 caracteres, com letras e números.';
  // Mensagens das nossas regras chegam sem código em alguns casos (ex.: via RPC)
  if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(msg) && /[áéíóúâêôãõç]|ão |não /i.test(msg) && msg.length < 400) return msg;
  return GENERIC;
}
