'use client';
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: 'system-ui', display: 'grid', placeItems: 'center', minHeight: '100vh', margin: 0 }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h1>Ocorreu um erro inesperado</h1>
          <p>O problema foi registrado. Tente novamente.</p>
          <button onClick={reset} style={{ padding: '8px 16px', borderRadius: 8 }}>Tentar novamente</button>
        </div>
      </body>
    </html>
  );
}
