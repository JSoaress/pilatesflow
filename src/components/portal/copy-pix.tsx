'use client';
import { Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function CopyPix({ pix, url }: { pix?: string | null; url?: string | null }) {
  return (
    <div className="flex justify-end gap-1">
      {pix && <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(pix); toast.success('Código Pix copiado. Cole no app do seu banco.'); }}><Copy /> Pix copia e cola</Button>}
      {url && <a href={url} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline"><ExternalLink /> Pagar</Button></a>}
    </div>
  );
}
