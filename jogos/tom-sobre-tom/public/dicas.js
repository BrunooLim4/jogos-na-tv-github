// Confere a dica de quem dá a dica (usado pelo celular, para avisar na hora, e
// pelo servidor, que é quem decide). Regras do jogo original:
// - 1ª dica: 1 palavra; 2ª dica: até 2 palavras;
// - não vale nome de cor comum ("azul", "verde"...) — mas vale "lavanda", "dourado";
// - não vale letra nem número do tabuleiro ("C12").
// (A 3ª regra, "não vale apontar para coisas da sala", não dá para conferir.)

export const MAX_CUE_LENGTH = 30;

// Cores comuns em português, com plural, feminino e "-ado"/"-inho" (azulado, rosinha).
const BASIC_COLORS = [
  /^a?vermelh/,
  /^azu(l|is|lad|lzinh)/,
  /^(es)?verd(e|es|inh|ead)/,
  /^amarel/,
  /^a?laranj/,
  /^(ar)?rox/,
  /^ros(a|as|ad[oa]s?|inh[oa]s?)$/,
  /^a?marr(om|ons|onzad)/,
  /^a?cinz(a|as|ent)/,
  /^pret(o|a|os|as|inh[oa]s?)$/,
  /^(branc(o|a|os|as)|branquinh|esbranqui)/,
];

const plain = word => word.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Devolve { ok: true, text } com a dica arrumada, ou { ok: false, error }.
export function checkCue(raw, maxWords) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, error: 'Escreva a dica (ou toque em "Vou falar em voz alta").' };
  if (text.length > MAX_CUE_LENGTH) return { ok: false, error: 'Dica comprida demais.' };
  const words = text.split(' ');
  if (words.length > maxWords) {
    return { ok: false, error: maxWords === 1 ? 'A 1ª dica é uma palavra só.' : 'A 2ª dica tem no máximo 2 palavras.' };
  }
  for (const word of words.map(plain)) {
    if (/\d/.test(word) || /^[a-p]$/.test(word)) return { ok: false, error: 'Não vale letra nem número do tabuleiro.' };
    if (BASIC_COLORS.some(re => re.test(word))) {
      return { ok: false, error: 'Não vale nome de cor comum (como "azul"). Diga uma coisa dessa cor: "céu", "tomate"…' };
    }
  }
  return { ok: true, text };
}
