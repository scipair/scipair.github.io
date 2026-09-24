import React, { useEffect, useMemo, useState } from 'react';
import Icon from './Icon';
const format = (number) => number.toLocaleString();

export default function PaperColumn({
  label,
  names,
  state,
  works,
  stats,
  query,
  connectedOnly,
  filter,
  onFilter,
}) {
  const [limit, setLimit] = useState(25);
  const authorKey = state.author?.id || state.author?.short_id;
  useEffect(() => {
    setLimit(25);
  }, [filter, query, connectedOnly, authorKey]);
  useEffect(() => {
    onFilter('all');
    // Reset only when the author changes, not when the parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorKey]);
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
  const other = names[1];
  const otherSide = label === 'A' ? 'b' : 'a';
  const name = state.author?.display_name || `Author ${label}`;
  const filters = [
    ['all', 'All'],
    ['citing', `Cites ${other}`],
    ['cited', `Cited by ${other}`],
    ['coauthored', 'Coauthored'],
  ];
  let lastYear = null;
  return (
    <section
      className={`column column-${label.toLowerCase()}`}
      aria-label={`${name} publications`}
    >
      <header className="column-head">
        <h2>
          <span className="side-dot" aria-hidden="true" />
          {name}
        </h2>
        <div className="segments" aria-label={`Filter author ${label} papers`}>
          {filters.map(([key, text]) => (
            <button
              key={key}
              className={filter === key ? 'selected' : ''}
              aria-pressed={filter === key}
              onClick={() => onFilter(key)}
            >
              {text}
              <span>{format(stats[key])}</span>
            </button>
          ))}
        </div>
      </header>
      {state.loading && (
        <div className="progress" role="status">
          <span className="progress-text">
            {state.loaded
              ? `${format(state.loaded)}${state.total ? ` of ${format(state.total)}` : ''} papers loaded`
              : 'Loading publications…'}
          </span>
          <span className="progress-bar" aria-hidden="true">
            <i
              style={{
                width: state.total
                  ? `${Math.min(100, (state.loaded / state.total) * 100)}%`
                  : '12%',
              }}
            />
          </span>
        </div>
      )}
      {state.error && (
        <div className="error" role="alert">
          <p>
            <strong>{state.error}</strong>
            {works.length > 0 &&
              ' Showing partial results; relationship counts are incomplete.'}
          </p>
          <button className="quiet-button" onClick={state.retry}>
            Try again
          </button>
        </div>
      )}
      <div className="papers">
        {state.loading && !works.length
          ? [0, 1, 2, 3, 4].map((value) => (
              <div className="paper-skeleton" key={value}>
                <i />
                <i />
              </div>
            ))
          : filtered.slice(0, limit).map((work) => {
              const year = work.publication_year || '—';
              const showYear = year !== lastYear;
              lastYear = year;
              return (
                <article
                  className={`paper ${showYear ? 'year-start' : ''}`}
                  key={work.id}
                >
                  <span className="paper-year" aria-hidden={!showYear}>
                    {showYear ? year : ''}
                  </span>
                  <div className="paper-body">
                    <a
                      className="paper-title"
                      href={
                        /^https?:\/\//i.test(work.url || '')
                          ? work.url
                          : work.id
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      {work.title}
                    </a>
                    <p className="paper-meta">
                      <span className="sr-only">
                        {work.publication_year || 'Undated'} ·{' '}
                      </span>
                      {work.venue}
                      {work.coauthored && (
                        <span className="tag tag-both">with {other}</span>
                      )}
                      {work.citing && (
                        <span className={`tag tag-${otherSide}`}>
                          cites {other}
                        </span>
                      )}
                      {work.cited && (
                        <span className={`tag tag-${otherSide}`}>
                          cited by {other}
                        </span>
                      )}
                    </p>
                  </div>
                </article>
              );
            })}
        {!state.loading && !filtered.length && (
          <div className="empty">
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
        <footer className="column-foot">
          <span>
            {format(Math.min(limit, filtered.length))} of{' '}
            {format(filtered.length)}
          </span>
          {limit < filtered.length && (
            <button
              className="quiet-button"
              onClick={() => setLimit((count) => count + 25)}
            >
              Load 25 more <Icon name="arrow" width="11" height="11" style={{ transform: 'rotate(135deg)' }} />
            </button>
          )}
        </footer>
      )}
    </section>
  );
}
