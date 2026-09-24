import React from 'react';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
  within,
} from '@testing-library/react';
import App from './App';
import { getAuthor, getAuthorWorks, searchAuthors } from './lib/openalex';
jest.mock('./lib/openalex');
const author = (id, name) => ({
  id: `https://openalex.org/${id}`,
  short_id: id,
  display_name: name,
  hint: 'Example University',
});
const paper = (id, title, references = []) => ({
  id,
  title,
  publication_year: 2025,
  venue: 'Example Journal',
  referenced_works: references,
});
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  sessionStorage.clear();
  jest.resetAllMocks();
  getAuthor.mockImplementation(async (name) =>
    name === 'Filippo Menczer' || name === 'A1'
      ? author('A1', 'Filippo Menczer')
      : author('A2', 'Santo Fortunato'),
  );
  getAuthorWorks.mockResolvedValue({ works: [], collaborators: [] });
  searchAuthors.mockResolvedValue([]);
});

test('empty publication records finish loading and leave author search usable', async () => {
  render(<App />);
  await screen.findByText('Comparison up to date');
  expect(screen.getByRole('combobox', { name: 'Author A' })).toBeEnabled();
  expect(screen.getAllByText('No publications to show')).toHaveLength(2);
  expect(window.location.hash).toBe('#A1;A2');
});

test('shows progressive papers, then filters and searches completed records', async () => {
  let finish;
  getAuthorWorks.mockImplementation((id, options) => {
    if (id.endsWith('A2'))
      return Promise.resolve({
        works: [paper('W2', 'Other paper')],
        collaborators: [],
      });
    options.onProgress({
      works: [paper('W1', 'Connected paper', ['W2'])],
      collaborators: [],
      loaded: 1,
      total: 2,
    });
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  render(<App />);
  await screen.findByText('Connected paper');
  expect(screen.getByText('1 of 2 papers loaded')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Author A' })).toBeEnabled();
  await act(async () =>
    finish({
      works: [
        paper('W1', 'Connected paper', ['W2']),
        paper('W3', 'Unconnected paper'),
      ],
      collaborators: [],
    }),
  );
  await screen.findByText('Comparison up to date');
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Connected papers only' }),
  );
  expect(screen.queryByText('Unconnected paper')).not.toBeInTheDocument();
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Search publications' }),
    { target: { value: 'Other' } },
  );
  expect(screen.queryByText('Connected paper')).not.toBeInTheDocument();
  expect(screen.getByText('Other paper')).toBeInTheDocument();
});

test('author replacement cancels an old request and ignores its late result', async () => {
  let oldResolve, oldSignal;
  getAuthorWorks.mockImplementation((id, options) => {
    if (id.endsWith('A1')) {
      oldSignal = options.signal;
      return new Promise((resolve) => {
        oldResolve = resolve;
      });
    }
    return Promise.resolve({
      works: [
        paper(
          `W${id}`,
          id.endsWith('A3') ? 'New author paper' : 'Second author paper',
        ),
      ],
      collaborators: [],
    });
  });
  searchAuthors.mockResolvedValue([author('A3', 'New Author')]);
  render(<App />);
  await screen.findByText('Second author paper');
  fireEvent.change(screen.getByRole('combobox', { name: 'Author A' }), {
    target: { value: 'New' },
  });
  await screen.findByRole('option', { name: /New Author/ });
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Author A' }), {
    key: 'ArrowDown',
  });
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Author A' }), {
    key: 'Enter',
  });
  await screen.findByText('New author paper');
  expect(oldSignal.aborted).toBe(true);
  await act(async () =>
    oldResolve({ works: [paper('old', 'Stale paper')], collaborators: [] }),
  );
  expect(screen.queryByText('Stale paper')).not.toBeInTheDocument();
});

test('API failure is actionable and retry completes', async () => {
  getAuthorWorks.mockRejectedValueOnce(
    new Error('OpenAlex rate limit exceeded. Try again later.'),
  );
  render(<App />);
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('OpenAlex rate limit exceeded');
  fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
  await waitFor(() =>
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
  );
  await screen.findByText('Comparison up to date');
});

test('retry preserves an author ID from a shared comparison when lookup fails', async () => {
  window.history.replaceState(null, '', '/#A9;A2');
  getAuthor.mockImplementation(async (id) => {
    if (id === 'A9') throw new Error('Temporary lookup failure');
    return author('A2', 'Second Author');
  });
  render(<App />);
  const alert = await screen.findByRole('alert');
  getAuthor.mockResolvedValue(author('A9', 'Retried Author'));
  fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
  await screen.findByRole('heading', { name: 'Retried Author' });
  expect(getAuthor).toHaveBeenLastCalledWith('A9', expect.any(Object));
});

test('renders only a page of papers until more are requested', async () => {
  getAuthorWorks.mockImplementation(async (id) => ({
    works: id.endsWith('A1')
      ? Array.from({ length: 40 }, (_, i) =>
          paper(`W${i}`, `Publication ${String(i).padStart(2, '0')}`),
        )
      : [],
    collaborators: [],
  }));
  render(<App />);
  await screen.findByText('Comparison up to date');
  const column = screen.getByRole('region', {
    name: 'Filippo Menczer publications',
  });
  expect(within(column).getAllByRole('article')).toHaveLength(25);
  fireEvent.click(within(column).getByRole('button', { name: /Load 25 more/ }));
  expect(within(column).getAllByRole('article')).toHaveLength(40);
});
