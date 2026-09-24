# UI and loading changes

Implemented on `codex/ui-performance` in an isolated Git worktree. No deployment or changes to the original `react` checkout.

## Changes

- Responsive author comparison with publication search, relationship filters, progress, actionable errors, keyboard author search, and shareable author URLs.
- Both authors load independently. Each API page renders immediately; searches remain usable during loading. Replacing an author aborts obsolete work.
- Removed the one-second wait after every page. Requests select only the fields used by the application, with bounded retries and an optional OpenAlex API key.
- Completed records have a bounded five-minute memory/session cache. Partial or failed records are never cached.
- Citation matching uses work-ID lookups rather than comparing every possible pair. Relationships recompute when records change, including replacements with the same number of papers.
- Paper lists render 25 records at a time. Charts and network libraries load only when their views open.
- The network includes the 15 strongest collaborators per author plus up to 12 strongest shared collaborators. Overview counts use the complete loaded data.
- Citation connections count distinct directed references. Relationship filters count papers, so a paper with several references counts once in its filter.

## Validation

`CI=true npm test -- --watchAll=false --runInBand` and `CI=true npm run build`.

Headless Chromium checks covered desktop, 390px and 320px mobile widths, all three views, runtime errors, and WCAG A/AA automated accessibility checks. Screenshots were inspected; no computer-use tools were used.

One local production-build sample against live OpenAlex, using the default authors (670 and 210 records):

| Measurement | Previous UI | Rebuilt UI |
| --- | ---: | ---: |
| Initial JavaScript, gzip | 292.68 kB | approximately 68 kB |
| Full comparison ready | 10.2 s | 5.5 s |
| Repeat load with works cache | Not implemented | 1.8 s |

The rebuilt UI appeared in 0.19 seconds in that sample. Repeat loading made only two author-metadata requests and no works requests. These timings are single local samples, not controlled benchmarks; OpenAlex latency, browser cache, and author publication counts affect results. Screenshots and accessibility checks also used a captured copy of the same live records to avoid repeated API traffic.
