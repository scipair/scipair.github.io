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
const colors = ['#246b59', '#bd703c', '#8070ad'];
const options = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: { usePointStyle: true, boxWidth: 7, padding: 22 },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } },
    y: {
      beginAtZero: true,
      ticks: { precision: 0 },
      grid: { color: '#edf0eb' },
    },
  },
};
export default function Analytics({ works, authors }) {
  const data = useMemo(() => {
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
      backgroundColor: `${colors[index]}b0`,
      borderWidth: 2,
      pointRadius: 2,
      tension: 0.25,
    });
    return {
      trends: {
        labels: years,
        datasets: [
          ...works.map((list, index) =>
            dataset(
              authors[index]?.display_name || `Author ${index ? 'B' : 'A'}`,
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
            'A papers citing B',
            count(works[0], (work) => work.citing),
            0,
          ),
          dataset(
            'B papers citing A',
            count(works[1], (work) => work.citing),
            1,
          ),
          dataset(
            'Coauthored papers',
            count(works[0], (work) => work.coauthored),
            2,
          ),
        ],
      },
    };
  }, [works, authors]);
  if (!data.trends.labels.length)
    return (
      <div className="empty-state panel">
        <h2>A timeline of research</h2>
        <p>Publication trends will appear as author records load.</p>
      </div>
    );
  return (
    <div className="analytics-grid">
      <section className="panel">
        <span className="eyebrow">RESEARCH ACTIVITY</span>
        <h2>Publications over time</h2>
        <p>
          Follow each author’s output and the years they published together.
        </p>
        <div className="chart-wrap">
          <Line
            data={data.trends}
            options={options}
            role="img"
            aria-label="Publications per year for both authors and their coauthored papers"
          />
        </div>
      </section>
      <section className="panel">
        <span className="eyebrow">ACADEMIC EXCHANGE</span>
        <h2>A history of connection</h2>
        <p>Papers citing the other author, alongside joint publications.</p>
        <div className="chart-wrap">
          <Bar
            data={data.timeline}
            options={options}
            role="img"
            aria-label="Citing and coauthored papers by publication year"
          />
        </div>
      </section>
      <details className="chart-data">
        <summary>View yearly publication counts</summary>
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
