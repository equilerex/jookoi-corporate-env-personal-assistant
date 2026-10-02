// Tokenizing for the search index. Tokens are found on the ORIGINAL text so every token keeps exact
// start and end offsets (used for snippet highlighting and phrase positions). Folding happens per
// token afterwards, because folding the whole text first would shift offsets (a decomposed `ä` is
// two code units).
const TOKEN_RE = /[\p{L}\p{N}\p{M}]+/gu;

/** Lowercases and strips diacritics, so `Õpetaja` and `opetaja` are the same term. */
export const fold = (word) => word.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

/** Tokens of `text` as `{ term, start, end, pos }`. `pos` is the index in the token stream. */
export function tokenize(text) {
  const tokens = [];
  for (const match of text.matchAll(TOKEN_RE)) {
    const term = fold(match[0]);
    if (!term) continue;
    tokens.push({ term, start: match.index, end: match.index + match[0].length, pos: tokens.length });
  }
  return tokens;
}

/** `#` headings outside fenced code blocks, with the offset where each heading text starts. */
export function extractHeadings(text) {
  const headings = [];
  let fence = null;
  let offset = 0;
  for (const line of text.split('\n')) {
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = null;
    } else if (!fence) {
      const match = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (match && match[2]) headings.push({ level: match[1].length, text: match[2], offset: offset + line.indexOf(match[2]) });
    }
    offset += line.length + 1;
  }
  return headings;
}
