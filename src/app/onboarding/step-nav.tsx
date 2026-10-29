'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { completeOnboarding, setOnboardingStep } from '@/lib/actions/onboarding';

export function StepNav({ step }: { step: number }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const go = (n: number) => start(async () => {
    await setOnboardingStep(n);
    router.push(`/onboarding?passo=${n}`);
  });
  return (
    <div className="mt-8 flex items-center justify-between border-t pt-5">
      <Button variant="outline" disabled={step <= 2 || pending} onClick={() => go(step - 1)}>Voltar</Button>
      {step < 10 ? (
        <div className="flex gap-2">
          {step >= 4 && <Button variant="ghost" onClick={() => go(step + 1)} disabled={pending}>Pular</Button>}
          <Button onClick={() => go(step + 1)} loading={pending}>Continuar</Button>
        </div>
      ) : (
        <Button loading={pending} onClick={() => start(async () => {
          const r = await completeOnboarding();
          if (!r.ok) { toast.error(r.error); return; }
          router.push('/app');
          router.refresh();
        })}>Ir para o painel</Button>
      )}
    </div>
  );
}
