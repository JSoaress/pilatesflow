/** @type {import('next').NextConfig} */
const supabaseHost = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').host; } catch { return ''; }
})();

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig = {
  poweredByHeader: false,
  // O build checa os tipos (TypeScript). O lint de estilo roda à parte com `npm run lint` e não bloqueia o build.
  eslint: { ignoreDuringBuilds: true },
  // bibliotecas de servidor que não devem ser empacotadas (evita aviso do Turbopack sobre fstream/rimraf)
  serverExternalPackages: ['exceljs', 'pdf-lib'],
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: '26mb' },
    // importa só os ícones/funções usados (compilação e carregamento mais rápidos)
    optimizePackageImports: ['lucide-react', 'recharts', 'date-fns', '@date-fns/tz'],
  },
  images: {
    remotePatterns: supabaseHost ? [{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }] : [],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/' }] },
    ];
  },
};

export default nextConfig;
