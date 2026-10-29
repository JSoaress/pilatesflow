import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Entrar', robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold">Entrar</h1>
      <p className="mt-1 text-sm text-muted-foreground">Acesse o sistema da clínica ou o portal do aluno.</p>
      {sp.erro && <p role="alert" className="mt-4 rounded-lg bg-destructive-soft p-3 text-sm text-destructive">{sp.erro}</p>}
      <LoginForm next={sp.next} />
      <div className="mt-6 space-y-2 text-center text-sm">
        <Link href="/recuperar-senha" className="text-primary hover:underline">Esqueci minha senha</Link>
        <p className="text-muted-foreground">Ainda não tem conta? <Link href="/cadastro" className="text-primary hover:underline">Cadastre sua clínica</Link></p>
      </div>
    </>
  );
}
