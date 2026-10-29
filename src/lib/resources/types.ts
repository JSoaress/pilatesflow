// Definições declarativas de cadastros (CRUD genérico). Somente dados — usadas
// no servidor (validação, colunas permitidas) e no cliente (formulários/tabelas).
export type FieldType =
  | 'text' | 'textarea' | 'richtext' | 'email' | 'phone' | 'cpf' | 'cnpj' | 'url' | 'color'
  | 'number' | 'int' | 'money' | 'percent' | 'date' | 'datetime' | 'time'
  | 'select' | 'boolean' | 'ref' | 'multiref' | 'tags' | 'hours';

export type Option = { value: string; label: string };

export type RefSource = {
  table: string;
  label: string;                 // coluna exibida
  where?: Record<string, string | boolean | null>;
  orderBy?: string;
  /** fonte especial: membros da equipe (usuários) */
  special?: 'members';
};

export type FieldDef = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: Option[];
  ref?: RefSource;
  /** multiref: tabela de junção */
  join?: { table: string; fk: string; refFk: string };
  hint?: string;
  placeholder?: string;
  list?: boolean;            // aparece na tabela
  full?: boolean;            // ocupa a linha inteira no formulário
  section?: string;          // agrupamento no formulário
  default?: string | number | boolean | null;
  min?: number;
  max?: number;
  maxLength?: number;
  readOnlyOnEdit?: boolean;
  hideInForm?: boolean;
};

export type ResourceDef = {
  key: string;
  table: string;
  title: string;            // plural
  singular: string;
  description?: string;
  perms: { view: string | string[]; create: string; edit: string; delete?: string };
  fields: FieldDef[];
  searchFields?: string[];
  orderBy?: { column: string; ascending?: boolean }[];
  softDelete?: boolean;       // tem deleted_at
  unitField?: string;         // coluna de unidade (preenchida com a unidade atual)
  parentField?: string;       // ex.: patient_id para sub-cadastros
  listFilter?: Record<string, string | boolean | null>;
  pageSize?: number;
  /** campos fixos de inserção */
  insertDefaults?: Record<string, string | number | boolean | null>;
  noDelete?: boolean;
  emptyText?: string;
};

export function opts(map: Record<string, string>): Option[] {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}
