import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <p className="font-display text-6xl text-primary">404</p>
      <h1 className="mt-2 text-xl font-semibold">Página não encontrada</h1>
      <p className="mt-1 text-sm text-muted-foreground">O endereço pode ter mudado ou o registro não existe mais.</p>
      <Link href="/" className="mt-6 text-sm text-primary hover:underline">Voltar ao início</Link>
    </div>
  );
}
