import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import './App.css';
import Icon from './components/Icon';
import AuthorSearch from './components/AuthorSearch';
import PaperColumn from './components/PaperColumn';
import Timeline from './components/Timeline';
import useAuthor from './hooks/useAuthor';
import { compareWorks, sharedCollaborators } from './lib/compare';
import { useColorScheme, useThemePreference } from './lib/theme';
import { shortNames } from './lib/names';
const Analytics = lazy(() => import('./components/Analytics'));
const CollaborationNetwork = lazy(
  () => import('./components/CollaborationNetwork'),
);
const defaultAuthors = ['Filippo Menczer', 'Santo Fortunato'];
const tabs = [
  ['comparison', 'Papers'],
  ['analytics', 'Trends'],
  ['network', 'Network'],
];
const themes = [
  ['system', 'Match system', 'system'],
  ['light', 'Light', 'sun'],
  ['dark', 'Dark', 'moon'],
];
const shortId = (author) =>
  (author?.id || author?.short_id || '').split('/').pop();
const format = (number) => number.toLocaleString();
function readKey() {
  try {
    return sessionStorage.getItem('scipair-api-key') || '';
  } catch {
    return '';
  }
}

function ThemeSwitch() {
  const [preference, setPreference] = useThemePreference();
  const scheme = useColorScheme();
  useEffect(() => {
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((meta) =>
        meta.setAttribute('content', scheme === 'dark' ? '#131416' : '#fbfbfa'),
      );
  }, [scheme]);
  return (
    <div className="theme-switch" role="radiogroup" aria-label="Appearance">
      {themes.map(([value, label, icon]) => (
        <button
          key={value}
          role="radio"
          aria-checked={preference === value}
          aria-label={label}
          title={label}
          onClick={() => setPreference(value)}
        >
          <Icon name={icon} width="15" height="15" />
        </button>
      ))}
    </div>
  );
}

function AuthorHead({ side, state, works, apiKey }) {
  const years = works.map((work) => work.publication_year).filter(Boolean);
  const id = shortId(state.author);
  return (
    <div className={`author-head side-${side.toLowerCase()}`}>
      <AuthorSearch
        label={side}
        author={state.author}
        apiKey={apiKey}
        onSelect={state.load}
      />
      <p className="author-affil">
        {state.author?.hint ||
          (state.loading ? 'Finding author…' : 'Search for an author')}
      </p>
      <p className="author-facts">
        <span>
          <b>{format(works.length)}</b>{' '}
          {state.loading && state.total
            ? `of ${format(state.total)} papers`
            : 'papers'}
        </span>
        {years.length > 0 && (
          <span>
            {Math.min(...years)}–{Math.max(...years)}
          </span>
        )}
        {id && (
          <a
            href={`https://openalex.org/${id}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${state.author.display_name} on OpenAlex`}
          >
            OpenAlex <Icon name="arrow" width="11" height="11" />
          </a>
        )}
      </p>
    </div>
  );
}

export default function App() {
  const [apiKey, setApiKey] = useState(readKey);
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [settings, setSettings] = useState(false);
  const [tab, setTab] = useState('comparison');
  const [query, setQuery] = useState('');
  const [connectedOnly, setConnectedOnly] = useState(false);
  const [filters, setFilters] = useState(['all', 'all']);
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
  useEffect(() => {
    if (!shareStatus) return;
    const timer = setTimeout(() => setShareStatus(''), 2400);
    return () => clearTimeout(timer);
  }, [shareStatus]);
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
  const names = useMemo(
    () => shortNames([first.author, second.author]),
    [first.author, second.author],
  );
  const fullNames = [first, second].map(
    (state, index) => state.author?.display_name || names[index],
  );
  const setFilter = (index, value) =>
    setFilters((current) =>
      current.map((item, i) => (i === index ? value : item)),
    );
  const focus = (next) => {
    setFilters(next);
    setConnectedOnly(false);
    setQuery('');
    setTab('comparison');
    document
      .getElementById('workspace')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareStatus('Link copied');
    } catch {
      setShareStatus('Copy the URL from your address bar');
    }
  };
  const flows = [
    {
      key: 'ab',
      value: comparison.stats[0].citing,
      text: (
        <>
          papers by <em className="ink-a">{names[0]}</em> cite{' '}
          <em className="ink-b">{names[1]}</em>
        </>
      ),
      filters: ['citing', 'all'],
    },
    {
      key: 'ba',
      value: comparison.stats[1].citing,
      text: (
        <>
          papers by <em className="ink-b">{names[1]}</em> cite{' '}
          <em className="ink-a">{names[0]}</em>
        </>
      ),
      filters: ['all', 'citing'],
    },
    {
      key: 'both',
      value: comparison.stats[0].coauthored,
      text: 'papers written together',
      filters: ['coauthored', 'coauthored'],
    },
  ];
  return (
    <div className="app">
      <header className="topbar">
        <a href={window.location.pathname} className="wordmark">
          <span className="wordmark-glyph" aria-hidden="true">
            <i />
            <i />
          </span>
          SciPair
        </a>
        <span className="topbar-note">
          How two researchers’ work connects, from OpenAlex records
        </span>
        <nav className="topbar-actions">
          <ThemeSwitch />
          <button
            className="quiet-button"
            aria-expanded={settings}
            onClick={() => setSettings((value) => !value)}
          >
            {apiKey ? 'API key set' : 'API key'}
          </button>
          <a
            className="quiet-button"
            href="https://github.com/scipair/scipair.github.io"
            target="_blank"
            rel="noreferrer"
          >
            Source <Icon name="arrow" width="11" height="11" />
          </a>
        </nav>
      </header>
      {settings && (
        <form
          className="settings"
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
          <label htmlFor="api-key">OpenAlex API key</label>
          <input
            id="api-key"
            type="password"
            autoComplete="off"
            placeholder="Optional — raises the daily request limit"
            value={keyDraft}
            onChange={(event) => setKeyDraft(event.target.value)}
          />
          <button className="solid-button" type="submit">
            Save
          </button>
          <p>
            Kept for this browser session only.{' '}
            <a
              href="https://openalex.org/settings/api"
              target="_blank"
              rel="noreferrer"
            >
              Get a free key
            </a>
          </p>
        </form>
      )}
      <main>
        <div className="hero">
          <section className="pair" aria-label="Choose authors">
            <AuthorHead
              side="A"
              state={first}
              works={comparison.works[0]}
              apiKey={apiKey}
            />
            <div
              className={`exchange ${incomplete ? 'provisional' : ''}`}
              aria-label="How the two authors connect"
            >
              {flows.map((flow) => (
                <button
                  key={flow.key}
                  className={`flow flow-${flow.key}`}
                  disabled={!flow.value}
                  onClick={() => focus(flow.filters)}
                  title={flow.value ? 'Show these papers' : undefined}
                >
                  <span className="flow-value">{format(flow.value)}</span>
                  <span className="flow-line" aria-hidden="true" />
                  <span className="flow-text">{flow.text}</span>
                </button>
              ))}
            </div>
            <AuthorHead
              side="B"
              state={second}
              works={comparison.works[1]}
              apiKey={apiKey}
            />
          </section>
          <Timeline
          works={comparison.works}
          names={names}
          fullNames={fullNames}
        />
          <p className={`ledger ${incomplete ? 'provisional' : ''}`}>
            <span>
              <b>{format(comparison.unique)}</b> distinct papers
            </span>
            <span>
              <b>{format(comparison.citations)}</b> references between them
            </span>
            <span>
              <b>{format(shared.length)}</b> shared collaborators
            </span>
            {incomplete && <span className="muted">counts still loading</span>}
          </p>
        </div>
        <div className="viewbar" id="workspace">
          <nav className="tabs" aria-label="Explore comparison">
            {tabs.map(([id, title]) => (
              <button
                key={id}
                className={tab === id ? 'active' : ''}
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => setTab(id)}
              >
                {title}
              </button>
            ))}
          </nav>
          <span className="data-status" role="status">
            <span
              className={`dot ${loading ? 'dot-live' : incomplete ? 'dot-warn' : ''}`}
            />
            {loading
              ? 'Loading papers · results update live'
              : incomplete
                ? 'Partial data · retry to complete'
                : 'Comparison up to date'}
          </span>
          <button
            className="quiet-button"
            disabled={!first.author || !second.author}
            onClick={share}
          >
            <Icon name="link" width="14" height="14" />
            {shareStatus || 'Copy link'}
          </button>
          <span className="sr-only" role="status">
            {shareStatus}
          </span>
        </div>
        {tab === 'comparison' ? (
          <>
            <div className="toolbar">
              <label className="find">
                <Icon name="search" width="15" height="15" />
                <input
                  aria-label="Search publications"
                  placeholder="Filter both lists by title, venue or year"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button
                    type="button"
                    className="find-clear"
                    aria-label="Clear search"
                    onClick={() => setQuery('')}
                  >
                    ×
                  </button>
                )}
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={connectedOnly}
                  onChange={(event) => setConnectedOnly(event.target.checked)}
                />
                <span className="check-box" aria-hidden="true" />
                Connected papers only
              </label>
            </div>
            <div className="columns">
              {[first, second].map((state, index) => (
                <PaperColumn
                  key={'AB'[index]}
                  label={'AB'[index]}
                  names={index ? [names[1], names[0]] : names}
                  state={state}
                  works={comparison.works[index]}
                  stats={comparison.stats[index]}
                  query={query}
                  connectedOnly={connectedOnly}
                  filter={filters[index]}
                  onFilter={(value) => setFilter(index, value)}
                />
              ))}
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
                names={names}
                fullNames={fullNames}
              />
            ) : (
              <CollaborationNetwork
                authors={[first.author, second.author]}
                collaborators={[first.collaborators, second.collaborators]}
                shared={shared}
                coauthored={comparison.stats[0].coauthored}
                names={names}
                fullNames={fullNames}
              />
            )}
          </Suspense>
        )}
        <p className="note">
          {incomplete && (
            <strong>Counts are provisional while data is incomplete. </strong>
          )}
          OpenAlex may list several versions of the same work. Filters count
          papers; “references between them” counts individual citations, so a
          paper citing three of the other author’s works counts three times.
        </p>
      </main>
      <footer className="footer">
        <span>
          SciPair · by{' '}
          <a href="https://singhdan.me" target="_blank" rel="noreferrer">
            Danishjeet Singh
          </a>{' '}
          and{' '}
          <a
            href="https://filipinascimento.github.io"
            target="_blank"
            rel="noreferrer"
          >
            Filipi N. Silva
          </a>
        </span>
        <span>
          Data from{' '}
          <a href="https://openalex.org" target="_blank" rel="noreferrer">
            OpenAlex
          </a>
        </span>
      </footer>
    </div>
  );
}
