import React, { useEffect, useRef } from 'react';
import { Network } from 'vis-network';
import { readTokens, useColorScheme } from '../lib/theme';
export default function CollaborationNetwork({
  authors,
  collaborators,
  shared,
  coauthored,
}) {
  const container = useRef(null);
  const scheme = useColorScheme();
  useEffect(() => {
    if (!container.current || !authors.every(Boolean)) return;
    const t = readTokens();
    const palette = [t.a, t.b];
    const font = t.sans.split(',')[0].replace(/'/g, '');
    const authorIds = authors.map(
      (author) =>
        author.id || `https://openalex.org/${author.short_id.split('/').pop()}`,
    );
    const sharedIds = new Set(shared.map((author) => author.id));
    const nodes = new Map();
    const edges = [];
    authors.forEach((author, index) =>
      nodes.set(authorIds[index], {
        id: authorIds[index],
        label: author.display_name,
        color: palette[index],
        size: 22,
        font: { size: 15, color: t.ink, face: font, strokeWidth: 4, strokeColor: t.surface },
      }),
    );
    // Limit physics/layout work while retaining the strongest shared connections.
    const chosen = new Set(
      [
        ...shared.slice(0, 12),
        ...collaborators.flatMap((list) =>
          [...list]
            .sort((a, b) => b.publication_count - a.publication_count)
            .slice(0, 15),
        ),
      ].map((author) => author.id),
    );
    collaborators.forEach((list, index) =>
      list.forEach((author) => {
        if (authorIds.includes(author.id) || !chosen.has(author.id)) return;
        nodes.set(author.id, {
          id: author.id,
          label: author.name,
          borderWidth: sharedIds.has(author.id) ? 0 : 1,
          color: sharedIds.has(author.id)
            ? { background: t.both, border: t.both }
            : {
                background: index === 0 ? t.aTint : t.bTint,
                border: palette[index],
              },
          size: Math.min(16, 5 + Math.sqrt(author.publication_count) * 1.6),
        });
        edges.push({
          from: authorIds[index],
          to: author.id,
          width: Math.min(4, 0.75 + Math.sqrt(author.publication_count) / 2.5),
          color: { color: t.ruleStrong, opacity: 0.9 },
        });
      }),
    );
    if (coauthored && authorIds[0] !== authorIds[1])
      edges.push({
        from: authorIds[0],
        to: authorIds[1],
        width: 3,
        color: t.both,
        label: `${coauthored} shared papers`,
      });
    const network = new Network(
      container.current,
      { nodes: [...nodes.values()], edges },
      {
        nodes: {
          shape: 'dot',
          borderWidth: 0,
          font: { face: font, size: 11, color: t.ink2, strokeWidth: 3, strokeColor: t.surface },
        },
        edges: {
          smooth: false,
          font: { face: font, size: 11, color: t.both, strokeWidth: 4, strokeColor: t.surface },
        },
        physics: {
          stabilization: { iterations: 100 },
          barnesHut: { gravitationalConstant: -4500, springLength: 160 },
        },
        interaction: {
          hover: true,
          keyboard: { enabled: true, bindToWindow: false },
          zoomView: false,
        },
      },
    );
    network.once('stabilizationIterationsDone', () =>
      network.setOptions({ physics: false }),
    );
    return () => network.destroy();
  }, [authors, collaborators, shared, coauthored, scheme]);
  return (
    <section className="network">
      <header className="network-head">
        <div>
          <h2>Collaboration network</h2>
          <p>
            Each author’s 15 most frequent coauthors, plus the strongest
            collaborators they share. Drag nodes to rearrange.
          </p>
        </div>
        <div className="chart-legend">
          <span>
            <i className="bg-a" />
            {authors[0]?.display_name || 'Author A'}’s coauthors
          </span>
          <span>
            <i className="bg-b" />
            {authors[1]?.display_name || 'Author B'}’s coauthors
          </span>
          <span>
            <i className="bg-both" />
            Shared
          </span>
        </div>
      </header>
      {authors.every(Boolean) ? (
        <div
          ref={container}
          className="network-canvas"
          role="region"
          tabIndex="0"
          aria-label="Interactive collaboration network. Use arrow keys to move and plus or minus to zoom."
        />
      ) : (
        <div className="empty">
          <p>Select two authors to see their collaborators.</p>
        </div>
      )}
      <div className="shared">
        <h3>
          Shared collaborators <span>{shared.length}</span>
        </h3>
        {shared.length ? (
          <ol>
            {shared.slice(0, 12).map((person) => (
              <li key={person.id}>
                <a href={person.id} target="_blank" rel="noreferrer">
                  {person.name}
                </a>
                <span>{person.total} joint papers</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">
            No shared collaborators in the records loaded so far.
          </p>
        )}
      </div>
    </section>
  );
}
