// ─── CHART INSTANCES ─────────────────────────────────────────────────────────
const charts = {};

// tracks which races are currently hidden (managed by app.js)
const hiddenRaces = new Set();

// ─── CHART.JS DEFAULTS ───────────────────────────────────────────────────────
Chart.register(ChartDataLabels);
Chart.defaults.color = '#5d7491';
Chart.defaults.font.family = "'Inter','Segoe UI',system-ui,sans-serif";
Chart.defaults.font.size = 11;

const yScale = {
  grid:   { color: 'rgba(30,45,68,0.9)' },
  border: { display: false },
  ticks:  { callback: v => fmt(v), color: '#5d7491', maxTicksLimit: 5 }
};
const xScale = {
  grid:   { display: false },
  border: { display: false },
  ticks:  { color: '#dce6f5' }
};

// ─── RADAR CHART ─────────────────────────────────────────────────────────────
function buildRadarChart() {
  if (charts.radar) { charts.radar.destroy(); delete charts.radar; }
  const radarRaces = getActiveRaces().filter(r => r.radarStrength);
  const canvas = document.getElementById('radarChart');

  if (!radarRaces.length) {
    canvas.style.display = 'none';
    const existing = canvas.parentElement.querySelector('.radar-placeholder');
    if (!existing) {
      const msg = document.createElement('p');
      msg.className = 'radar-placeholder';
      msg.style.cssText = 'color:var(--muted);text-align:center;padding:2rem 0';
      msg.textContent = 'No radar data available for the selected category.';
      canvas.parentElement.appendChild(msg);
    }
    return;
  }

  canvas.style.display = '';
  const ph = canvas.parentElement.querySelector('.radar-placeholder');
  if (ph) ph.remove();

  try {
    charts.radar = new Chart(canvas, {
    type: 'radar',
    data: {
      labels: RADAR_LABELS,
      datasets: radarRaces.map(r => ({
        label: r.id,
        data: r.radarStrength,
        hidden: hiddenRaces.has(r.id),
        borderColor: r.color,
        backgroundColor: rgba(r.color, 0.12),
        pointBackgroundColor: r.color,
        pointBorderColor: '#090d17',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        borderWidth: 2.5
      }))
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          callbacks: {
            label: c => ` ${c.dataset.label}: ${c.raw.toFixed(1)}%`,
            title: items => RADAR_LABELS[items[0].dataIndex]
          }
        }
      },
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { stepSize: 20, color: '#5d7491', backdropColor: 'transparent', font: { size: 10 } },
          grid:        { color: 'rgba(30,45,68,0.9)' },
          angleLines:  { color: 'rgba(30,45,68,0.9)' },
          pointLabels: { color: '#dce6f5', font: { size: 12, weight: '600' } }
        }
      }
    }
  });
  } catch (err) {
    console.error('Radar chart failed to render:', err);
  }
}

function buildRadarLegend() {
  const el = document.getElementById('radarLegend');
  if (!el) return;
  el.innerHTML = '';
  const activeRaces = getActiveRaces().filter(r => r.radarStrength);
  activeRaces.forEach(r => {
    const cls = hiddenRaces.has(r.id) ? ' dimmed' : '';
    el.insertAdjacentHTML('beforeend',
      `<div class="li${cls}"><div class="dot" style="background:${r.color}"></div>${r.id} — ${r.label}</div>`);
  });
}

// ─── RUNS LINE CHART ─────────────────────────────────────────────────────────
function buildRunsChart() {
  if (charts.runs) { charts.runs.destroy(); delete charts.runs; }
  const activeRaces = getActiveRaces();
  try {
    charts.runs = new Chart(document.getElementById('runsChart'), {
    type: 'line',
    data: {
      labels: ['Run 1','Run 2','Run 3','Run 4','Run 5','Run 6','Run 7','Run 8'],
      datasets: activeRaces.map(r => ({
        label: r.id,
        data: r.runs,
        hidden: hiddenRaces.has(r.id),
        borderColor: r.color,
        backgroundColor: rgba(r.color, 0.08),
        pointBackgroundColor: r.color,
        pointBorderColor: '#090d17',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        tension: 0.35,
        fill: true,
        borderWidth: 2.5
      }))
    },
    options: {
      responsive: true,
      aspectRatio: 3.5,
      layout: { padding: { top: 28 } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } },
        datalabels: {
          color: c => c.dataset.borderColor,
          font: { size: 10, weight: '700' },
          formatter: v => fmt(v),
          anchor: 'end', align: 'top', offset: 4,
          borderRadius: 3,
          backgroundColor: c => rgba(c.dataset.borderColor, 0.12),
          padding: { top: 2, bottom: 2, left: 5, right: 5 }
        }
      },
      scales: { y: { ...yScale, suggestedMin: 180 }, x: xScale }
    }
  });
  } catch (err) {
    console.error('Runs chart failed to render:', err);
  }
}

function buildRunsLegend() {
  const el = document.getElementById('runsLegend');
  if (!el) return;
  el.innerHTML = '';
  getActiveRaces().forEach(r => {
    const cls = hiddenRaces.has(r.id) ? ' dimmed' : '';
    el.insertAdjacentHTML('beforeend',
      `<div class="li${cls}"><div class="dot" style="background:${r.color}"></div>${r.id} — ${r.athlete} (${r.label})</div>`);
  });
}

// ─── WORKOUT MINI CHARTS ─────────────────────────────────────────────────────
function buildWorkoutCharts() {
  // destroy existing instances first
  WORKOUT_LABELS.forEach((_, i) => {
    if (charts[`w${i}`]) { charts[`w${i}`].destroy(); delete charts[`w${i}`]; }
  });
  const wgridEl = document.getElementById('wgrid');
  wgridEl.innerHTML = WORKOUT_LABELS.map((st, i) =>
    `<div class="ccard"><div class="ctitle">${st}</div><canvas id="w${i}"></canvas></div>`
  ).join('');

  const activeRaces = getActiveRaces();
  WORKOUT_LABELS.forEach((st, i) => {
    try {
      charts[`w${i}`] = new Chart(document.getElementById(`w${i}`), {
      type: 'bar',
      data: {
        labels: activeRaces.map(r => r.id),
        datasets: [{
          label: st,
          data: activeRaces.map(r => r.workouts[i]),
          backgroundColor: activeRaces.map(r => hiddenRaces.has(r.id) ? rgba(r.color, 0.1) : rgba(r.color, 0.65)),
          borderColor:     activeRaces.map(r => hiddenRaces.has(r.id) ? rgba(r.color, 0.2) : r.color),
          borderWidth: 1.5,
          borderRadius: 6,
          hoverBackgroundColor: activeRaces.map(r => rgba(r.color, 0.9))
        }]
      },
      options: {
        responsive: true,
        aspectRatio: 1.6,
        layout: { padding: { top: 30 } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => ` ${fmt(c.raw)}` } },
          datalabels: {
            color: c => hiddenRaces.has(activeRaces[c.dataIndex].id) ? 'transparent' : '#dce6f5',
            font: { size: 11, weight: '700' },
            formatter: v => fmt(v),
            anchor: 'end', align: 'top', offset: 3
          }
        },
        scales: {
          y: { ...yScale, ticks: { ...yScale.ticks, maxTicksLimit: 4 } },
          x: xScale
        }
      }
    });
    } catch (err) {
      console.error(`Workout chart w${i} failed to render:`, err);
    }
  });
}

// ─── ROXZONE CHARTS ───────────────────────────────────────────────────────────
function buildRoxzoneCharts() {
  if (charts.rxTotal) { charts.rxTotal.destroy(); delete charts.rxTotal; }
  RX_LABELS.forEach((_, i) => {
    if (charts[`rz${i}`]) { charts[`rz${i}`].destroy(); delete charts[`rz${i}`]; }
  });
  const activeRaces = getActiveRaces();

  charts.rxTotal = new Chart(document.getElementById('rxTotalChart'), {
    type: 'bar',
    data: {
      labels: RX_LABELS,
      datasets: activeRaces.map(r => ({
        label: r.id,
        data: r.rxEntry.map((e, i) => e + r.rxExit[i]),
        hidden: hiddenRaces.has(r.id),
        backgroundColor: rgba(r.color, 0.65),
        borderColor: r.color,
        borderWidth: 1.5,
        borderRadius: 6,
        hoverBackgroundColor: rgba(r.color, 0.9)
      }))
    },
    options: {
      responsive: true,
      aspectRatio: 4,
      layout: { padding: { top: 30 } },
      plugins: {
        legend: {
          display: true, position: 'top', align: 'end',
          labels: { color: '#dce6f5', usePointStyle: true, pointStyle: 'circle', padding: 20 }
        },
        tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } },
        datalabels: {
          color: '#dce6f5', font: { size: 10, weight: '700' },
          formatter: v => fmt(v), anchor: 'end', align: 'top', offset: 3
        }
      },
      scales: { y: { ...yScale, suggestedMin: 0 }, x: xScale }
    }
  });

  // per-station stacked entry/exit mini cards
  const rzgridEl = document.getElementById('rzgrid');
  rzgridEl.innerHTML = RX_LABELS.map((st, i) =>
    `<div class="ccard"><div class="ctitle">${st} — Entry / Exit</div><canvas id="rz${i}"></canvas></div>`
  ).join('');

  RX_LABELS.forEach((st, i) => {
    charts[`rz${i}`] = new Chart(document.getElementById(`rz${i}`), {
      type: 'bar',
      data: {
        labels: activeRaces.map(r => r.id),
        datasets: [
          {
            label: 'Entry',
            data: activeRaces.map(r => r.rxEntry[i]),
            backgroundColor: activeRaces.map(r => hiddenRaces.has(r.id) ? rgba(r.color, 0.07) : rgba(r.color, 0.4)),
            borderColor:     activeRaces.map(r => hiddenRaces.has(r.id) ? rgba(r.color, 0.15) : r.color),
            borderWidth: 1.5,
            borderRadius: { topLeft: 0, topRight: 0, bottomLeft: 6, bottomRight: 6 },
            stack: 'rz'
          },
          {
            label: 'Exit',
            data: activeRaces.map(r => r.rxExit[i]),
            backgroundColor: activeRaces.map(r => hiddenRaces.has(r.id) ? rgba(r.color, 0.07) : rgba(r.color, 0.75)),
            borderColor:     activeRaces.map(r => hiddenRaces.has(r.id) ? rgba(r.color, 0.15) : r.color),
            borderWidth: 1.5,
            borderRadius: { topLeft: 6, topRight: 6, bottomLeft: 0, bottomRight: 0 },
            stack: 'rz'
          }
        ]
      },
      options: {
        responsive: true,
        aspectRatio: 1.6,
        layout: { padding: { top: 30 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: c => ` ${c.dataset.label}: ${fmt(c.raw)}`,
              footer: items => ` Total: ${fmt(items.reduce((s, it) => s + it.raw, 0))}`
            }
          },
          datalabels: {
            color: c => hiddenRaces.has(activeRaces[c.dataIndex].id) ? 'transparent' : '#dce6f5',
            font: { size: 10, weight: '700' },
            formatter: (v, ctx) => {
              if (ctx.datasetIndex === 1) {
                const total = activeRaces[ctx.dataIndex].rxEntry[i] + activeRaces[ctx.dataIndex].rxExit[i];
                return fmt(total);
              }
              return null;
            },
            anchor: 'end', align: 'top', offset: 3
          }
        },
        scales: {
          y: { ...yScale, stacked: true, ticks: { ...yScale.ticks, maxTicksLimit: 4 } },
          x: { ...xScale, stacked: true }
        }
      }
    });
  });
}

// ─── CATEGORY TOTALS ─────────────────────────────────────────────────────────
function buildTotalsChart() {
  if (charts.totals) { charts.totals.destroy(); delete charts.totals; }
  const activeRaces = getActiveRaces();
  charts.totals = new Chart(document.getElementById('totalsChart'), {
    type: 'bar',
    data: {
      labels: ['Total Time', 'Running', 'Workouts', 'Roxzone'],
      datasets: activeRaces.map(r => ({
        label: r.id,
        data: [r.totalSecs, r.runsSecs, r.workoutsSecs, r.roxzoneSecs],
        hidden: hiddenRaces.has(r.id),
        backgroundColor: rgba(r.color, 0.65),
        borderColor: r.color,
        borderWidth: 1.5,
        borderRadius: 6,
        hoverBackgroundColor: rgba(r.color, 0.9)
      }))
    },
    options: {
      responsive: true,
      aspectRatio: 4,
      layout: { padding: { top: 32 } },
      plugins: {
        legend: {
          display: true, position: 'top', align: 'end',
          labels: { color: '#dce6f5', usePointStyle: true, pointStyle: 'circle', padding: 20 }
        },
        tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } },
        datalabels: {
          color: '#dce6f5', font: { size: 10, weight: '600' },
          formatter: v => fmt(v), anchor: 'end', align: 'top', offset: 3
        }
      },
      scales: { y: yScale, x: xScale }
    }
  });
}

// ─── REBUILD ALL ─────────────────────────────────────────────────────────────
function rebuildAllCharts() {
  buildRadarChart();
  buildRadarLegend();
  buildRunsChart();
  buildRunsLegend();
  buildWorkoutCharts();
  buildRoxzoneCharts();
  buildTotalsChart();
}
