/**
 * "What If" Simulator / Goal Pacer
 * Global sliders + per-dot drag overrides.
 */

let simState = {
  runAdj: 0,    // % improvement (0-20)
  workAdj: 0,   // % improvement (0-20)
  roxAdj: 0     // % improvement (0-20)
};

// Per-race, per-segment absolute overrides set by dragging
// simOverrides[raceId][segIndex] = absoluteSeconds
const simOverrides = {};

// ─── SEGMENT DEFINITIONS ──────────────────────────────────────────────────────
// Sequence: R1, Rox→, W1, →Rox, R2, Rox→, W2, →Rox, ..., R8, W8
const SIM_LABELS = [
  'R1','Rox→','SkiErg','→Rox',
  'R2','Rox→','Sled Push','→Rox',
  'R3','Rox→','Sled Pull','→Rox',
  'R4','Rox→','Burpee BJ','→Rox',
  'R5','Rox→','Row','→Rox',
  'R6','Rox→','Farmers C.','→Rox',
  'R7','Rox→','S.Lunges','→Rox',
  'R8','Wall Balls'
];
// 0=run, 1=roxzone, 2=workout
const SIM_TYPES = [
  0,1,2,1, 0,1,2,1, 0,1,2,1, 0,1,2,1,
  0,1,2,1, 0,1,2,1, 0,1,2,1, 0,2
];
// Map slider id → SIM_TYPE value
const SLIDER_TYPE = { runAdj: 0, workAdj: 2, roxAdj: 1 };

function getSimBase(r) {
  const rx  = r.rxEntry || new Array(7).fill(0);
  const rxX = r.rxExit  || new Array(7).fill(0);
  return [
    r.runs[0], rx[0],  r.workouts[0], rxX[0],
    r.runs[1], rx[1],  r.workouts[1], rxX[1],
    r.runs[2], rx[2],  r.workouts[2], rxX[2],
    r.runs[3], rx[3],  r.workouts[3], rxX[3],
    r.runs[4], rx[4],  r.workouts[4], rxX[4],
    r.runs[5], rx[5],  r.workouts[5], rxX[5],
    r.runs[6], rx[6],  r.workouts[6], rxX[6],
    r.runs[7],          r.workouts[7]
  ];
}

function getSimSegments(r) {
  const runF  = 1 - simState.runAdj  / 100;
  const workF = 1 - simState.workAdj / 100;
  const roxF  = 1 - simState.roxAdj  / 100;
  const factors = SIM_TYPES.map(t => t === 0 ? runF : t === 1 ? roxF : workF);
  const base    = getSimBase(r);
  const ov      = simOverrides[r.id] || {};
  return base.map((v, i) => ov[i] !== undefined ? ov[i] : v * factors[i]);
}

function simTotals(r) {
  const segs = getSimSegments(r);
  const newTotal = segs.reduce((a, b) => a + b, 0);
  return { newTotal, saving: r.totalSecs - newTotal };
}

// ─── SIM CHART ────────────────────────────────────────────────────────────────
let simChartInst = null;

function buildSimChart() {
  const canvas = document.getElementById('simChart');
  if (!canvas) return;
  const activeRaces = getActiveRaces().filter(r => !hiddenRaces.has(r.id));
  if (!activeRaces.length) {
    if (simChartInst) { simChartInst.destroy(); simChartInst = null; }
    return;
  }
  if (simChartInst) { simChartInst.destroy(); simChartInst = null; }
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const gridColor  = isDark ? 'rgba(30,45,68,0.9)' : 'rgba(0,0,0,0.05)';
  const mutedColor = isDark ? '#5d7491' : '#475569';

  try {
    simChartInst = new Chart(canvas, {
      type: 'line',
      data: {
        labels: SIM_LABELS,
        datasets: activeRaces.map(r => ({
          label: r.id,
          data: getSimSegments(r),
          borderColor: r.color,
          backgroundColor: rgba(r.color, 0.08),
          pointBackgroundColor: r.color,
          pointBorderColor: isDark ? '#090d17' : '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 9,
          tension: 0.35,
          fill: true,
          borderWidth: 2.5
        }))
      },
      options: {
        responsive: true,
        aspectRatio: 4,
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
            padding: { top: 2, bottom: 2, left: 5, right: 5 },
            display: ctx => SIM_TYPES[ctx.dataIndex] !== 1
          },
          dragData: {
            round: 0,
            showTooltip: true,
            onDragStart: (e, datasetIndex, index) => {
              // Only allow dragging non-roxzone points (optional — remove to allow all)
              // return SIM_TYPES[index] !== 1;
            },
            onDrag: (e, datasetIndex, index, value) => {
              const v = Math.max(10, value);
              const raceId = activeRaces[datasetIndex].id;
              if (!simOverrides[raceId]) simOverrides[raceId] = {};
              simOverrides[raceId][index] = Math.round(v);
              refreshSimResults();
              return v;
            },
            onDragEnd: (e, datasetIndex, index, value) => {
              const raceId = activeRaces[datasetIndex].id;
              if (!simOverrides[raceId]) simOverrides[raceId] = {};
              simOverrides[raceId][index] = Math.max(10, Math.round(value));
              refreshSimResults();
            }
          }
        },
        scales: {
          y: {
            grid: { color: gridColor },
            border: { display: false },
            ticks: { callback: v => fmt(v), color: mutedColor, maxTicksLimit: 5 }
          },
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: ctx => {
                const t = SIM_TYPES[ctx.index];
                if (t === 0) return isDark ? '#60a5fa' : '#2563eb';
                if (t === 1) return mutedColor;
                return isDark ? '#c084fc' : '#7c3aed';
              },
              font: ctx => ({ size: 9, weight: SIM_TYPES[ctx.index] !== 1 ? '700' : '400' })
            }
          }
        }
      }
    });
  } catch (e) {
    console.error('SimChart error:', e);
  }
}

// Refresh only the result totals without rebuilding the chart (used after drag)
function refreshSimResults() {
  const activeRaces = getActiveRaces();
  const resultsEl = document.getElementById('simResults');
  if (!resultsEl) return;
  const html = activeRaces.map(r => {
    if (hiddenRaces.has(r.id)) return '';
    const { newTotal, saving } = simTotals(r);
    return `
      <div class="sim-row" style="border-left: 4px solid ${r.color}">
        <div class="sim-athlete"><strong>${r.id}</strong> — ${r.athlete}</div>
        <div class="sim-time-wrap">
          <div class="sim-new-time">${fmt(Math.round(newTotal))}</div>
          <div class="sim-saving">-${fmt(Math.round(saving))}</div>
        </div>
      </div>`;
  }).join('');
  resultsEl.innerHTML = html || '<p class="muted">Toggle races in the header to compare simulations.</p>';
}

function initSimulator() {
  const inputs = ['runAdj', 'workAdj', 'roxAdj'];
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', (e) => {
        simState[id] = parseFloat(e.target.value);
        document.getElementById(id + 'Val').textContent = simState[id] + '%';
        // Clear per-segment overrides for this slider's type so slider takes effect
        const type = SLIDER_TYPE[id];
        Object.keys(simOverrides).forEach(raceId => {
          SIM_TYPES.forEach((t, i) => {
            if (t === type && simOverrides[raceId]) delete simOverrides[raceId][i];
          });
        });
        updateSimulatorResults();
      });
    }
  });
}

function updateSimulatorResults() {
  refreshSimResults();
  buildSimChart();
}

// Global reveal for other scripts
window.updateSimulatorResults = updateSimulatorResults;
window.buildSimChart = buildSimChart;
