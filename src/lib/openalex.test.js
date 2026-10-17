import {
  clearOpenAlexCache,
  comparisonsLeft,
  formatWait,
  getAuthor,
  getAuthorWorks,
  getUsage,
  searchAuthors,
  subscribeUsage,
} from './openalex';

const response = (body, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => headers[name.toLowerCase()] || null },
  json: async () => body,
});

beforeEach(() => {
  clearOpenAlexCache();
  global.fetch = jest.fn();
});

afterEach(() => {
  delete global.fetch;
});

test('searchAuthors returns the normalized autocomplete contract', async () => {
  fetch.mockResolvedValue(response({ results: [{
    id: 'https://openalex.org/A123',
    display_name: 'Ada Lovelace',
    hint: 'Analytical Engines',
    works_count: 12,
  }] }));

  await expect(searchAuthors('ada', { apiKey: 'key' })).resolves.toEqual([{
    id: 'https://openalex.org/A123',
    short_id: 'A123',
    display_name: 'Ada Lovelace',
    hint: 'Analytical Engines',
    works_count: 12,
  }]);
  const url = new URL(fetch.mock.calls[0][0]);
  expect(url.pathname).toBe('/autocomplete/authors');
  expect(url.searchParams.get('q')).toBe('ada');
  expect(url.searchParams.get('api_key')).toBe('key');
});

test('getAuthor accepts every supported short ID form and selects only author fields', async () => {
  fetch.mockResolvedValue(response({
    id: 'https://openalex.org/A123',
    display_name: 'Ada Lovelace',
    works_count: 12,
    last_known_institutions: [{ display_name: 'Analytical Engines' }],
  }));

  await expect(getAuthor('https://openalex.org/authors/A123')).resolves.toMatchObject({
    short_id: 'A123',
    hint: 'Analytical Engines',
  });
  const url = new URL(fetch.mock.calls[0][0]);
  expect(url.pathname).toBe('/authors/A123');
  expect(url.searchParams.get('select')).toBe('id,display_name,works_count,last_known_institutions');
});

test('getAuthor throws a clear not-found error', async () => {
  fetch.mockResolvedValue(response({ results: [] }));

  await expect(getAuthor('missing author')).rejects.toThrow('OpenAlex author not found for "missing author".');
});

test('getAuthorWorks pages with a cursor when an API key is set and reports normalized progressive results', async () => {
  fetch
    .mockResolvedValueOnce(response({
      meta: { count: 2, next_cursor: 'next' },
      results: [{
        id: 'https://openalex.org/W1',
        title: 'First paper',
        publication_year: 2024,
        referenced_works: ['https://openalex.org/W2'],
        primary_location: { source: { display_name: 'Journal' }, landing_page_url: 'https://example.test/w1' },
        authorships: [{ author: { id: 'https://openalex.org/A123', display_name: 'Main' } }, {
          author: { id: 'https://openalex.org/A456', display_name: 'Coauthor' },
          institutions: [{ display_name: 'Institute' }],
        }],
      }],
    }))
    .mockResolvedValueOnce(response({
      meta: { count: 2, next_cursor: null },
      results: [{
        id: 'https://openalex.org/W2',
        title: 'Second paper',
        publication_year: 2023,
        referenced_works: [],
        primary_location: { source: { display_name: 'Journal' } },
        authorships: [{ author: { id: 'https://openalex.org/A123', display_name: 'Main' } }, {
          author: { id: 'https://openalex.org/A456', display_name: 'Coauthor' },
          institutions: [{ display_name: 'Institute' }],
        }],
      }],
    }));
  const progress = [];

  await expect(getAuthorWorks('authors/A123', {
    apiKey: 'key',
    onProgress: ({ works, collaborators, loaded, total }) => progress.push({ works, collaborators, loaded, total }),
  })).resolves.toMatchObject({
    works: [{ id: 'https://openalex.org/W1' }, { id: 'https://openalex.org/W2' }],
    collaborators: [{ id: 'https://openalex.org/A456', publication_count: 2, institution: 'Institute' }],
  });
  expect(progress.map(({ loaded, total }) => [loaded, total])).toEqual([[1, 2], [2, 2]]);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(new URL(fetch.mock.calls[0][0]).searchParams.get('cursor')).toBe('*');
  expect(new URL(fetch.mock.calls[1][0]).searchParams.get('cursor')).toBe('next');
  expect(new URL(fetch.mock.calls[0][0]).searchParams.get('per_page')).toBe('200');
  expect(new URL(fetch.mock.calls[0][0]).searchParams.get('select')).toBe(
    'id,title,publication_year,referenced_works,primary_location,authorships',
  );
});

test('without an API key, works are fetched with numbered pages', async () => {
  const work = (id) => ({ id: `https://openalex.org/W${id}`, title: `Paper ${id}` });
  fetch
    .mockResolvedValueOnce(response({ meta: { count: 3 }, results: [work(1), work(2)] }))
    .mockResolvedValueOnce(response({ meta: { count: 3 }, results: [work(3)] }));

  await expect(getAuthorWorks('A123')).resolves.toMatchObject({
    works: [{ id: 'https://openalex.org/W1' }, { id: 'https://openalex.org/W2' }, { id: 'https://openalex.org/W3' }],
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  const params = fetch.mock.calls.map(([url]) => new URL(url).searchParams);
  expect(params.map((search) => search.get('page'))).toEqual(['1', '2']);
  expect(params.every((search) => !search.has('cursor') && !search.has('api_key'))).toBe(true);
});

test('shows OpenAlex’s own reason when it refuses a request', async () => {
  fetch.mockResolvedValue(response({
    error: 'API key required for cursor paging',
    message: 'Paging past the first page with cursor= needs a free API key.',
  }, 401));

  await expect(getAuthorWorks('A123')).rejects.toThrow(
    'OpenAlex refused the request: Paging past the first page with cursor= needs a free API key.',
  );
});

test('tracks the OpenAlex daily budget from response headers', async () => {
  const budget = (remaining, cost) => ({
    'x-ratelimit-remaining-usd': String(remaining),
    'x-ratelimit-limit-usd': '0.1',
    'x-ratelimit-reset': '3600',
    'x-ratelimit-cost-usd': String(cost),
  });
  const listener = jest.fn();
  const unsubscribe = subscribeUsage(listener);
  fetch
    .mockResolvedValueOnce(response({ meta: { count: 2 }, results: [{ id: 'https://openalex.org/W1', title: 'One' }] }, 200, budget(0.02, 0.001)))
    .mockResolvedValueOnce(response({ meta: { count: 2 }, results: [{ id: 'https://openalex.org/W2', title: 'Two' }] }, 200, budget(0.019, 0.001)));

  await getAuthorWorks('A123');
  unsubscribe();
  expect(listener).toHaveBeenCalledTimes(2);
  expect(getUsage()).toMatchObject({ remaining: 0.019, limit: 0.1, keyed: false });
  expect(getUsage().resetAt - Date.now()).toBeGreaterThan(3_500_000);
  // Loading that author cost $0.002, so a comparison of two costs $0.004.
  expect(comparisonsLeft(0.019)).toBe(4);
  expect(formatWait(3_600_000)).toBe('1 h');
  expect(formatWait(200 * 60_000)).toBe('3 h 20 min');
});

test('explains an exhausted budget instead of retrying', async () => {
  fetch.mockResolvedValue(response({ error: 'Budget exceeded' }, 429, {
    'x-ratelimit-remaining-usd': '0',
    'x-ratelimit-limit-usd': '0.1',
    'x-ratelimit-reset': '7200',
  }));

  await expect(getAuthorWorks('A123')).rejects.toThrow(
    /free OpenAlex budget for your network is used up\. It resets in 2 h\. Add a free API key/,
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('completed works are served from memory and session storage cache', async () => {
  fetch.mockResolvedValue(response({ meta: { count: 0, next_cursor: null }, results: [] }));

  const first = await getAuthorWorks('A123');
  const second = await getAuthorWorks('A123');
  expect(second).toEqual(first);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(Object.keys(sessionStorage).some((key) => key.includes('A123'))).toBe(true);
});

test('retries transient server errors and stops when Retry-After is too large', async () => {
  fetch
    .mockResolvedValueOnce(response({}, 500))
    .mockResolvedValueOnce(response({ meta: { count: 0, next_cursor: null }, results: [] }));

  await expect(getAuthorWorks('A123')).resolves.toEqual({ works: [], collaborators: [] });
  expect(fetch).toHaveBeenCalledTimes(2);

  fetch.mockResolvedValue(response({}, 429, { 'retry-after': '30' }));
  await expect(getAuthorWorks('A456')).rejects.toThrow(/rate limit/i);
  expect(fetch).toHaveBeenCalledTimes(3);
});

test('does not cache partial works when a later page fails', async () => {
  fetch
    .mockResolvedValueOnce(response({
      meta: { count: 2, next_cursor: 'next' },
      results: [{ id: 'https://openalex.org/W1', title: 'Partial' }],
    }))
    .mockResolvedValueOnce(response({ message: 'bad cursor' }, 400))
    .mockResolvedValueOnce(response({ meta: { count: 0, next_cursor: null }, results: [] }));
  const progress = [];

  await expect(getAuthorWorks('A123', { onProgress: (value) => progress.push(value) })).rejects.toThrow(/400/);
  expect(progress).toHaveLength(1);
  expect(Object.keys(sessionStorage).some((key) => key.includes('A123'))).toBe(false);
  await expect(getAuthorWorks('A123')).resolves.toEqual({ works: [], collaborators: [] });
  expect(fetch).toHaveBeenCalledTimes(3);
});

test('session cache is bounded and preserves the stored expiry when hydrated', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
  sessionStorage.setItem('scipair:openalex:works:A123', JSON.stringify({
    works: [], collaborators: [], expiresAt: 5_000, storedAt: 1_000,
  }));
  fetch.mockResolvedValue(response({ meta: { count: 0, next_cursor: null }, results: [] }));

  await expect(getAuthorWorks('A123')).resolves.toEqual({ works: [], collaborators: [] });
  expect(fetch).not.toHaveBeenCalled();
  now.mockReturnValue(5_001);
  await getAuthorWorks('A123');
  expect(fetch).toHaveBeenCalledTimes(1);
  now.mockRestore();

  clearOpenAlexCache();
  fetch.mockResolvedValue(response({ meta: { count: 0, next_cursor: null }, results: [] }));
  for (let index = 1; index <= 25; index += 1) await getAuthorWorks(`A${index}`);
  expect(Object.keys(sessionStorage).filter((key) => key.startsWith('scipair:openalex:works:'))).toHaveLength(24);
});

test('aborting a works request rejects with AbortError and aborts fetch', async () => {
  let requestSignal;
  fetch.mockImplementation((url, options) => {
    requestSignal = options.signal;
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(abortError())));
  });
  const controller = new AbortController();
  const request = getAuthorWorks('A123', { signal: controller.signal });
  controller.abort();

  await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  expect(requestSignal.aborted).toBe(true);
});

test('shares an in-flight works request while allowing one consumer to cancel', async () => {
  let resolveFetch;
  fetch.mockImplementation(() => new Promise((resolve) => {
    resolveFetch = () => resolve(response({ meta: { count: 0, next_cursor: null }, results: [] }));
  }));
  const controller = new AbortController();
  const first = getAuthorWorks('A123', { signal: controller.signal });
  const second = getAuthorWorks('A123');
  controller.abort();
  resolveFetch();

  await expect(first).rejects.toMatchObject({ name: 'AbortError' });
  await expect(second).resolves.toEqual({ works: [], collaborators: [] });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('aborting then immediately reloading keeps the new same-author request alive', async () => {
  let calls = 0;
  fetch.mockImplementation((url, options) => {
    calls += 1;
    if (calls === 1) {
      return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(abortError())));
    }
    return Promise.resolve(response({ meta: { count: 0, next_cursor: null }, results: [] }));
  });
  const controller = new AbortController();
  const aborted = getAuthorWorks('A123', { signal: controller.signal });
  controller.abort();
  const reloaded = getAuthorWorks('A123');

  await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
  await expect(reloaded).resolves.toEqual({ works: [], collaborators: [] });
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('does not share in-flight requests across API keys', async () => {
  const resolvers = [];
  fetch.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
  const first = getAuthorWorks('A123', { apiKey: 'first' });
  const second = getAuthorWorks('A123', { apiKey: 'second' });

  expect(fetch).toHaveBeenCalledTimes(2);
  resolvers.forEach((resolve) => resolve(response({ meta: { count: 0, next_cursor: null }, results: [] })));
  await expect(first).resolves.toEqual({ works: [], collaborators: [] });
  await expect(second).resolves.toEqual({ works: [], collaborators: [] });
});

function abortError() {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}
