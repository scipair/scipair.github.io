import { lastName, shortNames } from './names';

const author = (display_name) => ({ display_name });

test('uses surnames when they differ', () => {
  expect(
    shortNames([author('Filippo Menczer'), author('Santo Fortunato')]),
  ).toEqual(['Menczer', 'Fortunato']);
});

test('adds a first initial when surnames match, ignoring case and accents', () => {
  expect(
    shortNames([author('Filipi N. Silva'), author('Márcia SILVA')]),
  ).toEqual(['Silva, F.', 'SILVA, M.']);
  expect(shortNames([author('José Núñez'), author('Ana Nunez')])).toEqual([
    'Núñez, J.',
    'Nunez, A.',
  ]);
});

test('skips generational and degree suffixes', () => {
  expect(lastName('Martin Luther King Jr.')).toBe('King');
  expect(lastName('John Smith III')).toBe('Smith');
});

test('falls back to side labels without an author', () => {
  expect(shortNames([null, author('Santo Fortunato')])).toEqual([
    'Author A',
    'Fortunato',
  ]);
});
