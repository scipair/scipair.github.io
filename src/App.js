import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import './App.css';
import Icon from './components/Icon';
import AuthorSearch from './components/AuthorSearch';
import PaperColumn from './components/PaperColumn';
import useAuthor from './hooks/useAuthor';
import { compareWorks, sharedCollaborators } from './lib/compare';
const Analytics = lazy(() => import('./components/Analytics'));
const CollaborationNetwork = lazy(
  () => import('./components/CollaborationNetwork'),
);
const defaultAuthors = ['Filippo Menczer', 'Santo Fortunato'];
const tabs = [
  ['comparison', 'compare', 'Comparison'],
  ['analytics', 'chart', 'Analytics'],
  ['network', 'network', 'Network'],
];
const shortId = (author) =>
  (author?.id || author?.short_id || '').split('/').pop();
function readKey() {
  try {
    return sessionStorage.getItem('scipair-api-key') || '';
  } catch {
    return '';
  }
}

export default function App() {
  const [apiKey, setApiKey] = useState(readKey);
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [settings, setSettings] = useState(false);
  const [tab, setTab] = useState('comparison');
  const [query, setQuery] = useState('');
  const [connectedOnly, setConnectedOnly] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const first = useAuthor(apiKey);
  const second = useAuthor(apiKey);
  const loadFirst = first.load;
  const loadSecond = second.load;
  useEffect(() => {
    const loadPair = () => {
      const ids = window.location.hash.slice(1).split(';');
      const pair =
        ids.length === 2 && ids.every((id) => /^A\d+$/.test(id))
          ? ids
          : defaultAuthors;
      loadFirst(pair[0]);
      loadSecond(pair[1]);
    };
    loadPair();
    window.addEventListener('hashchange', loadPair);
    return () => window.removeEventListener('hashchange', loadPair);
  }, [loadFirst, loadSecond]);
  useEffect(() => {
    const a = shortId(first.author),
      b = shortId(second.author);
    if (a && b)
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}#${a};${b}`,
      );
  }, [first.author, second.author]);
  const comparison = useMemo(
    () => compareWorks(first.works, second.works),
    [first.works, second.works],
  );
  const shared = useMemo(
    () =>
      sharedCollaborators(first.collaborators, second.collaborators, [
        first.author?.id,
        second.author?.id,
      ]),
    [first.collaborators, second.collaborators, first.author, second.author],
  );
  const loading = first.loading || second.loading;
  const incomplete = loading || first.error || second.error;
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareStatus('Link copied');
    } catch {
      setShareStatus('Copy the URL from your address bar');
    }
  };
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <a
            href={window.location.pathname}
            className="brand"
            aria-label="SciPair home"
          >
            <span className="brand-mark">
              <i />
              <i />
              <i />
            </span>
            SciPair
            <span className="brand-divider" />
            <span className="brand-tagline">RESEARCH, CONNECTED</span>
          </a>
          <div className="header-actions">
            <a
              href="https://github.com/scipair/scipair"
              target="_blank"
              rel="noreferrer"
            >
              About the project <Icon name="arrow" width="14" height="14" />
            </a>
            <button
              className="icon-button"
              aria-label="OpenAlex settings"
              aria-expanded={settings}
              onClick={() => setSettings((value) => !value)}
            >
              <Icon name="settings" />
            </button>
          </div>
        </div>
      </header>
      <main>
        <div className="page-intro">
          <div>
            <div className="eyebrow">
              <span className="tiny-rule" /> THE SCIENCE OF CONNECTION
            </div>
            <h1>
              Discover the work
              <br className="mobile-break" /> between researchers.
            </h1>
            <p>
              Explore the papers, citations, and collaborations that connect two
              authors.
            </p>
          </div>
          <div className="source-label">
            <span className="status-dot" /> Powered by OpenAlex
          </div>
        </div>
        {settings && (
          <form
            className="settings-panel"
            onSubmit={(event) => {
              event.preventDefault();
              const value = keyDraft.trim();
              setApiKey(value);
              try {
                if (value) sessionStorage.setItem('scipair-api-key', value);
                else sessionStorage.removeItem('scipair-api-key');
              } catch {}
              setSettings(false);
            }}
          >
            <div>
              <label htmlFor="api-key">OpenAlex API key</label>
              <p>
                Use your key if OpenAlex requests authentication or a higher
                quota. Stored only for this browser session.{' '}
                <a
                  href="https://openalex.org/settings/api"
                  target="_blank"
                  rel="noreferrer"
                >
                  Get a free key ↗
                </a>
              </p>
            </div>
            <input
              id="api-key"
              type="password"
              autoComplete="off"
              placeholder="Paste your API key"
              value={keyDraft}
              onChange={(event) => setKeyDraft(event.target.value)}
            />
            <button className="primary-button" type="submit">
              Save & reload
            </button>
          </form>
        )}
        <section className="pair-builder" aria-label="Choose authors">
          <AuthorSearch
            label="A"
            author={first.author}
            apiKey={apiKey}
            onSelect={first.load}
          />
          <div className="pair-connector" aria-hidden="true">
            <Icon name="link" />
          </div>
          <AuthorSearch
            label="B"
            author={second.author}
            apiKey={apiKey}
            onSelect={second.load}
          />
          <div className="pair-action">
            <span>
              Two perspectives.
              <br />
              One bigger picture.
            </span>
            <button
              className="share-button"
              disabled={!first.author || !second.author}
              onClick={share}
            >
              <Icon name="link" width="16" height="16" /> Share comparison
            </button>
            <span className="sr-only" role="status">
              {shareStatus}
            </span>
          </div>
        </section>
        {shareStatus && (
          <p className="share-feedback" role="status">
            {shareStatus}
          </p>
        )}
        <section className="overview" aria-label="Comparison overview">
          {[
            [
              'book',
              comparison.unique,
              'Unique publications',
              'Across both authors',
            ],
            [
              'link',
              comparison.citations,
              'Citation connections',
              'Direct references between papers',
            ],
            [
              'compare',
              comparison.stats[0].coauthored,
              'Coauthored papers',
              'Research published together',
            ],
            [
              'network',
              shared.length,
              'Shared collaborators',
              'Researchers in both networks',
            ],
          ].map(([icon, value, label, detail]) => (
            <div className="metric" key={label}>
              <div className="metric-label">
                <span>{label}</span>
                <Icon name={icon} />
              </div>
              <strong>
                {value.toLocaleString()}
                {incomplete && (
                  <span
                    className="metric-pending"
                    title="Results are incomplete"
                  >
                    *
                  </span>
                )}
              </strong>
              <small>{detail}</small>
            </div>
          ))}
        </section>
        <div className="workspace-heading">
          <nav className="view-tabs" aria-label="Explore comparison">
            {tabs.map(([id, icon, title]) => (
              <button
                key={id}
                className={tab === id ? 'active' : ''}
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => setTab(id)}
              >
                <Icon name={icon} width="17" height="17" />
                {title}
              </button>
            ))}
          </nav>
          <span className="data-status" role="status">
            <span className={`status-dot ${loading ? 'pulse' : ''}`} />
            {loading
              ? 'Loading papers · results update live'
              : incomplete
                ? 'Partial data · retry to complete'
                : 'Comparison up to date'}
          </span>
        </div>
        {tab === 'comparison' ? (
          <>
            <div className="comparison-toolbar">
              <div className="publication-search">
                <Icon name="search" width="17" height="17" />
                <input
                  aria-label="Search publications"
                  placeholder="Find a publication, venue, or year…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={connectedOnly}
                  onChange={(event) => setConnectedOnly(event.target.checked)}
                />
                <span className="toggle-track" />
                Connected papers only
              </label>
            </div>
            <div className="paper-columns">
              <PaperColumn
                label="A"
                state={first}
                works={comparison.works[0]}
                stats={comparison.stats[0]}
                query={query}
                connectedOnly={connectedOnly}
              />
              <PaperColumn
                label="B"
                state={second}
                works={comparison.works[1]}
                stats={comparison.stats[1]}
                query={query}
                connectedOnly={connectedOnly}
              />
            </div>
          </>
        ) : (
          <Suspense
            fallback={
              <div className="view-loading" role="status">
                Loading visualization…
              </div>
            }
          >
            {tab === 'analytics' ? (
              <Analytics
                works={comparison.works}
                authors={[first.author, second.author]}
              />
            ) : (
              <CollaborationNetwork
                authors={[first.author, second.author]}
                collaborators={[first.collaborators, second.collaborators]}
                shared={shared}
                coauthored={comparison.stats[0].coauthored}
              />
            )}
          </Suspense>
        )}
        <div className="data-note">
          <span className="info-symbol">i</span>
          <p>
            {incomplete && (
              <strong>Counts are provisional while data is incomplete. </strong>
            )}
            Publication records come from OpenAlex and may include multiple
            versions of a work. Relationship filters count papers; citation
            connections count references.
          </p>
        </div>
      </main>
      <footer>
        <a className="footer-brand" href={window.location.pathname}>
          SciPair
        </a>
        <span>Made for a more connected understanding of science.</span>
        <p>
          By{' '}
          <a href="https://singhdan.me" target="_blank" rel="noreferrer">
            Danishjeet Singh
          </a>{' '}
          &{' '}
          <a
            href="https://filipinascimento.github.io"
            target="_blank"
            rel="noreferrer"
          >
            Filipi N. Silva
          </a>
        </p>
      </footer>
    </div>
  );
}
