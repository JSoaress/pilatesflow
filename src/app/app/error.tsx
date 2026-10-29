'use client';
import { ErrorState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState title="Algo deu errado nesta tela" description="O problema foi registrado. Tente novamente; se persistir, contate o suporte." action={<Button onClick={reset}>Tentar novamente</Button>} />;
}
