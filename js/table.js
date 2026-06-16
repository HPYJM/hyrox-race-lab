// ─── STATE ────────────────────────────────────────────────────────────────────
let tableRows    = [];
let activeFilter = 'all';
let sortCol      = null;
let sortDir      = 1;   // 1 = asc, -1 = desc

// ─── INIT ROWS ────────────────────────────────────────────────────────────────
function initTableRows() {
  const activeRaces = getActiveRaces();
  tableRows = [
    ...WORKOUT_LABELS.map((lbl, i) => ({
      cat: 'Workout', type: 'workout', lbl,
      vals: activeRaces.map(r => r.workouts[i])
    })),
    ...[1,2,3,4,5,6,7,8].map((n, i) => ({
      cat: 'Run', type: 'run', lbl: `Run ${n}`,
      vals: activeRaces.map(r => r.runs[i])
    })),
    ...RX_TABLE_LABELS.map((lbl, i) => ({
      cat: 'Roxzone', type: 'roxzone', lbl,
      vals: activeRaces.map(r => r.rxEntry[i] + r.rxExit[i])
    })),
    { cat: 'Total', type: 'total-run',     lbl: 'Runs Total',     vals: activeRaces.map(r => r.runsSecs) },
    { cat: 'Total', type: 'total-workout', lbl: 'Workouts Total', vals: activeRaces.map(r => r.workoutsSecs) },
    { cat: 'Total', type: 'total-roxzone', lbl: 'Roxzone Total',  vals: activeRaces.map(r => r.roxzoneSecs) },
    { cat: 'Total', type: 'total',         lbl: 'RACE TOTAL',     vals: activeRaces.map(r => r.totalSecs) }
  ];
}

// ─── REFRESH ─────────────────────────────────────────────────────────────────
// Single entry point: applies current filter + sort, then renders.
function refreshTable() {
  let rows = [...tableRows];

  // 1. filter
  if (activeFilter !== 'all') {
    rows = rows.filter(r => {
      if (activeFilter === 'run')     return r.type === 'run'     || r.type === 'total-run';
      if (activeFilter === 'workout') return r.type === 'workout' || r.type === 'total-workout';
      if (activeFilter === 'roxzone') return r.type === 'roxzone' || r.type === 'total-roxzone';
      return true;
    });
  }

  // 2. sort
  if (sortCol) {
    rows.sort((a, b) => {
      let av, bv;
      if      (sortCol === 'cat')  { av = a.cat; bv = b.cat; }
      else if (sortCol === 'lbl')  { av = a.lbl; bv = b.lbl; }
      else if (sortCol === 'diff') { av = Math.max(...a.vals) - Math.min(...a.vals);
                                     bv = Math.max(...b.vals) - Math.min(...b.vals); }
      else if (sortCol.startsWith('val')) {
        const idx = parseInt(sortCol.slice(3), 10);
        av = a.vals[idx]; bv = b.vals[idx];
      }
      if (av === undefined) return 0;
      if (typeof av === 'string') return sortDir * av.localeCompare(bv);
      return sortDir * (av - bv);
    });
  }

  renderTable(rows);
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function renderTable(rows) {
  const table = document.getElementById('stable');
  const activeRaces = getActiveRaces();

  // No races for this category — show empty state
  if (!activeRaces.length) {
    table.innerHTML = '<tbody><tr><td colspan="10" style="text-align:center;padding:24px;color:var(--muted)">No races in this category yet. Add an athlete to get started.</td></tr></tbody>';
    return;
  }

  // thead
  const raceCols = activeRaces.map((r, ri) =>
    `<th data-sort="val${ri}" class="sortable">
       <span class="pill" style="background:${rgba(r.color,.18)};color:${r.color}">${r.id}</span>
       <span class="sort-icon"></span>
     </th>`
  ).join('');

  let html = `
    <thead><tr>
      <th data-sort="cat" class="sortable">Cat. <span class="sort-icon"></span></th>
      <th data-sort="lbl" class="sortable">Segment <span class="sort-icon"></span></th>
      ${raceCols}
      <th>Best</th>
      <th data-sort="diff" class="sortable">Diff <span class="sort-icon"></span></th>
    </tr></thead><tbody>`;

  rows.forEach(row => {
    // best/worst only among currently visible races
    const vis = row.vals.filter((_, i) => !hiddenRaces.has(activeRaces[i].id));
    const mn = vis.length ? Math.min(...vis) : Math.min(...row.vals);
    const mx = vis.length ? Math.max(...vis) : Math.max(...row.vals);
    const diff = mx - mn;
    const bestIdx = row.vals.indexOf(mn);
    const catColor = row.type === 'roxzone' ? '#a78bfa' : 'var(--muted)';

    const cells = row.vals.map((v, i) => {
      const isHidden = hiddenRaces.has(activeRaces[i].id);
      const isVisMin = !isHidden && v === mn;
      // PB = best across ALL races in this row (not just visible), only mark on the visible-best cell
      const isOverallPb = isVisMin && v === Math.min(...row.vals);
      const cls = isHidden ? '' : (isVisMin ? `best${isOverallPb ? ' pb' : ''}` : v === mx ? 'worst' : '');
      const style = isHidden ? 'opacity:.2;' : '';
      return `<td class="${cls}" style="${style}">${fmt(v)}</td>`;
    }).join('');

    html += `
      <tr data-type="${row.type}">
        <td style="color:${catColor};font-size:.72rem">${row.cat}</td>
        <td style="font-weight:500">${row.lbl}</td>
        ${cells}
        <td><span class="pill" style="background:${rgba(activeRaces[bestIdx].color,.18)};color:${activeRaces[bestIdx].color}">${activeRaces[bestIdx].id}</span></td>
        <td style="color:var(--muted)">+${fmt(diff)}</td>
      </tr>`;
  });

  html += '</tbody>';
  table.innerHTML = html;

  // wire sort headers
  table.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      sortDir = (sortCol === col) ? -sortDir : 1;
      sortCol = col;
      refreshTable();
    });
  });

  updateSortIcons();
}

// ─── SORT ICONS ───────────────────────────────────────────────────────────────
function updateSortIcons() {
  document.querySelectorAll('#stable th[data-sort]').forEach(th => {
    const icon = th.querySelector('.sort-icon');
    if (!icon) return;
    if (th.dataset.sort === sortCol) {
      icon.textContent = sortDir === 1 ? ' ↑' : ' ↓';
      th.classList.add('sort-active');
    } else {
      icon.textContent = '';
      th.classList.remove('sort-active');
    }
  });
}

// ─── FILTER SETUP ─────────────────────────────────────────────────────────────
function setupTableFilter() {
  document.getElementById('splitFilter').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#splitFilter .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeFilter = chip.dataset.filter;
    sortCol = null; // reset sort when filter changes
    refreshTable();
  });
}

// ─── CSV EXPORT ───────────────────────────────────────────────────────────────
function exportTableCSV() {
  const table = document.getElementById('stable');
  if (!table) return;

  const rows = [];
  table.querySelectorAll('tr').forEach(tr => {
    const cells = [...tr.querySelectorAll('th, td')].map(c =>
      `"${c.textContent.trim().replace(/"/g, '""')}"`
    );
    rows.push(cells.join(','));
  });

  const csv = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hyrox-splits-${activeFilter}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── PUBLIC FILTER (called from app.js keyboard handler) ─────────────────────
function setTableFilter(filter) {
  document.querySelectorAll('#splitFilter .chip').forEach(c => c.classList.remove('active'));
  const chip = document.querySelector(`#splitFilter .chip[data-filter="${filter}"]`);
  if (chip) chip.classList.add('active');
  activeFilter = filter;
  sortCol = null;
  refreshTable();
}

// ─── RESET TABLE STATE ────────────────────────────────────────────────────────
function resetTable() {
  setTableFilter('all');
}
