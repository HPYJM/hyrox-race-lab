/**
 * "What If" Simulator / Goal Pacer
 * Allows users to adjust current performance by category percentages.
 */

let simState = {
  runAdj: 0,    // % improvement (0-20)
  workAdj: 0,   // % improvement (0-20)
  roxAdj: 0     // % improvement (0-20)
};

// ─── SEGMENT DEFINITIONS ──────────────────────────────────────────────────────
// Sequence: R1, Rox→, W1, →Rox, R2, Rox→, W2, →Rox, ..., R7, Rox→, W7, →Rox, R8, W8
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

function getSimSegments(r) {
  const runF  = 1 - simState.runAdj  / 100;
  const workF = 1 - simState.workAdj / 100;
  const roxF  = 1 - simState.roxAdj  / 100;
  const rx  = r.rxEntry || new Array(7).fill(0);
  const rxX = r.rxExit  || new Array(7).fill(0);
  return [
    r.runs[0]*runF,    rx[0]*roxF,  r.workouts[0]*workF, rxX[0]*roxF,
    r.runs[1]*runF,    rx[1]*roxF,  r.workouts[1]*workF, rxX[1]*roxF,
    r.runs[2]*runF,    rx[2]*roxF,  r.workouts[2]*workF, rxX[2]*roxF,
    r.runs[3]*runF,    rx[3]*roxF,  r.workouts[3]*workF, rxX[3]*roxF,
    r.runs[4]*runF,    rx[4]*roxF,  r.workouts[4]*workF, rxX[4]*roxF,
    r.runs[5]*runF,    rx[5]*roxF,  r.workouts[5]*workF, rxX[5]*roxF,
    r.runs[6]*runF,    rx[6]*roxF,  r.workouts[6]*workF, rxX[6]*roxF,
    r.runs[7]*runF,                 r.workouts[7]*workF
  ];
}

function segBgColors(r, alpha = 1) {
  return SIM_TYPES.map(t => {
    if (t === 0) return rgba(r.color, 0.85 * alpha); // run
    if (t === 1) return rgba(r.color, 0.25 * alpha); // roxzone
    return rgba(r.color, 0.65 * alpha);               // workout
  });
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
  const gridColor = isDark ? 'rgba(30,45,68,0.9)' : 'rgba(0,0,0,0.05)';
  const mutedColor = isDark ? '#5d7491' : '#475569';

  try {
    simChartInst = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: SIM_LABELS,
        datasets: activeRaces.map(r => ({
          label: r.id,
          data: getSimSegments(r),
          backgroundColor: segBgColors(r),
          borderColor: SIM_TYPES.map(t => t === 1 ? rgba(r.color, 0.3) : r.color),
          borderWidth: 1.5,
          borderRadius: 4
        }))
      },
      options: {
        responsive: true,
        aspectRatio: 4,
        layout: { padding: { top: 4 } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } },
          datalabels: { display: false }
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

function initSimulator() {
  const inputs = ['runAdj', 'workAdj', 'roxAdj'];
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', (e) => {
        simState[id] = parseFloat(e.target.value);
        document.getElementById(id + 'Val').textContent = simState[id] + '%';
        updateSimulatorResults();
      });
    }
  });
}

/**
 * Recalculates projected finish times for all active (non-hidden) races.
 */
function updateSimulatorResults() {
  const activeRaces = getActiveRaces();
  const resultsEl = document.getElementById('simResults');
  if (!resultsEl) return;

  if (!activeRaces.length) {
    resultsEl.innerHTML = '<p class="muted">No races selected to simulate.</p>';
    return;
  }

  const html = activeRaces.map(r => {
    const isHidden = hiddenRaces.has(r.id);
    if (isHidden) return '';

    const newRunsSecs     = r.runsSecs * (1 - simState.runAdj / 100);
    const newWorkoutsSecs = r.workoutsSecs * (1 - simState.workAdj / 100);
    const newRoxzoneSecs  = r.roxzoneSecs * (1 - simState.roxAdj / 100);
    const newTotalSecs    = newRunsSecs + newWorkoutsSecs + newRoxzoneSecs;
    const saving          = r.totalSecs - newTotalSecs;

    return `
      <div class="sim-row" style="border-left: 4px solid ${r.color}">
        <div class="sim-athlete">
          <strong>${r.id}</strong> — ${r.athlete}
        </div>
        <div class="sim-time-wrap">
          <div class="sim-new-time">${fmt(Math.round(newTotalSecs))}</div>
          <div class="sim-saving">-${fmt(Math.round(saving))}</div>
        </div>
      </div>
    `;
  }).join('');

  resultsEl.innerHTML = html || '<p class="muted">Toggle races in the header to compare simulations.</p>';
  buildSimChart();
}

// Global reveal for other scripts
window.updateSimulatorResults = updateSimulatorResults;
window.buildSimChart = buildSimChart;
