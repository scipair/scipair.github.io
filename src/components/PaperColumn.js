import React, { useEffect, useMemo, useState } from 'react';
import Icon from './Icon';
const filters = [
  ['all', 'All papers'],
  ['citing', 'Citing'],
  ['cited', 'Cited by'],
  ['coauthored', 'Coauthored'],
];
const format = (number) => number.toLocaleString();

export default function PaperColumn({
  label,
  state,
  works,
  stats,
  query,
  connectedOnly,
}) {
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(25);
  useEffect(() => {
    setLimit(25);
  }, [filter, query, connectedOnly, state.author?.id, state.author?.short_id]);
  useEffect(() => {
    setFilter('all');
  }, [state.author?.id, state.author?.short_id]);
  const filtered = useMemo(
    () =>
      works.filter(
        (work) =>
          (filter === 'all' || work[filter]) &&
          (!connectedOnly || work.citing || work.cited || work.coauthored) &&
          (!query ||
            `${work.title} ${work.venue} ${work.publication_year || ''}`
              .toLowerCase()
              .includes(query.toLowerCase())),
      ),
    [works, filter, connectedOnly, query],
  );
  const other = label === 'A' ? 'B' : 'A';
  const name = state.author?.display_name || `Author ${label}`;
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('');
  const years = works.map((work) => work.publication_year).filter(Boolean);
  return (
    <section
      className={`paper-column column-${label.toLowerCase()}`}
      aria-label={`${name} publications`}
    >
      <div className="author-profile">
        <div className="avatar">{initials}</div>
        <div className="author-detail">
          <span className="eyebrow">AUTHOR {label}</span>
          <h2>{name}</h2>
          <p>
            {state.author?.hint ||
              (state.loading ? 'Finding author…' : 'Select an author to begin')}
          </p>
        </div>
        {state.author && (
          <a
            className="icon-button profile-link"
            href={`https://openalex.org/${(state.author.id || state.author.short_id).split('/').pop()}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${name} on OpenAlex`}
          >
            <Icon name="arrow" />
          </a>
        )}
      </div>
      <div className="author-meta">
        <span>
          <strong>{format(works.length)}</strong> papers
          {state.loading || state.error ? ' loaded' : ''}
        </span>
        <span>
          {years.length
            ? `${Math.min(...years)} – ${Math.max(...years)}`
            : 'Publication history'}
        </span>
      </div>
      <div
        className="paper-filters"
        aria-label={`Filter author ${label} papers`}
      >
        {filters.map(([key, text]) => (
          <button
            key={key}
            className={filter === key ? 'selected' : ''}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {text}
            {key === 'citing' || key === 'cited' ? ` ${other}` : ''}
            <span>{format(stats[key])}</span>
          </button>
        ))}
      </div>
      {state.loading && (
        <div className="loading-progress" role="status">
          <span className="status-dot pulse" />
          {state.loaded
            ? `${format(state.loaded)}${state.total ? ` of ${format(state.total)}` : ''} papers loaded`
            : 'Loading publications…'}
          <span>Updating live</span>
        </div>
      )}
      {state.error && (
        <div className="error-message" role="alert">
          <p>{state.error}</p>
          {works.length > 0 && (
            <p>Showing partial results. Relationship counts are incomplete.</p>
          )}
          <button className="text-button" onClick={state.retry}>
            Try again
          </button>
        </div>
      )}
      <div className="paper-list">
        {state.loading && !works.length
          ? [0, 1, 2, 3].map((value) => (
              <div className="paper-skeleton" key={value}>
                <i />
                <i />
                <i />
              </div>
            ))
          : filtered.slice(0, limit).map((work) => (
              <article className="paper" key={work.id}>
                <div className="paper-topline">
                  <span>{work.publication_year || 'Undated'}</span>
                  <div className="paper-badges">
                    {work.coauthored && (
                      <span className="badge coauthored">Coauthored</span>
                    )}
                    {work.citing && (
                      <span className="badge citing">↗ Citing {other}</span>
                    )}
                    {work.cited && (
                      <span className="badge cited">↙ Cited by {other}</span>
                    )}
                  </div>
                </div>
                <a
                  className="paper-title"
                  href={
                    /^https?:\/\//i.test(work.url || '') ? work.url : work.id
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  {work.title}
                  <Icon name="arrow" width="14" height="14" />
                </a>
                <p className="paper-venue">{work.venue}</p>
              </article>
            ))}
        {!state.loading && !filtered.length && (
          <div className="empty-state">
            <Icon name="book" />
            <h3>
              {works.length ? 'No matching papers' : 'No publications to show'}
            </h3>
            <p>
              {works.length
                ? 'Try another search or relationship filter.'
                : state.error
                  ? 'Retry loading this author to continue.'
                  : 'Choose an author above to explore their work.'}
            </p>
          </div>
        )}
      </div>
      {filtered.length > 0 && (
        <div className="list-footer">
          <span>
            Showing {format(Math.min(limit, filtered.length))} of{' '}
            {format(filtered.length)} papers
          </span>
          {limit < filtered.length && (
            <button
              className="text-button"
              onClick={() => setLimit((count) => count + 25)}
            >
              Load 25 more <span aria-hidden="true">↓</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}
