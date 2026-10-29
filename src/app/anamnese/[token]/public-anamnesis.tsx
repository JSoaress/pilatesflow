'use client';
import * as React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { AnamnesisForm, type Question } from '@/components/app/clinical/anamnesis-form';
import { submitPublicAnamnesis } from '@/lib/actions/public';

export function PublicAnamnesis({ token, questions }: { token: string; questions: Question[] }) {
  const [done, setDone] = React.useState(false);
  if (done) return <div className="py-8 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-success" /><p className="mt-3 text-lg font-medium">Obrigado! Suas respostas foram enviadas.</p></div>;
  return (
    <AnamnesisForm questions={questions} onSubmit={async (answers, sig) => {
      const r = await submitPublicAnamnesis(token, answers, sig);
      if (!r.ok) { toast.error(r.error); return false; }
      setDone(true);
      return true;
    }} />
  );
}
