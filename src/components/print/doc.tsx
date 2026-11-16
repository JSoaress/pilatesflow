import type { PrintOrg } from '@/lib/print';

/** Folha A4 com cabeçalho da clínica. Na tela aparece como papel; na impressão, sem margens extras. */
export function PrintSheet({ org, title, subtitle, children, confidential, footerNote }: { org: PrintOrg; title: string; subtitle?: React.ReactNode; children: React.ReactNode; confidential?: boolean; footerNote?: string }) {
  return (
    <article className="print-sheet mx-auto my-6 max-w-[210mm] bg-white px-[16mm] py-[14mm] text-[11pt] leading-snug text-black shadow-lift print:my-0 print:max-w-none print:px-0 print:py-0 print:shadow-none">
      <header className="flex items-start gap-4 border-b-2 border-[#2F6B5A] pb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {org.logo && <img src={org.logo} alt="" className="h-14 w-auto max-w-[40mm] object-contain" />}
        <div className="min-w-0 flex-1">
          <p className="text-[13pt] font-semibold">{org.name}</p>
          <p className="text-[8.5pt] text-neutral-600">
            {[org.legal_name, org.cnpj && `CNPJ ${org.cnpj}`].filter(Boolean).join(' · ')}
            {org.address && <><br />{org.address}</>}
            {(org.phone || org.email) && <><br />{[org.phone, org.email].filter(Boolean).join(' · ')}</>}
          </p>
        </div>
        {confidential && <p className="rounded border border-red-700 px-2 py-0.5 text-[8pt] font-semibold uppercase tracking-wide text-red-700">Confidencial</p>}
      </header>
      <div className="mt-4">
        <h1 className="text-[15pt] font-semibold">{title}</h1>
        {subtitle && <div className="mt-0.5 text-[9.5pt] text-neutral-700">{subtitle}</div>}
      </div>
      <div className="mt-4 space-y-5">{children}</div>
      <footer className="mt-8 border-t pt-2 text-[7.5pt] text-neutral-500">
        {confidential && <p>Documento com dados pessoais de saúde, protegido pelo sigilo profissional e pela LGPD (Lei 13.709/2018). Uso restrito ao paciente e aos profissionais responsáveis.</p>}
        {footerNote && <p>{footerNote}</p>}
        <p>Emitido em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date())} · {org.name}</p>
      </footer>
    </article>
  );
}

export function PrintSection({ title, children, breakBefore }: { title: string; children: React.ReactNode; breakBefore?: boolean }) {
  return (
    <section className={breakBefore ? 'print-break-before' : undefined}>
      <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[11.5pt] font-semibold uppercase tracking-wide text-[#2F6B5A]">{title}</h2>
      {children}
    </section>
  );
}

export function PrintFields({ items, cols = 1 }: { items: [string, React.ReactNode][]; cols?: 1 | 2 | 3 }) {
  const filled = items.filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (!filled.length) return <p className="text-[9.5pt] italic text-neutral-500">Sem registros.</p>;
  return (
    <dl className={cols === 1 ? 'space-y-2' : cols === 2 ? 'grid grid-cols-2 gap-x-6 gap-y-2' : 'grid grid-cols-3 gap-x-6 gap-y-2'}>
      {filled.map(([k, v]) => (
        <div key={k} className="avoid-break">
          <dt className="text-[8.5pt] font-medium uppercase tracking-wide text-neutral-500">{k}</dt>
          <dd className="whitespace-pre-wrap">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SignatureLine({ name, detail }: { name: string; detail?: string | null }) {
  return (
    <div className="avoid-break mt-10 w-[75mm] text-center text-[9pt]">
      <div className="border-t border-black pt-1">{name}</div>
      {detail && <div className="text-neutral-600">{detail}</div>}
    </div>
  );
}
