import Link from 'next/link';
import { env } from '@/lib/env';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[hsl(158_27%_22%)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/5" />
        <div aria-hidden className="absolute -bottom-32 -left-16 h-[28rem] w-[28rem] rounded-full border border-white/10" />
        <Link href="/" className="relative z-10 font-display text-2xl">{env.appName}</Link>
        <div className="relative z-10 max-w-md">
          <p className="font-display text-4xl leading-tight">A operação inteira da sua clínica, com calma e precisão.</p>
          <p className="mt-4 text-white/70">Agenda, prontuário, financeiro e relacionamento com alunos em um só lugar — seguro, em conformidade com a LGPD.</p>
        </div>
        <p className="relative z-10 text-sm text-white/50">© {new Date().getFullYear()} {env.appName}</p>
      </aside>
      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
