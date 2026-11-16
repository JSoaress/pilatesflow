'use client';
import * as React from 'react';
import { Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Barra de ações (não sai na impressão). */
export function PrintBar({ title, children, auto }: { title: string; children?: React.ReactNode; auto?: boolean }) {
  React.useEffect(() => { if (auto) { const t = setTimeout(() => window.print(), 600); return () => clearTimeout(t); } }, [auto]);
  return (
    <div className="no-print sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-2 px-4 py-2">
        <p className="mr-auto text-sm font-medium">{title}</p>
        {children}
        <Button size="sm" onClick={() => window.print()}><Printer />Imprimir / salvar PDF</Button>
        <Button size="sm" variant="ghost" onClick={() => (window.history.length > 1 ? window.history.back() : window.close())}><X />Fechar</Button>
      </div>
    </div>
  );
}
