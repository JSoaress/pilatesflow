// Valor por extenso em português (reais e centavos) para recibos.
const U = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const D = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const C = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function ate999(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100), r = n % 100;
  const parts: string[] = [];
  if (c) parts.push(C[c]);
  if (r) {
    if (r < 20) parts.push(U[r]);
    else { const d = Math.floor(r / 10), u = r % 10; parts.push(u ? `${D[d]} e ${U[u]}` : D[d]); }
  }
  return parts.join(' e ');
}

function inteiro(n: number): string {
  if (n === 0) return 'zero';
  const groups: [number, string, string][] = [[1_000_000_000, 'bilhão', 'bilhões'], [1_000_000, 'milhão', 'milhões'], [1000, 'mil', 'mil'], [1, '', '']];
  const parts: string[] = [];
  let rest = n;
  for (const [div, sing, plur] of groups) {
    const q = Math.floor(rest / div);
    rest %= div;
    if (!q) continue;
    if (div === 1000) parts.push(q === 1 ? 'mil' : `${ate999(q)} mil`);
    else if (div === 1) parts.push(ate999(q));
    else parts.push(`${ate999(q)} ${q === 1 ? sing : plur}`);
  }
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    const lastNum = n % 1000;
    if (lastNum < 100 || lastNum % 100 === 0) parts[parts.length - 1] = 'e ' + last;
  }
  return parts.join(' ').replace(/\s+/g, ' ');
}

export function valorPorExtenso(valor: number) {
  const cents = Math.round(valor * 100);
  const reais = Math.floor(cents / 100), cent = cents % 100;
  const r = reais ? `${inteiro(reais)} ${reais === 1 ? 'real' : 'reais'}` : '';
  const c = cent ? `${inteiro(cent)} ${cent === 1 ? 'centavo' : 'centavos'}` : '';
  const s = [r, c].filter(Boolean).join(' e ') || 'zero reais';
  return s.replace(/(milhão|milhões|bilhão|bilhões) (reais|real)$/, '$1 de $2');
}
