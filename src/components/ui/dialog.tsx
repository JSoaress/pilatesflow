'use client';
import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Diálogo modal acessível baseado no elemento nativo <dialog>
 * (foco preso, ESC fecha, leitura correta por leitores de tela).
 */
export function Dialog({
  open, onOpenChange, title, description, children, footer, size = 'md', className,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; title: React.ReactNode; description?: React.ReactNode;
  children?: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'; className?: string;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl', full: 'max-w-[min(1400px,96vw)]' };
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => onOpenChange(false)}
      onCancel={(e) => { e.preventDefault(); onOpenChange(false); }}
      onClick={(e) => { if (e.target === ref.current) onOpenChange(false); }}
      className={cn('w-[calc(100vw-1.5rem)] rounded-2xl border bg-card p-0 text-card-foreground shadow-lift backdrop:bg-black/40 open:animate-fade-in', widths[size], className)}
    >
      {open && (
        <div className="flex max-h-[90vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
            </div>
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Fechar">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
