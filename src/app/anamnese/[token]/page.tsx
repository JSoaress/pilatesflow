import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { PublicAnamnesis } from './public-anamnesis';

export const metadata: Metadata = { title: 'Anamnese', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AnamnesisPublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data, error } = /^[0-9a-f-]{36}$/i.test(token) ? await supabase.rpc('get_anamnesis_by_token', { p_token: token }) : { data: null, error: { message: 'Link inválido.' } };
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      {error || !data ? (
        <div className="rounded-2xl border bg-card p-8 text-center shadow-soft">
          <h1 className="text-xl font-semibold">Link indisponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">Este link de anamnese é inválido, já foi utilizado ou expirou. Solicite um novo link à clínica.</p>
        </div>
      ) : (
        <div className="rounded-2xl border bg-card p-6 shadow-soft sm:p-8">
          <p className="text-sm text-primary">{(data as any).organization}</p>
          <h1 className="mt-1 font-display text-2xl">Olá, {(data as any).patient_first_name}! Preencha sua anamnese</h1>
          <p className="mb-6 mt-2 text-sm text-muted-foreground">Suas respostas são confidenciais e serão usadas somente pela equipe responsável pelo seu atendimento, conforme a LGPD.</p>
          <PublicAnamnesis token={token} questions={(data as any).questions} />
        </div>
      )}
    </main>
  );
}
