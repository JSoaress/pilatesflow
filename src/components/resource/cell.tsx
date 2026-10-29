import * as React from 'react';
import { Badge, statusVariant } from '@/components/ui/badge';
import { money, date, dateTime, percent, number } from '@/lib/format';
import type { FieldDef, Option } from '@/lib/resources/types';

/** Formata o valor de uma célula conforme o tipo do campo. */
export function Cell({ f, value, options, tz }: { f: FieldDef; value: unknown; options?: Option[]; tz: string }) {
  if (value === null || value === undefined || value === '') return <span className="text-muted-foreground">—</span>;
  switch (f.type) {
    case 'money': return <span className="tabular-nums">{money(value as number)}</span>;
    case 'percent': return <span className="tabular-nums">{percent(value as number)}</span>;
    case 'number': return <span className="tabular-nums">{number(value as number, 2)}</span>;
    case 'date': return <>{date(String(value))}</>;
    case 'datetime': return <>{dateTime(String(value), tz)}</>;
    case 'boolean': return value ? <Badge variant="success">Sim</Badge> : <Badge variant="neutral">Não</Badge>;
    case 'color': return <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full border" style={{ background: String(value) }} />{String(value)}</span>;
    case 'select': {
      const label = f.options?.find((o) => o.value === value)?.label ?? String(value);
      const v = statusVariant[String(value)];
      return ['status', 'stage', 'priority'].includes(f.name) && v ? <Badge variant={v}>{label}</Badge> : <>{label}</>;
    }
    case 'ref': return <>{options?.find((o) => o.value === value)?.label ?? '—'}</>;
    case 'multiref': return <>{(value as string[]).map((id) => options?.find((o) => o.value === id)?.label).filter(Boolean).join(', ') || '—'}</>;
    case 'tags': return <>{(value as string[]).join(', ')}</>;
    case 'hours': return <>Configurado</>;
    default: return <span className="line-clamp-2">{String(value)}</span>;
  }
}
