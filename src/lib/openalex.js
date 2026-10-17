const API_ROOT = 'https://api.openalex.org';
const CACHE_PREFIX = 'scipair:openalex:works:';
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_MEMORY_CACHE_ENTRIES = 24;
const MAX_SESSION_CACHE_ENTRIES = 24;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 250;
const WORKS_PER_PAGE = 200;
// OpenAlex serves numbered pages without a key, but only up to 10,000 results;
// cursor paging has no limit but requires an API key.
const MAX_PAGED_RESULTS = 10_000;
const MAX_RETRY_AFTER_MS = 2_000;

const memoryCache = new Map();
const inFlightWorks = new Map();

function abortError() {
  const error = new Error('The OpenAlex request was aborted.');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function canonicalAuthorId(value) {
  const input = String(value || '').trim().replace(/\/$/, '');
  const match = input.match(/(?:^|\/)(A\d+)$/i);
  if (!match) return null;
  return `A${match[1].slice(1)}`;
}

function authorUrl(id) {
  return `https://openalex.org/${id}`;
}

function normaliseAuthor(raw) {
  const shortId = canonicalAuthorId(raw?.id || raw?.short_id);
  if (!shortId) return null;

  return {
    id: raw.id || authorUrl(shortId),
    short_id: shortId,
    display_name: String(raw.display_name || raw.name || '').trim(),
    hint: raw.hint || raw.last_known_institutions?.[0]?.display_name || 'Unknown Institution',
    works_count: raw.works_count ?? 0,
  };
}

function normaliseWork(raw) {
  const id = raw?.id;
  if (!id) return null;

  const location = raw.primary_location || {};
  return {
    id,
    title: String(raw.title ?? raw.display_name ?? 'Untitled').trim() || 'Untitled',
    publication_year: raw.publication_year ?? null,
    referenced_works: Array.isArray(raw.referenced_works)
      ? raw.referenced_works.filter((reference) => typeof reference === 'string' && reference.trim())
      : [],
    venue: location.source?.display_name?.trim() || 'Unknown Venue',
    url: location.landing_page_url || null,
  };
}

function addCollaborators(collaborators, work, mainAuthorId) {
  const mainId = authorUrl(mainAuthorId);
  const seenOnWork = new Set();
  (Array.isArray(work.authorships) ? work.authorships : []).forEach((authorship) => {
    const author = authorship?.author;
    const id = author?.id;
    const shortId = canonicalAuthorId(id);
    if (!shortId || authorUrl(shortId) === mainId || seenOnWork.has(shortId)) return;
    seenOnWork.add(shortId);

    const existing = collaborators.get(shortId);
    if (existing) {
      existing.publication_count += 1;
      return;
    }

    collaborators.set(shortId, {
      id,
      name: String(author.display_name || 'Unknown Author').trim(),
      publication_count: 1,
      institution: authorship.institutions?.[0]?.display_name || 'Unknown Institution',
    });
  });
}

function storageKey(authorId) {
  return `${CACHE_PREFIX}${authorId}`;
}

function purgeSessionCache() {
  try {
    const now = Date.now();
    const entries = Object.keys(sessionStorage)
      .filter((key) => key.startsWith(CACHE_PREFIX))
      .map((key) => {
        try {
          return { key, value: JSON.parse(sessionStorage.getItem(key) || 'null') };
        } catch {
          return { key, value: null };
        }
      });
    const valid = entries.filter(({ value }) => value?.expiresAt > now && Array.isArray(value.works) && Array.isArray(value.collaborators));

    entries.filter(({ key }) => !valid.some((entry) => entry.key === key))
      .forEach(({ key }) => sessionStorage.removeItem(key));
    valid.sort((a, b) => (a.value.storedAt || 0) - (b.value.storedAt || 0));
    while (valid.length > MAX_SESSION_CACHE_ENTRIES) {
      sessionStorage.removeItem(valid.shift().key);
    }
  } catch {
    // Storage is optional.
  }
}

function readSessionCache(authorId) {
  try {
    purgeSessionCache();
    const entry = JSON.parse(sessionStorage.getItem(storageKey(authorId)) || 'null');
    if (!entry || entry.expiresAt <= Date.now() || !Array.isArray(entry.works) || !Array.isArray(entry.collaborators)) {
      if (entry) sessionStorage.removeItem(storageKey(authorId));
      return null;
    }
    return { result: { works: entry.works, collaborators: entry.collaborators }, expiresAt: entry.expiresAt };
  } catch {
    return null;
  }
}

function writeSessionCache(authorId, result) {
  try {
    sessionStorage.setItem(storageKey(authorId), JSON.stringify({
      ...result,
      expiresAt: Date.now() + CACHE_TTL_MS,
      storedAt: Date.now(),
    }));
    purgeSessionCache();
  } catch {
    // Storage is optional and may be disabled or full.
  }
}

function getCachedWorks(authorId) {
  const memoryEntry = memoryCache.get(authorId);
  if (memoryEntry) {
    if (memoryEntry.expiresAt > Date.now()) {
      memoryCache.delete(authorId);
      memoryCache.set(authorId, memoryEntry);
      return memoryEntry.result;
    }
    memoryCache.delete(authorId);
  }

  const sessionEntry = readSessionCache(authorId);
  if (!sessionEntry) return null;
  setMemoryCache(authorId, sessionEntry.result, sessionEntry.expiresAt);
  return sessionEntry.result;
}

function setMemoryCache(authorId, result, expiresAt = Date.now() + CACHE_TTL_MS) {
  memoryCache.delete(authorId);
  memoryCache.set(authorId, { result, expiresAt });
  while (memoryCache.size > MAX_MEMORY_CACHE_ENTRIES) {
    memoryCache.delete(memoryCache.keys().next().value);
  }
}

function cacheCompletedWorks(authorId, result) {
  setMemoryCache(authorId, result);
  writeSessionCache(authorId, result);
}

function createUrl(path, params, apiKey) {
  const url = new URL(`${API_ROOT}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  });
  if (apiKey) url.searchParams.set('api_key', apiKey);
  return url;
}

// OpenAlex reports a daily budget (in USD) on every response. Without a key
// it is shared by everyone on the same IP address.
const usage = { value: null, listeners: new Set(), worksCost: null };

// Development only: ?budget=low or ?budget=out previews the budget notices.
function simulatedRemaining(remaining, limit) {
  if (process.env.NODE_ENV !== 'development') return remaining;
  const mode = new URLSearchParams(window.location.search).get('budget');
  if (mode === 'out') return 0;
  if (mode === 'low') return limit * 0.07;
  return remaining;
}

function recordUsage(response, apiKey) {
  const header = (name) => response?.headers?.get?.(name);
  const remaining = header('x-ratelimit-remaining-usd');
  const limit = header('x-ratelimit-limit-usd');
  if (remaining == null || limit == null) return;
  const reset = Number(header('x-ratelimit-reset'));
  usage.value = {
    remaining: simulatedRemaining(Number(remaining), Number(limit)),
    limit: Number(limit),
    resetAt: Number.isFinite(reset) ? Date.now() + reset * 1000 : null,
    keyed: Boolean(apiKey),
  };
  usage.listeners.forEach((listener) => listener());
}

export function getUsage() {
  return usage.value;
}

export function subscribeUsage(listener) {
  usage.listeners.add(listener);
  return () => usage.listeners.delete(listener);
}

// Rough comparisons left, from what loading an author's works has cost so far.
export function comparisonsLeft(remaining) {
  const perAuthor = usage.worksCost ?? 0.0003;
  return Math.max(0, Math.floor(remaining / (perAuthor * 2)));
}

export function formatWait(ms) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function budgetError(apiKey) {
  const resetAt = usage.value?.resetAt;
  const when = resetAt ? ` It resets in ${formatWait(resetAt - Date.now())}.` : '';
  const error = new Error(apiKey
    ? `Your OpenAlex API key has used today’s budget.${when}`
    : `Today’s free OpenAlex budget for your network is used up.${when} Add a free API key to keep going.`);
  error.status = 429;
  return error;
}

function retryAfterMs(response) {
  const value = response?.headers?.get?.('retry-after');
  if (!value) return null;
  if (Number.isFinite(Number(value))) return Math.max(0, Number(value) * 1000);
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - Date.now());
}

function rateLimitError(retryAfter) {
  const error = new Error(retryAfter == null
    ? 'OpenAlex rate limit exceeded. Try again later or provide an API key.'
    : `OpenAlex rate limit exceeded. Retry after about ${Math.ceil(retryAfter / 1000)} seconds or provide an API key.`);
  error.status = 429;
  error.retryAfter = retryAfter;
  return error;
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function fetchJson(path, params, { signal, apiKey, onCost } = {}) {
  let lastStatus;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    throwIfAborted(signal);
    let response;
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      response = await fetch(createUrl(path, params, apiKey).toString(), { signal: controller.signal });
      lastStatus = response.status;
      recordUsage(response, apiKey);
      throwIfAborted(signal);

      if (response.ok) {
        const cost = Number(response.headers?.get?.('x-ratelimit-cost-usd'));
        if (Number.isFinite(cost)) onCost?.(cost);
        const payload = await response.json();
        throwIfAborted(signal);
        return payload;
      }
      if (!response.ok && usage.value && usage.value.remaining <= 0) {
        throw budgetError(apiKey);
      }

      if (response.status === 401 || response.status === 403) {
        let message = '';
        try {
          const body = await response.json();
          message = body?.message || body?.error || '';
        } catch {
          // Fall back to a generic message below.
        }
        const error = new Error(message
          ? `OpenAlex refused the request: ${message}`
          : 'OpenAlex refused the request. Check the API key under “API key”.');
        error.status = response.status;
        throw error;
      }

      if (response.status === 429) {
        const retryAfter = retryAfterMs(response);
        if (retryAfter != null && retryAfter > MAX_RETRY_AFTER_MS) throw rateLimitError(retryAfter);
        if (attempt < MAX_RETRIES) {
          await wait(retryAfter ?? RETRY_BASE_MS * (2 ** attempt), signal);
          continue;
        }
        throw rateLimitError(retryAfter);
      }

      if (response.status >= 500 && attempt < MAX_RETRIES) {
        await wait(RETRY_BASE_MS * (2 ** attempt), signal);
        continue;
      }

      let details = '';
      try {
        const body = await response.json();
        details = body?.message || body?.error || '';
      } catch {
        // Use the status when the API did not return JSON.
      }
      const error = new Error(`OpenAlex request failed (${response.status})${details ? `: ${details}` : ''}.`);
      error.status = response.status;
      throw error;
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if (controller.signal.aborted && !response) {
        throw new Error('OpenAlex request timed out.');
      }
      if (error?.name === 'AbortError') throw error;
      if (error?.status === 429) throw error;
      if (attempt === MAX_RETRIES || (response && response.status < 500 && response.status !== 429)) throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  throw new Error(`OpenAlex request failed${lastStatus ? ` (${lastStatus})` : ''}.`);
}

export async function searchAuthors(query, { signal, apiKey } = {}) {
  const value = String(query || '').trim();
  if (!value) return [];
  const payload = await fetchJson('/autocomplete/authors', { q: value }, { signal, apiKey });
  return (Array.isArray(payload?.results) ? payload.results : [])
    .map(normaliseAuthor)
    .filter(Boolean);
}

export async function getAuthor(queryOrId, { signal, apiKey } = {}) {
  const shortId = canonicalAuthorId(queryOrId);
  if (!shortId) {
    const [author] = await searchAuthors(queryOrId, { signal, apiKey });
    if (!author) throw new Error(`OpenAlex author not found for "${String(queryOrId || '').trim()}".`);
    return author;
  }

  try {
    const payload = await fetchJson(`/authors/${shortId}`, {
      select: 'id,display_name,works_count,last_known_institutions',
    }, { signal, apiKey });
    const author = normaliseAuthor(payload);
    if (!author) throw new Error(`OpenAlex author not found: ${shortId}.`);
    return author;
  } catch (error) {
    if (error.status === 404) throw new Error(`OpenAlex author not found: ${shortId}.`);
    throw error;
  }
}

async function fetchAuthorWorks(authorId, { signal, apiKey, emitProgress }) {
  const useCursor = Boolean(apiKey);
  let cursor = '*';
  let page = 1;
  let more = true;
  let total = 0;
  let cost = 0;
  const addCost = (value) => { cost += value; };
  const works = [];
  const collaborators = new Map();
  const seenWorks = new Set();

  do {
    const payload = await fetchJson('/works', {
      filter: `authorships.author.id:${authorUrl(authorId)}`,
      per_page: WORKS_PER_PAGE,
      ...(useCursor ? { cursor } : { page }),
      select: 'id,title,publication_year,referenced_works,primary_location,authorships',
    }, { signal, apiKey, onCost: addCost });
    const results = Array.isArray(payload?.results) ? payload.results : [];
    total = Number(payload?.meta?.count) || total;

    results.forEach((rawWork) => {
      if (!seenWorks.has(rawWork?.id)) {
        const work = normaliseWork(rawWork);
        if (work) {
          seenWorks.add(work.id);
          works.push(work);
          addCollaborators(collaborators, rawWork, authorId);
        }
      }
    });

    const result = { works: [...works], collaborators: Array.from(collaborators.values()) };
    emitProgress({ ...result, loaded: works.length, total });
    throwIfAborted(signal);
    if (useCursor) {
      cursor = payload?.meta?.next_cursor || null;
      more = Boolean(cursor);
    } else {
      more = results.length > 0 && page * WORKS_PER_PAGE < MAX_PAGED_RESULTS;
      page += 1;
    }
  } while (more && (total === 0 || works.length < total));

  if (cost > 0) {
    usage.worksCost = usage.worksCost == null ? cost : usage.worksCost * 0.6 + cost * 0.4;
  }

  if (!useCursor && works.length < total && total > MAX_PAGED_RESULTS) {
    const error = new Error(
      `OpenAlex returns at most ${MAX_PAGED_RESULTS.toLocaleString()} works without an API key. `
      + `Add a free key under “API key” to load all ${total.toLocaleString()}.`,
    );
    error.status = 401;
    throw error;
  }

  return { works, collaborators: Array.from(collaborators.values()) };
}

function subscribeToWorks(authorId, options) {
  const key = JSON.stringify([authorId, options.apiKey || '']);
  let entry = inFlightWorks.get(key);
  if (entry?.controller.signal.aborted) {
    inFlightWorks.delete(key);
    entry = null;
  }
  if (!entry) {
    entry = {
      controller: new AbortController(),
      subscribers: new Set(),
    };
    entry.promise = fetchAuthorWorks(authorId, {
      apiKey: options.apiKey,
      signal: entry.controller.signal,
      emitProgress: (progress) => entry.subscribers.forEach((subscriber) => {
        try {
          subscriber.onProgress?.(progress);
        } catch {
          // A progress listener must not cancel the shared request.
        }
      }),
    }).then((result) => {
      if (!entry.controller.signal.aborted) cacheCompletedWorks(authorId, result);
      return result;
    }).finally(() => {
      if (inFlightWorks.get(key) === entry) inFlightWorks.delete(key);
    });
    inFlightWorks.set(key, entry);
  }

  return new Promise((resolve, reject) => {
    const subscriber = {
      onProgress: options.onProgress,
      done: false,
    };
    const unsubscribe = () => {
      if (subscriber.done) return;
      subscriber.done = true;
      entry.subscribers.delete(subscriber);
      reject(abortError());
      if (entry.subscribers.size === 0) entry.controller.abort();
    };

    if (options.signal?.aborted) {
      unsubscribe();
      return;
    }

    entry.subscribers.add(subscriber);
    const onAbort = () => unsubscribe();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    entry.promise.then((result) => {
      options.signal?.removeEventListener('abort', onAbort);
      if (!subscriber.done) {
        subscriber.done = true;
        entry.subscribers.delete(subscriber);
        resolve(result);
      }
    }, (error) => {
      options.signal?.removeEventListener('abort', onAbort);
      if (!subscriber.done) {
        subscriber.done = true;
        entry.subscribers.delete(subscriber);
        reject(error?.name === 'AbortError' ? abortError() : error);
      }
    });
  });
}

export function getAuthorWorks(authorId, { signal, apiKey, onProgress } = {}) {
  if (signal?.aborted) return Promise.reject(abortError());
  const shortId = canonicalAuthorId(authorId);
  if (!shortId) return Promise.reject(new Error('A valid OpenAlex author ID is required.'));

  const cached = getCachedWorks(shortId);
  if (cached) {
    onProgress?.({ ...cached, loaded: cached.works.length, total: cached.works.length });
    return Promise.resolve(cached);
  }

  return subscribeToWorks(shortId, { signal, apiKey, onProgress });
}

export function clearOpenAlexCache() {
  usage.value = null;
  usage.worksCost = null;
  memoryCache.clear();
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith(CACHE_PREFIX))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // Storage is optional.
  }
}
