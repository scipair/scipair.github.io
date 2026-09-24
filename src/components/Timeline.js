import React, { useMemo, useState } from 'react';

const HALF = 64;

function tally(works) {
  const years = new Map();
  works.forEach((work) => {
    const year = work.publication_year;
    if (!year) return;
    const row = years.get(year) || { total: 0, linked: 0, together: 0 };
    row.total += 1;
    if (work.coauthored) row.together += 1;
    else if (work.citing || work.cited) row.linked += 1;
    years.set(year, row);
  });
  return years;
}

// Mirrored per-year histogram: author A above the axis, author B below.
export default function Timeline({ works, names }) {
  const [hover, setHover] = useState(null);
  const model = useMemo(() => {
    const [a, b] = works.map(tally);
    const all = [...a.keys(), ...b.keys()];
    if (!all.length) return null;
    const first = Math.min(...all);
    const last = Math.max(...all);
    const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
    const empty = { total: 0, linked: 0, together: 0 };
    const rows = years.map((year) => ({
      year,
      a: a.get(year) || empty,
      b: b.get(year) || empty,
    }));
    // One outlier year (e.g. a bulk dataset upload) would flatten everything
    // else, so the scale is capped and taller bars are clipped and labelled.
    const counts = rows
      .flatMap((row) => [row.a.total, row.b.total])
      .filter(Boolean)
      .sort((x, y) => x - y);
    const max = counts[counts.length - 1];
    const p90 = counts[Math.floor(counts.length * 0.9)] || max;
    const cap = max > p90 * 2.2 ? Math.max(4, Math.ceil(p90 * 1.5)) : max;
    return { rows, first, last, cap };
  }, [works]);

  if (!model) return <div className="timeline timeline-empty" />;
  const { rows, first, cap } = model;
  const n = rows.length;
  const scale = (value) => (Math.min(value, cap) / cap) * HALF;
  const x = (index) => (index / n) * 100;
  const active = hover ?? null;
  const readout = active !== null ? rows[active] : null;
  const step = n > 40 ? 10 : 5;
  const ticks = rows.map(({ year }) => year).filter((year) => year % step === 0);
  if (!ticks.length || ticks[0] - first >= 3) ticks.unshift(first);
  if (model.last - ticks[ticks.length - 1] >= 3) ticks.push(model.last);

  const bar = (row, index, side) => {
    const data = row[side];
    if (!data.total) return null;
    const dir = side === 'a' ? -1 : 1;
    const w = 100 / n;
    const pad = Math.min(w * 0.18, 0.6);
    const segments = [
      ['together', data.together],
      ['linked', data.linked],
      ['rest', data.total - data.together - data.linked],
    ];
    let offset = 0;
    return segments.map(([kind, value]) => {
      if (!value) return null;
      const start = scale(offset);
      offset += value;
      const end = scale(offset);
      const h = end - start;
      if (h <= 0) return null;
      return (
        <rect
          key={`${side}-${kind}`}
          className={`tl-${side}-${kind}`}
          x={x(index) + pad}
          width={w - pad * 2}
          y={dir < 0 ? HALF - end : HALF + start}
          height={h}
        />
      );
    });
  };

  return (
    <figure
      className="timeline"
      aria-label={`Papers per year from ${first} to ${model.last}. ${names[0]} above the axis, ${names[1]} below.`}
    >
      <div className="timeline-head">
        <div className="timeline-legend" aria-hidden="true">
          <span>
            <i className="sw sw-rest" /> Paper
          </span>
          <span>
            <i className="sw sw-linked" /> Cites or cited by the other
          </span>
          <span>
            <i className="sw sw-together" /> Coauthored
          </span>
        </div>
        <div className="timeline-readout" aria-live="polite">
          {readout ? (
            <>
              <b>{readout.year}</b>
              <span className="ink-a">
                {readout.a.total} <small>A</small>
              </span>
              <span className="ink-b">
                {readout.b.total} <small>B</small>
              </span>
              {readout.a.together > 0 && (
                <span className="ink-both">
                  {readout.a.together} <small>together</small>
                </span>
              )}
            </>
          ) : (
            <span className="muted">Hover a year</span>
          )}
        </div>
      </div>
      <div
        className="timeline-plot"
        onMouseMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const index = Math.floor(((event.clientX - box.left) / box.width) * n);
          setHover(Math.max(0, Math.min(n - 1, index)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <span className="tl-side tl-side-a">A</span>
        <span className="tl-side tl-side-b">B</span>
        <svg
          viewBox={`0 0 100 ${HALF * 2}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {active !== null && (
            <rect
              className="tl-hover"
              x={x(active)}
              width={100 / n}
              y="0"
              height={HALF * 2}
            />
          )}
          {rows.map((row, index) => (
            <g key={row.year}>
              {bar(row, index, 'a')}
              {bar(row, index, 'b')}
            </g>
          ))}
          <line
            className="tl-axis"
            x1="0"
            x2="100"
            y1={HALF}
            y2={HALF}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {rows.map((row, index) =>
          ['a', 'b'].map((side) =>
            row[side].total > cap ? (
              <span
                key={`${row.year}-${side}`}
                className={`tl-clip tl-clip-${side}`}
                style={{ left: `${x(index + 0.5)}%` }}
              >
                {row[side].total}
              </span>
            ) : null,
          ),
        )}
      </div>
      <div className="timeline-axis" aria-hidden="true">
        {ticks.map((year) => (
          <span
            key={year}
            style={{ left: `${x(year - first + 0.5)}%` }}
          >
            {year}
          </span>
        ))}
      </div>
    </figure>
  );
}
