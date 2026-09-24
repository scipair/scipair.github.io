const SUFFIXES = /^(jr|sr|ii|iii|iv|phd|md)\.?$/i;
const fold = (text) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function parts(name) {
  const words = String(name || '')
    .replace(/,/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 1 && SUFFIXES.test(words[words.length - 1]))
    words.pop();
  return words;
}

// Last word of the display name. Multi-word surnames ("van der Berg") keep
// only their final word; the side colours still tell the two authors apart.
export function lastName(name) {
  const words = parts(name);
  return words[words.length - 1] || '';
}

// Short labels for the two compared authors: surnames, plus a first initial
// when the surnames would otherwise be identical.
export function shortNames(authors) {
  const full = authors.map((author) => author?.display_name || '');
  const last = full.map(lastName);
  const clash = last[0] && last[1] && fold(last[0]) === fold(last[1]);
  return last.map((surname, index) => {
    if (!surname) return `Author ${'AB'[index]}`;
    if (!clash) return surname;
    const first = parts(full[index])[0];
    return parts(full[index]).length > 1 ? `${surname}, ${first[0]}.` : surname;
  });
}
