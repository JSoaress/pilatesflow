import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/app',
    name: env.appName,
    short_name: env.appName,
    description: 'Gestão de clínicas e studios de Pilates',
    lang: 'pt-BR',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],
    orientation: 'any',
    background_color: '#FAF8F5',
    theme_color: '#2F6B5A',
    categories: ['business', 'health', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Agenda', url: '/app/agenda', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Alunos', url: '/app/alunos', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Financeiro', url: '/app/financeiro', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Check-in', url: '/app/checkin', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
