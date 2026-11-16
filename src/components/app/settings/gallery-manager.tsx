'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { removeGalleryImage } from '@/lib/actions/settings';
import { ImageUpload } from './image-upload';

export function GalleryManager({ items, canEdit }: { items: { id: string; url: string; caption: string | null; section: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const [section, setSection] = React.useState('structure');
  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Seção" value={section} onChange={(e) => setSection(e.target.value)} className="w-auto">
            <option value="structure">Estrutura / galeria</option><option value="hero">Imagem principal (topo)</option>
          </Select>
          <ImageUpload purpose="gallery" label="Adicionar foto" extra={{ section }} />
        </div>
      )}
      {items.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma foto. Use fotos reais do studio, com autorização de quem aparece.</p> : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {items.map((g) => (
            <figure key={g.id} className="relative overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.url} alt={g.caption ?? ''} className="aspect-[4/3] w-full object-cover" />
              <figcaption className="p-1.5 text-xs text-muted-foreground">{g.section === 'hero' ? 'Topo' : 'Galeria'}{g.caption ? ` · ${g.caption}` : ''}</figcaption>
              {canEdit && <Button size="icon-sm" variant="destructive" aria-label="Remover" className="absolute right-1 top-1" onClick={async () => { const r = await removeGalleryImage(g.id); if (r.ok) router.refresh(); else toast.error(r.error); }}><Trash2 /></Button>}
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
