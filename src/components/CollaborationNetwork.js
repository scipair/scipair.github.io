import React, { useEffect, useRef } from 'react';
import { Network } from 'vis-network';
const palette = ['#246b59', '#bd703c'];
export default function CollaborationNetwork({
  authors,
  collaborators,
  shared,
  coauthored,
}) {
  const container = useRef(null);
  useEffect(() => {
    if (!container.current || !authors.every(Boolean)) return;
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
        size: 26,
        font: { size: 15, color: '#233c33' },
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
          color: sharedIds.has(author.id)
            ? '#a895c1'
            : index === 0
              ? '#a8c9ba'
              : '#e3bc9d',
          size: Math.min(21, 8 + Math.sqrt(author.publication_count) * 2),
        });
        edges.push({
          from: authorIds[index],
          to: author.id,
          width: Math.min(5, 1 + Math.sqrt(author.publication_count) / 2),
          color: '#cdd8d0',
        });
      }),
    );
    if (coauthored && authorIds[0] !== authorIds[1])
      edges.push({
        from: authorIds[0],
        to: authorIds[1],
        width: 4,
        color: '#a895c1',
        label: `${coauthored} shared papers`,
      });
    const network = new Network(
      container.current,
      { nodes: [...nodes.values()], edges },
      {
        nodes: {
          shape: 'dot',
          borderWidth: 0,
          font: { face: 'system-ui', size: 12, color: '#4e5a53' },
        },
        edges: { smooth: false, font: { size: 11, color: '#657269' } },
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
  }, [authors, collaborators, shared, coauthored]);
  return (
    <section className="panel network-panel">
      <div className="network-heading">
        <div>
          <span className="eyebrow">THE WIDER RESEARCH COMMUNITY</span>
          <h2>Collaboration network</h2>
          <p>
            Explore the strongest collaborators and the people connecting both
            authors. Drag to explore.
          </p>
        </div>
        <div className="network-legend">
          <span>
            <i style={{ background: palette[0] }} />
            Author A
          </span>
          <span>
            <i style={{ background: palette[1] }} />
            Author B
          </span>
          <span>
            <i style={{ background: '#a895c1' }} />
            Shared
          </span>
        </div>
      </div>
      {authors.every(Boolean) ? (
        <div
          ref={container}
          className="network-canvas"
          role="region"
          tabIndex="0"
          aria-label="Interactive collaboration network. Use arrow keys to move and plus or minus to zoom."
        />
      ) : (
        <div className="empty-state">
          Select two authors to see their collaborators.
        </div>
      )}
      <div className="shared-list">
        <h3>
          Shared collaborators <span>{shared.length}</span>
        </h3>
        {shared.length ? (
          <div>
            {shared.slice(0, 12).map((person) => (
              <a
                href={person.id}
                target="_blank"
                rel="noreferrer"
                key={person.id}
              >
                {person.name}
                <span>{person.total} collaborations</span>
              </a>
            ))}
          </div>
        ) : (
          <p>No shared collaborators in the records loaded so far.</p>
        )}
      </div>
    </section>
  );
}
