import React, { useMemo } from 'react';
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
function chartOptions(t) {
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
        ticks: { maxTicksLimit: 10, color: t.ink3, font: { family: t.sans, size: 11 } },
      },
      y: {
        beginAtZero: true,
        border: { display: false },
        ticks: { precision: 0, color: t.ink3, font: { family: t.sans, size: 11 } },
        grid: { color: t.rule },
      },
    },
  };
}
export default function Analytics({ works, authors }) {
  const scheme = useColorScheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tokens = useMemo(readTokens, [scheme]);
  const options = useMemo(() => chartOptions(tokens), [tokens]);
  const stacked = useMemo(
    () => ({
      ...options,
      scales: {
        x: { ...options.scales.x, stacked: true },
        y: { ...options.scales.y, stacked: true },
      },
    }),
    [options],
  );
  const data = useMemo(() => {
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
          ...works.map((list, index) =>
            dataset(
              name(index),
              count(list),
              index,
            ),
          ),
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
            `${name(0)} citing ${name(1)}`,
            count(works[0], (work) => work.citing),
            0,
          ),
          dataset(
            `${name(1)} citing ${name(0)}`,
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
  }, [works, authors, tokens]);
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
          <h2>Papers per year</h2>
          <p>Each author’s output, and the papers they wrote together.</p>
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
          <h2>Citations between them, by year</h2>
          <p>Papers from each author that cite the other’s work.</p>
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
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Year</th>
                {data.trends.datasets.map((set, index) => (
                  <th key={index}>{set.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.trends.labels.map((year, index) => (
                <tr key={year}>
                  <th>{year}</th>
                  {data.trends.datasets.map((set, series) => (
                    <td key={series}>{set.data[index]}</td>
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
