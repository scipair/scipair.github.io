import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthor, getAuthorWorks } from '../lib/openalex';
const empty = {
  author: null,
  works: [],
  collaborators: [],
  loading: false,
  error: '',
  loaded: 0,
  total: 0,
};

export default function useAuthor(apiKey) {
  const [state, setState] = useState(empty);
  const request = useRef(null);
  const lastQuery = useRef(null);
  const load = useCallback(
    async (query) => {
      lastQuery.current = query;
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setState({
        ...empty,
        author: typeof query === 'object' ? query : null,
        loading: true,
      });
      try {
        const options = { signal: controller.signal, apiKey };
        const author =
          typeof query === 'object' ? query : await getAuthor(query, options);
        if (controller.signal.aborted) return;
        setState((current) => ({ ...current, author }));
        const data = await getAuthorWorks(author.id || author.short_id, {
          ...options,
          onProgress: (progress) => {
            if (!controller.signal.aborted)
              setState((current) => ({ ...current, ...progress }));
          },
        });
        if (!controller.signal.aborted)
          setState((current) => ({
            ...current,
            ...data,
            loaded: data.works.length,
            total: data.works.length,
            loading: false,
          }));
      } catch (error) {
        if (!controller.signal.aborted)
          setState((current) => ({
            ...current,
            loading: false,
            error:
              error.message || 'Could not load this author. Please try again.',
          }));
      }
    },
    [apiKey],
  );
  useEffect(() => () => request.current?.abort(), []);
  const retry = useCallback(() => {
    if (lastQuery.current) load(lastQuery.current);
  }, [load]);
  return { ...state, load, retry };
}
