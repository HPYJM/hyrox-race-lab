// ─── CHART INSTANCES ─────────────────────────────────────────────────────────
const charts = {};

// tracks which races are currently hidden (managed by app.js)
const hiddenRaces = new Set();

// ─── THEME AWARE COLORS ───────────────────────────────────────────────────────
function getChartColors() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  return {
    muted: isDark ? '#5d7491' : '#475569',
    text: isDark ? '#dce6f5' : '#1e293b',
    grid: isDark ? 'rgba(30,45,68,0.9)' : 'rgba(0,0,0,0.05)',
    pointBorder: isDark ? '#090d17' : '#ffffff'
  };
}

// ─── CHART.JS DEFAULTS ───────────────────────────────────────────────────────
Chart.register(ChartDataLabels);
Chart.defaults.font.family = "'Inter','Segoe UI',system-ui,sans-serif";
Chart.defaults.font.size = 11;

function updateChartDefaults() {
  const colors = getChartColors();
  Chart.defaults.color = colors.muted;
}

const yScale = () => {
  const colors = getChartColors();
  return {
    grid:   { color: colors.grid },
    border: { display: false },
    ticks:  { callback: v => fmt(v), color: colors.muted, maxTicksLimit: 5 }
  };
};
const xScale = () => {
  const colors = getChartColors();
  return {
    grid:   { display: false },
    border: { display: false },
    ticks:  { color: colors.text }
  };
};

// ─── RADAR CHART ─────────────────────────────────────────────────────────────
function buildRadarChart() {
  if (charts.radar) { charts.radar.destroy(); delete charts.radar; }
  const activeRaces = getActiveRaces();
  const canvas = document.getElementById('radarChart');

  if (!activeRaces.length) {
    canvas.style.display = 'none';
    const existing = canvas.parentElement.querySelector('.radar-placeholder');
    if (!existing) {
      const msg = document.createElement('p');
      msg.className = 'radar-placeholder';
      msg.style.cssText = 'color:var(--muted);text-align:center;padding:2rem 0';
      msg.textContent = 'No races selected. Add an athlete to see performance radar.';
      canvas.parentElement.appendChild(msg);
    }
    return;
  }

  // If some races are missing radarStrength (old data), estimate it relative to active selection
  // so the user actually sees a chart immediately.
  const processedRaces = activeRaces.map(r => {
    if (r.radarStrength) return r;
    
    // Fallback: Estimate strength purely relative to currently visible races
    // This allows old data to have a radar chart until the user re-syncs.
    const est = RADAR_LABELS.map((lbl, i) => {
      if (lbl === 'Running') {
        const avg = activeRaces.reduce((sum, rx) => sum + rx.runsSecs, 0) / activeRaces.length;
        return Math.min(100, Math.max(0, 100 - ((r.runsSecs / avg - 1) * 200 + 50)));
      }
      // Station estimation based on workout time vs others
      const stIdx = i - 1; // skip running
      if (stIdx < 0 || !r.workouts[stIdx]) return 70;
      const avgSt = activeRaces.reduce((sum, rx) => sum + (rx.workouts[stIdx]||0), 0) / activeRaces.length;
      return Math.min(100, Math.max(0, 100 - ((r.workouts[stIdx] / avgSt - 1) * 200 + 50)));
    });
    return { ...r, radarStrength: est };
  });

  canvas.style.display = '';
  const ph = canvas.parentElement.querySelector('.radar-placeholder');
  if (ph) ph.remove();

  try {
    const colors = getChartColors();
    charts.radar = new Chart(canvas, {
    type: 'radar',
    data: {
      labels: RADAR_LABELS,
      datasets: processedRaces.map(r => ({
        label: r.id,
        data: r.radarStrength,
        hidden: hiddenRaces.has(r.id),
        borderColor: r.color,
        backgroundColor: rgba(r.color, 0.12),
        pointBackgroundColor: r.color,
        pointBorderColor: colors.pointBorder,
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
          ticks: { stepSize: 20, color: colors.muted, backdropColor: 'transparent', font: { size: 10 } },
          grid:        { color: colors.grid },
          angleLines:  { color: colors.grid },
          pointLabels: { color: colors.text, font: { size: 12, weight: '600' } }
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
  const activeRaces = getActiveRaces();
  activeRaces.forEach(r => {
    const cls = hiddenRaces.has(r.id) ? ' dimmed' : '';
    el.insertAdjacentHTML('beforeend',
      `<div class="li${cls}"><div class="dot" style="background:${r.color}"></div>${r.id} — ${r.label}</div>`);
  });
}

// ─── RUNS LINE CHART ─────────────────────────────────────────────────────────
window.runsChartType = window.runsChartType || 'line';
function buildRunsChart() {
  if (charts.runs) { charts.runs.destroy(); delete charts.runs; }
  const activeRaces = getActiveRaces();
  const colors = getChartColors();
  try {
    charts.runs = new Chart(document.getElementById('runsChart'), {
    type: window.runsChartType,
    data: {
      labels: ['Run 1','Run 2','Run 3','Run 4','Run 5','Run 6','Run 7','Run 8'],
      datasets: activeRaces.map(r => ({
        label: r.id,
        data: r.runs,
        hidden: hiddenRaces.has(r.id),
        borderColor: r.color,
        backgroundColor: rgba(r.color, 0.08),
        pointBackgroundColor: r.color,
        pointBorderColor: colors.pointBorder,
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
      scales: { y: { ...yScale(), suggestedMin: 180 }, x: xScale() }
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
    // Fatigue Index: (Run 8 - Run 1) / Run 1
    const decay = ((r.runs[7] - r.runs[0]) / r.runs[0]) * 100;
    const decayStr = decay > 0 ? `+${decay.toFixed(1)}%` : `${decay.toFixed(1)}%`;
    el.insertAdjacentHTML('beforeend',
      `<div class="li${cls}"><div class="dot" style="background:${r.color}"></div>${r.id} — ${r.athlete} <span style="color:var(--muted);margin-left:8px">(${decayStr} decay)</span></div>`);
  });
}

// ─── WORKOUT CHART ─────────────────────────────────────────────────────────────
window.workoutsChartType = window.workoutsChartType || 'bar';
function buildWorkoutCharts() {
  if (charts.workouts) { charts.workouts.destroy(); delete charts.workouts; }
  const activeRaces = getActiveRaces();
  const colors = getChartColors();
  try {
    charts.workouts = new Chart(document.getElementById('workoutsChart'), {
    type: window.workoutsChartType,
    data: {
      labels: ['SkiErg','Sled Push','Sled Pull','Burpee BJ','Row','Farmers C.','S. Lunges','Wall Balls'],
      datasets: activeRaces.map(r => ({
        label: r.id,
        data: r.workouts,
        hidden: hiddenRaces.has(r.id),
        borderColor: r.color,
        backgroundColor: window.workoutsChartType === 'bar' ? rgba(r.color, 0.65) : rgba(r.color, 0.08),
        pointBackgroundColor: r.color,
        pointBorderColor: colors.pointBorder,
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
          display: window.workoutsChartType === 'line'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: fmt }
        }
      }
    }
    });
  } catch (e) {
    console.error('Workouts chart error:', e);
  }
  buildWorkoutsLegend();
}

function buildWorkoutsLegend() {
  const el = document.getElementById('workoutsLegend');
  if (!el) return;
  el.innerHTML = '';
  getActiveRaces().forEach(r => {
    const cls = hiddenRaces.has(r.id) ? ' dimmed' : '';
    el.insertAdjacentHTML('beforeend',
      `<div class="li${cls}"><div class="dot" style="background:${r.color}"></div>${r.id} — ${r.label}</div>`);
  });
}

// ─── ROXZONE CHARTS ───────────────────────────────────────────────────────────
function buildRoxzoneCharts() {
  if (charts.rxTotal) { charts.rxTotal.destroy(); delete charts.rxTotal; }
  RX_LABELS.forEach((_, i) => {
    if (charts[`rz${i}`]) { charts[`rz${i}`].destroy(); delete charts[`rz${i}`]; }
  });
  const activeRaces = getActiveRaces();
  const colors = getChartColors();

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
          labels: { color: colors.text, usePointStyle: true, pointStyle: 'circle', padding: 20 }
        },
        tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } },
        datalabels: {
          color: colors.text, font: { size: 10, weight: '700' },
          formatter: v => fmt(v), anchor: 'end', align: 'top', offset: 3
        }
      },
      scales: { y: { ...yScale(), suggestedMin: 0 }, x: xScale() }
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
            color: c => hiddenRaces.has(activeRaces[c.dataIndex].id) ? 'transparent' : colors.text,
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
          y: { ...yScale(), stacked: true, ticks: { ...yScale().ticks, maxTicksLimit: 4 } },
          x: { ...xScale(), stacked: true }
        }
      }
    });
  });
}

// ─── RECOVERY CHART (NEW) ───────────────────────────────────────────────────
function buildRecoveryChart() {
  if (charts.recovery) { charts.recovery.destroy(); delete charts.recovery; }
  const activeRaces = getActiveRaces();
  const canvas = document.getElementById('recoveryChart');
  if (!canvas) return;

  if (!activeRaces.length) {
    canvas.style.display = 'none';
    return;
  }
  canvas.style.display = '';
  const colors = getChartColors();

  charts.recovery = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: RECOVERY_STATIONS,
      datasets: activeRaces.map(r => ({
        label: r.id,
        data: calculateRecoveryDeltas(r),
        hidden: hiddenRaces.has(r.id),
        backgroundColor: rgba(r.color, 0.75),
        borderColor: r.color,
        borderWidth: 1,
        borderRadius: 4
      }))
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: c => ` ${c.dataset.label}: ${c.raw > 0 ? '+' : ''}${c.raw}s vs prev run`
          }
        }
      },
      scales: {
        y: {
          ...yScale(),
          title: { display: true, text: 'Seconds Delta (Run N+1 vs Run N)', color: colors.muted },
          ticks: { callback: v => (v > 0 ? '+' : '') + v + 's' }
        },
        x: xScale()
      }
    }
  });
}

function buildRecoveryLegend() {
  const el = document.getElementById('recoveryLegend');
  if (!el) return;
  el.innerHTML = '';
  const activeRaces = getActiveRaces();
  activeRaces.forEach(r => {
    const cls = hiddenRaces.has(r.id) ? ' dimmed' : '';
    el.insertAdjacentHTML('beforeend',
      `<div class="li${cls}"><div class="dot" style="background:${r.color}"></div>${r.id} — ${r.label}</div>`);
  });
}

// ─── REBUILD ALL ─────────────────────────────────────────────────────────────
function rebuildAllCharts() {
  updateChartDefaults();
  buildRadarChart();
  buildRadarLegend();
  buildRunsChart();
  buildRunsLegend();
  buildWorkoutCharts();
  buildWorkoutsLegend();
  buildRoxzoneCharts();
  buildRecoveryChart();
  buildRecoveryLegend();
  if (window.updateSimulatorResults) updateSimulatorResults(); // Sync simulator
}
