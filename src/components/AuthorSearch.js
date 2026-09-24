import React, { useEffect, useRef, useState } from 'react';
import { searchAuthors } from '../lib/openalex';
import Icon from './Icon';

export default function AuthorSearch({ author, label, apiKey, onSelect }) {
  const [query, setQuery] = useState(author?.display_name || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState('');
  const input = useRef(null);
  const listId = `authors-${label}`;
  useEffect(() => {
    setQuery(author?.display_name || '');
    setOpen(false);
  }, [author]);
  useEffect(() => {
    setResults([]);
    setActive(-1);
    setStatus('');
    if (!open || query.trim().length < 2 || query === author?.display_name)
      return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus('Searching…');
      try {
        const items = await searchAuthors(query.trim(), {
          signal: controller.signal,
          apiKey,
        });
        if (!controller.signal.aborted) {
          setResults(items);
          setStatus(items.length ? '' : 'No authors found. Try another name.');
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setStatus(error.message || 'Search failed. Please try again.');
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open, author, apiKey]);
  const select = (item) => {
    setOpen(false);
    setResults([]);
    setQuery(item.display_name);
    onSelect(item);
  };
  return (
    <div
      className="author-search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setQuery(author?.display_name || '');
        }
      }}
    >
      <label className="side-tag" htmlFor={`search-${label}`}>
        Author {label}
      </label>
      <div className="name-field">
        <input
          ref={input}
          id={`search-${label}`}
          role="combobox"
          autoComplete="off"
          spellCheck="false"
          placeholder="Search an author…"
          value={query}
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            active >= 0 ? `${listId}-${active}` : undefined
          }
          onFocus={(event) => {
            setOpen(true);
            event.target.select();
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
              setQuery(author?.display_name || '');
              event.target.blur();
              return;
            }
            if (!results.length || !open) return;
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((value) => (value + 1) % results.length);
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive(
                (value) => (value - 1 + results.length) % results.length,
              );
            }
            if (event.key === 'Enter' && active >= 0) {
              event.preventDefault();
              select(results[active]);
            }
          }}
        />
        <Icon name="search" width="16" height="16" className="name-field-icon" />
      </div>
      {open && (results.length > 0 || status) && (
        <div className="search-popover">
          {status && <p role="status">{status}</p>}
          <ul id={listId} role="listbox" aria-label={`Author ${label} results`}>
            {results.map((item, index) => (
              <li
                key={item.id || item.short_id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={index === active ? 'is-focused' : ''}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(item)}
              >
                <strong>{item.display_name}</strong>
                <span>{item.hint || 'Institution unavailable'}</span>
                {item.works_count > 0 && (
                  <small>{item.works_count.toLocaleString()} works</small>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
