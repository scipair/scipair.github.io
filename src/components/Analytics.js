import React, { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { readTokens, useColorScheme } from '../lib/theme';
import {
  figureName,
  fontsReady,
  frame,
  lightStage,
  savePng,
} from '../lib/figure';
import Download from './Download';
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler,
);
function chartOptions(t, size = 11) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    font: { family: t.sans },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: t.surface,
        titleColor: t.ink,
        bodyColor: t.ink2,
        borderColor: t.ruleStrong,
        borderWidth: 1,
        padding: 10,
        boxPadding: 4,
        usePointStyle: true,
        titleFont: { family: t.sans, weight: '600' },
        bodyFont: { family: t.sans },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: t.ruleStrong },
        ticks: {
          maxTicksLimit: 10,
          color: t.ink3,
          font: { family: t.sans, size },
        },
      },
      y: {
        beginAtZero: true,
        border: { display: false },
        ticks: { precision: 0, color: t.ink3, font: { family: t.sans, size } },
        grid: { color: t.rule },
      },
    },
  };
}
function buildData(works, authors, names, tokens) {
  const colors = [tokens.a, tokens.b, tokens.both];
  const name = (index) =>
    authors[index]?.display_name || `Author ${index ? 'B' : 'A'}`;
  const years = [
    ...new Set(
      works
        .flat()
        .map((work) => work.publication_year)
        .filter(Boolean),
    ),
  ].sort((a, b) => a - b);
  const count = (list, filter = () => true) => {
    const counts = new Map();
    list.forEach((work) => {
      if (filter(work))
        counts.set(
          work.publication_year,
          (counts.get(work.publication_year) || 0) + 1,
        );
    });
    return years.map((year) => counts.get(year) || 0);
  };
  const dataset = (label, values, index) => ({
    label,
    data: values,
    borderColor: colors[index],
    backgroundColor: colors[index],
    borderWidth: 1.75,
    pointRadius: 0,
    pointHoverRadius: 3,
    tension: 0.2,
    borderRadius: 1,
    categoryPercentage: 0.9,
    barPercentage: 0.85,
  });
  return {
    trends: {
      labels: years,
      datasets: [
        ...works.map((list, index) => dataset(name(index), count(list), index)),
        dataset(
          'Coauthored',
          count(works[0], (work) => work.coauthored),
          2,
        ),
      ],
    },
    timeline: {
      labels: years,
      datasets: [
        dataset(
          `${names[0]} citing ${names[1]}`,
          count(works[0], (work) => work.citing),
          0,
        ),
        dataset(
          `${names[1]} citing ${names[0]}`,
          count(works[1], (work) => work.citing),
          1,
        ),
        dataset(
          'Coauthored',
          count(works[0], (work) => work.coauthored),
          2,
        ),
      ],
    },
  };
}

const stackedOptions = (options) => ({
  ...options,
  scales: {
    x: { ...options.scales.x, stacked: true },
    y: { ...options.scales.y, stacked: true },
  },
});

// Draws a chart off-screen with light tokens at print size, then frames it.
async function exportChart({
  type,
  key,
  stacked,
  title,
  works,
  authors,
  names,
  fullNames,
  format,
}) {
  const bodyWidth = 1100;
  const bodyHeight = 520;
  const { stage, tokens, remove } = lightStage(bodyWidth, bodyHeight);
  try {
    await fontsReady(tokens);
    const canvas = document.createElement('canvas');
    stage.appendChild(canvas);
    const data = buildData(works, authors, names, tokens)[key];
    const base = chartOptions(tokens, 13);
    const chart = new ChartJS(canvas, {
      type,
      data,
      options: {
        ...(stacked ? stackedOptions(base) : base),
        responsive: false,
        devicePixelRatio: 2,
      },
    });
    canvas.style.width = `${bodyWidth}px`;
    chart.resize(bodyWidth, bodyHeight);
    const figure = frame({
      tokens,
      title,
      authors: fullNames,
      legend: data.datasets.map((set) => ({
        label: set.label,
        color: set.borderColor,
      })),
      bodyWidth,
      bodyHeight,
    });
    figure.prims.push({
      type: 'image',
      image: canvas,
      x: figure.body.x,
      y: figure.body.y,
      w: bodyWidth,
      h: bodyHeight,
    });
    await savePng(figure, figureName(names, title, format));
    chart.destroy();
  } finally {
    remove();
  }
}

export default function Analytics({ works, authors, names, fullNames }) {
  const scheme = useColorScheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tokens = useMemo(readTokens, [scheme]);
  const options = useMemo(() => chartOptions(tokens), [tokens]);
  const stacked = useMemo(() => stackedOptions(options), [options]);
  const download = (props) => (
    <Download
      label={`Download ${props.title.toLowerCase()}`}
      onExport={(format) =>
        exportChart({ ...props, works, authors, names, fullNames, format })
      }
    />
  );
  const data = useMemo(
    () => buildData(works, authors, names, tokens),
    [works, authors, names, tokens],
  );
  const table = useMemo(() => {
    const [a, b] = names;
    const series = [
      ...data.trends.datasets.map((set) => set.data),
      ...data.timeline.datasets.slice(0, 2).map((set) => set.data),
    ];
    return {
      header: [
        'Year',
        `${a} papers`,
        `${b} papers`,
        'Coauthored papers',
        `${a} citing ${b}`,
        `${b} citing ${a}`,
      ],
      rows: data.trends.labels.map((year, index) => [
        year,
        ...series.map((values) => values[index]),
      ]),
    };
  }, [data, names]);
  const [copied, setCopied] = useState('');
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(''), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  const lines = (separator, quote) =>
    [table.header, ...table.rows]
      .map((row) => row.map(quote).join(separator))
      .join('\n');
  // Tab-separated text pastes straight into spreadsheet cells.
  const copyTable = async () => {
    try {
      await navigator.clipboard.writeText(lines('\t', String));
      setCopied('Copied');
    } catch {
      setCopied('Copy failed');
    }
  };
  const downloadCsv = () => {
    const quote = (cell) => {
      const text = String(cell);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const url = URL.createObjectURL(
      new Blob([lines(',', quote)], { type: 'text/csv' }),
    );
    const link = Object.assign(document.createElement('a'), {
      href: url,
      download: `scipair-${names.join('-').replace(/[^\w-]+/g, '')}.csv`,
    });
    link.click();
    URL.revokeObjectURL(url);
  };
  if (!data.trends.labels.length)
    return (
      <div className="empty">
        <h3>No publication years yet</h3>
        <p>Trends appear as author records load.</p>
      </div>
    );
  const legend = (sets) => (
    <div className="chart-legend" aria-hidden="true">
      {sets.map((set) => (
        <span key={set.label}>
          <i style={{ background: set.borderColor }} />
          {set.label}
        </span>
      ))}
    </div>
  );
  return (
    <div className="trends">
      <section className="chart-block">
        <header>
          <div>
            <h2>Papers per year</h2>
            <p>Each author’s output, and the papers they wrote together.</p>
          </div>
          {download({ type: 'line', key: 'trends', title: 'Papers per year' })}
        </header>
        {legend(data.trends.datasets)}
        <div className="chart-wrap">
          <Line
            data={data.trends}
            options={options}
            role="img"
            aria-label="Publications per year for both authors and their coauthored papers"
          />
        </div>
      </section>
      <section className="chart-block">
        <header>
          <div>
            <h2>Citations between them, by year</h2>
            <p>Papers from each author that cite the other’s work.</p>
          </div>
          {download({
            type: 'bar',
            key: 'timeline',
            stacked: true,
            title: 'Citations between them, by year',
          })}
        </header>
        {legend(data.timeline.datasets)}
        <div className="chart-wrap">
          <Bar
            data={data.timeline}
            options={stacked}
            role="img"
            aria-label="Citing and coauthored papers by publication year"
          />
        </div>
      </section>
      <details className="chart-data">
        <summary>Yearly counts as a table</summary>
        <div className="table-actions">
          <button className="quiet-button" onClick={copyTable}>
            {copied || 'Copy table'}
          </button>
          <button className="quiet-button" onClick={downloadCsv}>
            Download CSV
          </button>
          <span className="sr-only" role="status">
            {copied}
          </span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {table.header.map((cell) => (
                  <th key={cell}>{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map(([year, ...values]) => (
                <tr key={year}>
                  <th>{year}</th>
                  {values.map((value, index) => (
                    <td key={index}>{value}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
