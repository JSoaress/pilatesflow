import Link from 'next/link';
import { getUser } from '@/lib/auth/context';

export default async function NotFound() {
  // Autenticado: /entrar decide o destino certo (painel, portal do aluno ou onboarding pendente).
  const { user } = await getUser();
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <p className="font-display text-6xl text-primary">404</p>
      <h1 className="mt-2 text-xl font-semibold">Página não encontrada</h1>
      <p className="mt-1 text-sm text-muted-foreground">O endereço pode ter mudado ou o registro não existe mais.</p>
      <Link href={user ? '/entrar' : '/'} className="mt-6 text-sm text-primary hover:underline">{user ? 'Voltar ao painel' : 'Voltar ao início'}</Link>
    </div>
  );
}
