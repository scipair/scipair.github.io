import React, { useMemo, useState } from 'react';
import Download from './Download';
import {
  figureName,
  fontsReady,
  frame,
  lightTokens,
  savePng,
  saveSvg,
} from '../lib/figure';

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

function buildModel(works) {
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
}

// Same geometry as the on-screen plot, as figure primitives.
function exportFigure(model, names, fullNames, t) {
  const bodyWidth = 1200;
  const half = 120;
  const top = 22;
  const axis = top + half;
  const { rows, first, last, cap } = model;
  const n = rows.length;
  const w = bodyWidth / n;
  const pad = Math.min(w * 0.18, 4);
  const colors = {
    a: { rest: t.aSoft, linked: t.a, together: t.both },
    b: { rest: t.bSoft, linked: t.b, together: t.both },
  };
  const figure = frame({
    tokens: t,
    title: 'Papers per year',
    authors: fullNames,
    legend: [
      { label: 'Paper', colors: [t.aSoft, t.bSoft] },
      { label: 'Cites or cited by the other', colors: [t.a, t.b] },
      { label: 'Coauthored', color: t.both },
    ],
    bodyWidth,
    bodyHeight: axis + half + 34,
  });
  const { x: bx, y: by } = figure.body;
  const prims = [];
  const scale = (value) => (Math.min(value, cap) / cap) * half;
  rows.forEach((row, index) =>
    ['a', 'b'].forEach((side) => {
      const data = row[side];
      let offset = 0;
      [
        ['together', data.together],
        ['linked', data.linked],
        ['rest', data.total - data.together - data.linked],
      ].forEach(([kind, value]) => {
        if (!value) return;
        const start = scale(offset);
        offset += value;
        const h = scale(offset) - start;
        if (h <= 0) return;
        prims.push({
          type: 'rect',
          x: bx + index * w + pad,
          y: by + (side === 'a' ? axis - start - h : axis + start),
          w: w - pad * 2,
          h,
          fill: colors[side][kind],
        });
      });
      if (data.total > cap)
        prims.push({
          type: 'text',
          x: bx + (index + 0.5) * w,
          y: by + (side === 'a' ? top - 6 : axis + half + 14),
          text: `${side === 'a' ? '↑' : '↓'}${data.total}`,
          size: 11,
          font: t.mono,
          fill: t[side],
          align: 'center',
        });
    }),
  );
  prims.push({
    type: 'rect',
    x: bx,
    y: by + axis - 0.5,
    w: bodyWidth,
    h: 1,
    fill: t.ruleStrong,
  });
  const label = { type: 'text', x: bx, size: 13, weight: 600, font: t.sans };
  prims.push({ ...label, y: by + 12, text: names[0], fill: t.a });
  prims.push({ ...label, y: by + axis + half, text: names[1], fill: t.b });
  const step = n > 40 ? 10 : 5;
  const ticks = rows
    .map(({ year }) => year)
    .filter((year) => year % step === 0);
  if (!ticks.length || ticks[0] - first >= 3) ticks.unshift(first);
  if (last - ticks[ticks.length - 1] >= 3) ticks.push(last);
  ticks.forEach((year) =>
    prims.push({
      type: 'text',
      x: bx + (year - first + 0.5) * w,
      y: by + axis + half + 32,
      text: String(year),
      size: 12,
      font: t.mono,
      fill: t.ink3,
      align: 'center',
    }),
  );
  return { ...figure, prims: [...figure.prims, ...prims] };
}

// Mirrored per-year histogram: author A above the axis, author B below.
export default function Timeline({ works, names, fullNames }) {
  const [hover, setHover] = useState(null);
  const model = useMemo(() => buildModel(works), [works]);

  if (!model) return <div className="timeline timeline-empty" />;
  const { rows, first, cap } = model;
  const n = rows.length;
  const scale = (value) => (Math.min(value, cap) / cap) * HALF;
  const x = (index) => (index / n) * 100;
  const active = hover ?? null;
  const readout = active !== null ? rows[active] : null;
  const step = n > 40 ? 10 : 5;
  const ticks = rows
    .map(({ year }) => year)
    .filter((year) => year % step === 0);
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
        <Download
          label="Download timeline"
          formats={['png', 'svg']}
          onExport={async (format) => {
            const tokens = lightTokens();
            await fontsReady(tokens);
            const figure = exportFigure(model, names, fullNames, tokens);
            const file = figureName(names, 'papers per year timeline', format);
            if (format === 'svg') saveSvg(figure, file);
            else await savePng(figure, file);
          }}
        />
        <div className="timeline-readout" aria-live="polite">
          {readout ? (
            <>
              <b>{readout.year}</b>
              <span className="ink-a">
                {readout.a.total} <small>{names[0]}</small>
              </span>
              <span className="ink-b">
                {readout.b.total} <small>{names[1]}</small>
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
          const index = Math.floor(
            ((event.clientX - box.left) / box.width) * n,
          );
          setHover(Math.max(0, Math.min(n - 1, index)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <span className="tl-side tl-side-a">{names[0]}</span>
        <span className="tl-side tl-side-b">{names[1]}</span>
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
          <span key={year} style={{ left: `${x(year - first + 0.5)}%` }}>
            {year}
          </span>
        ))}
      </div>
    </figure>
  );
}
