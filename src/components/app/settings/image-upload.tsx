'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { uploadSiteImage } from '@/lib/actions/settings';

/** Upload de imagem pública (logo, capa, galeria, foto da equipe). Envia ao bucket "site". */
export function ImageUpload({ purpose, label = 'Enviar imagem', extra, onUploaded, currentUrl }: {
  purpose: 'logo' | 'hero' | 'gallery' | 'team' | 'blog'; label?: string; extra?: Record<string, string>;
  onUploaded?: (path: string) => void; currentUrl?: string | null;
}) {
  const router = useRouter();
  const ref = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="flex items-center gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {currentUrl && <img src={currentUrl} alt="" className="h-16 w-auto max-w-[160px] rounded-lg border bg-muted object-contain p-1" />}
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" aria-label={label} onChange={async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const fd = new FormData();
        fd.set('file', file);
        for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
        setBusy(true);
        const r = await uploadSiteImage(fd, purpose);
        setBusy(false);
        if (!r.ok) return toast.error(r.error);
        toast.success('Imagem enviada.');
        onUploaded?.((r.data as { path: string }).path);
        router.refresh();
      }} />
      <Button type="button" variant="outline" loading={busy} onClick={() => ref.current?.click()}><ImagePlus />{label}</Button>
    </div>
  );
}
