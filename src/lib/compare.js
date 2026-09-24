export function compareWorks(first = [], second = []) {
  const maps = [first, second].map(
    (works) =>
      new Map(
        works.map((work) => [
          work.id,
          {
            ...work,
            citing: false,
            cited: false,
            coauthored: false,
          },
        ]),
      ),
  );
  const links = new Set();
  maps.forEach((own, index) => {
    const other = maps[1 - index];
    own.forEach((work) => {
      work.coauthored = other.has(work.id);
      new Set(work.referenced_works).forEach((id) => {
        if (id === work.id || !other.has(id)) return;
        work.citing = true;
        other.get(id).cited = true;
        links.add(`${work.id}>${id}`);
      });
    });
  });
  const works = maps.map((map) =>
    [...map.values()].sort(
      (a, b) =>
        (b.publication_year || 0) - (a.publication_year || 0) ||
        a.title.localeCompare(b.title),
    ),
  );
  const stats = works.map((list) => ({
    all: list.length,
    citing: list.filter((work) => work.citing).length,
    cited: list.filter((work) => work.cited).length,
    coauthored: list.filter((work) => work.coauthored).length,
  }));
  return {
    works,
    stats,
    citations: links.size,
    unique: new Set([...maps[0].keys(), ...maps[1].keys()]).size,
  };
}

export function sharedCollaborators(first = [], second = [], authorIds = []) {
  const other = new Map(second.map((author) => [author.id, author]));
  return first
    .filter((author) => other.has(author.id) && !authorIds.includes(author.id))
    .map((author) => ({
      ...author,
      total: author.publication_count + other.get(author.id).publication_count,
    }))
    .sort((a, b) => b.total - a.total);
}
