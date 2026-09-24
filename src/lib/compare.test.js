import { compareWorks, sharedCollaborators } from './compare';
const paper = (id, refs = []) => ({
  id,
  title: id,
  publication_year: 2025,
  referenced_works: refs,
});

test('matches directed citations and shared papers without mutating source data', () => {
  const a = [paper('a', ['b', 'b']), paper('shared', ['b'])];
  const b = [paper('b', ['a']), paper('shared', ['b'])];
  const result = compareWorks(a, b);
  expect(result.citations).toBe(3);
  expect(result.unique).toBe(3);
  expect(result.stats[0]).toEqual({
    all: 2,
    citing: 2,
    cited: 1,
    coauthored: 1,
  });
  expect(result.works[1].find((w) => w.id === 'b')).toMatchObject({
    citing: true,
    cited: true,
  });
  expect(a[0].citing).toBeUndefined();
});

test('empty authors and same-sized replacement records are compared correctly', () => {
  expect(compareWorks([], [paper('a')]).stats[0].all).toBe(0);
  expect(compareWorks([paper('a', ['b'])], [paper('b')]).citations).toBe(1);
  expect(compareWorks([paper('a', ['b'])], [paper('c')]).citations).toBe(0);
});

test('shared collaborators exclude the compared authors', () => {
  const authors = [
    { id: 'a', publication_count: 3 },
    { id: 'c', publication_count: 2 },
  ];
  expect(sharedCollaborators(authors, authors, ['a']).map((a) => a.id)).toEqual(
    ['c'],
  );
});
