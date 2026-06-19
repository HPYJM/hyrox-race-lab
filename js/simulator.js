/**
 * "What If" Simulator / Goal Pacer
 * Allows users to adjust current performance by category percentages.
 */

let simState = {
  runAdj: 0,    // % improvement (0-20)
  workAdj: 0,   // % improvement (0-20)
  roxAdj: 0     // % improvement (0-20)
};

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
}

// Global reveal for other scripts
window.updateSimulatorResults = updateSimulatorResults;
