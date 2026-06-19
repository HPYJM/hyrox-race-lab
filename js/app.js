// ─── THEME SWITCHING ───────────────────────────────────────────────────────────
function initTheme() {
  const savedTheme = localStorage.getItem('hyrox_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeButton(savedTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('hyrox_theme', next);
  updateThemeButton(next);
  rebuildAllCharts();
}

function updateThemeButton(theme) {
  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.textContent = theme === 'dark' ? '🌙' : '☀️';
  }
}

function initThemeToggle() {
  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.addEventListener('click', toggleTheme);
  }
}

// ─── URL HASH STATE ─────────────────────────────────────────────────────────────

// Parses the raw hyresult race text (e.g. "1HYROX Frankfurt 2025 PRO MEN 16-24")
// into a human-friendly title and subtitle for the race picker.
function formatRaceLabel(raw) {
  if (!raw) return { title: '—', sub: '' };
  let clean = raw
    .replace(/^\d*:\d{2}:\d{2}\s*/, '')   // strip leading time e.g. "1:21:42"
    .replace(/^#?\s*\d+\s*/, '')            // strip leading rank e.g. "#1602"
    .replace(/^(1?HYROX)\s*/i, '')          // strip leading "HYROX" or "1HYROX"
    .trim();
  // try to extract city/event name, year, division
  const m = clean.match(/^(.*?)(\d{4})\s*(.*?)$/);
  if (m) {
    const event = m[1].trim() || 'HYROX';
    const year  = m[2];
    const div   = m[3].trim();
    return { title: `${event} ${year}`.trim(), sub: div };
  }
  return { title: clean.slice(0, 40), sub: '' };
}

function syncUrlHash() {
  const params = new URLSearchParams();
  params.set('cat', activeCategory);
  const hidden = [...hiddenRaces].join(',');
  if (hidden) params.set('hidden', hidden);
  history.replaceState(null, '', '#' + params.toString());
}

function restoreFromHash() {
  const hash = location.hash.slice(1);
  if (!hash) return;
  try {
    const params = new URLSearchParams(hash);
    const cat = params.get('cat');
    if (cat && ['OPEN', 'DOUBLES'].includes(cat)) activeCategory = cat;
    const hiddenParam = params.get('hidden');
    if (hiddenParam) hiddenParam.split(',').filter(Boolean).forEach(id => hiddenRaces.add(id));
    // Remove stale hidden IDs that no longer correspond to any race
    [...hiddenRaces].forEach(id => {
      if (!RACES.some(r => r.id === id)) hiddenRaces.delete(id);
    });
  } catch { /* malformed hash — ignore */ }
}

// ─── RACE TOGGLE ─────────────────────────────────────────────────────────────
function toggleRace(id) {
  const activeRaces = getActiveRaces();
  // prevent hiding all races
  if (!hiddenRaces.has(id) && hiddenRaces.size >= activeRaces.length - 1) return;

  if (hiddenRaces.has(id)) {
    hiddenRaces.delete(id);
  } else {
    hiddenRaces.add(id);
  }

  // update header cards
  document.querySelectorAll('.rc').forEach(card => {
    card.classList.toggle('dimmed', hiddenRaces.has(card.dataset.raceId));
  });

  // update nav dots
  document.querySelectorAll('.nav-race-dot').forEach(dot => {
    dot.classList.toggle('hidden-race', hiddenRaces.has(dot.dataset.raceId));
  });

  // rebuild everything
  rebuildAllCharts();
  initTableRows();
  refreshTable();
  // sync athlete chip dim states
  syncAthleteChips();
  syncUrlHash();
}

// ─── HEADER RACE CARDS ───────────────────────────────────────────────────────
function buildHeader() {
  const rcEl = document.getElementById('raceCards');
  rcEl.innerHTML = '';
  getActiveRaces().forEach(r => {
    const athleteLine = r.partner
      ? `${r.athlete} &amp; ${r.partner}`
      : r.athlete;
    rcEl.insertAdjacentHTML('beforeend', `
      <div class="rc" style="--c:${r.color}" data-race-id="${r.id}" title="Click to toggle ${r.label}">
        <span class="badge">${r.id}</span>
        ${r.pct ? `<span class="pct-badge">${r.pct}</span>` : ''}
        <div class="athlete">${athleteLine}</div>
        <div class="event">${r.label}</div>
        ${r.total ? `<div class="total">${r.total}</div>` : ''}
        ${(r.rank || r.ag) ? `<div class="rank">${[r.rank, r.ag].filter(Boolean).join(' · ')}</div>` : ''}
        <div class="mini-grid">
          <div class="mini-stat"><div class="lbl">Runs</div><div class="val">${fmt(r.runsSecs)}</div></div>
          <div class="mini-stat"><div class="lbl">Workouts</div><div class="val">${fmt(r.workoutsSecs)}</div></div>
          <div class="mini-stat"><div class="lbl">Roxzone</div><div class="val">${fmt(r.roxzoneSecs)}</div></div>
          <div class="mini-stat" title="Ratio of Running to Workout time. >1 = Strength-dominant, <1 = Engine-dominant">
            <div class="lbl">A/P Ratio</div>
            <div class="val">
              ${(r.runsSecs / r.workoutsSecs).toFixed(2)}
              <span style="font-size:0.6rem;opacity:0.7;display:block;margin-top:2px">
                ${(r.runsSecs / r.workoutsSecs) > 1 ? 'POWER' : 'ENGINE'}
              </span>
            </div>
          </div>
        </div>
        <div class="toggle-hint">click to toggle</div>
      </div>`);
  });

  document.querySelectorAll('.rc').forEach(card => {
    card.addEventListener('click', () => toggleRace(card.dataset.raceId));
    card.classList.toggle('dimmed', hiddenRaces.has(card.dataset.raceId));
  });
}
// ─── ATHLETE MANAGEMENT ──────────────────────────────────────────────────────
function getAthleteRaceIds(slug) {
  return getActiveRaces()
    .filter(r => r.athleteSlug === slug || r.partnerSlug === slug)
    .map(r => r.id);
}

function syncAthleteChips() {
  document.querySelectorAll('.athlete-chip[data-slug]').forEach(chip => {
    const raceIds = getAthleteRaceIds(chip.dataset.slug);
    const allHidden = raceIds.length > 0 && raceIds.every(id => hiddenRaces.has(id));
    chip.classList.toggle('dimmed', allHidden);
  });
}

function buildAthleteList() {
  const list = document.getElementById('athleteList');
  if (!list) return;
  const seedSlugs = new Set(TRACKED_ATHLETES.map(a => a.slug));
  list.innerHTML = getTrackedAthletes().map(a => {
    const raceIds = getAthleteRaceIds(a.slug);
    const allHidden = raceIds.length > 0 && raceIds.every(id => hiddenRaces.has(id));
    const isSeed = seedSlugs.has(a.slug);
    const races = getActiveRaces().filter(r => r.athleteSlug === a.slug || r.partnerSlug === a.slug);
    const raceListHtml = races.length ? `
      <div class="athlete-race-list" id="rl-${a.slug}">
        ${races.map(r => `
          <label class="athlete-race-row">
            <input type="checkbox" class="athlete-race-cb" data-race-id="${r.id}" ${hiddenRaces.has(r.id) ? '' : 'checked'}>
            <span class="athlete-race-label">${r.label || r.id}</span>
          </label>`).join('')}
      </div>` : '';
    return `
    <div class="athlete-chip-wrap">
      <div class="athlete-chip${allHidden ? ' dimmed' : ''}" data-slug="${a.slug}" title="Click to toggle all races">
        <span class="athlete-chip-name">${a.name}</span>
        <span class="athlete-chip-slug">${a.slug}</span>
        ${isSeed ? '<span class="athlete-chip-seed">seed</span>' : ''}
        ${races.length ? `<button class="athlete-chip-expand" data-slug="${a.slug}" title="Show races">▾</button>` : ''}
        <button class="athlete-chip-remove" data-slug="${a.slug}"
                data-seed="${isSeed}"
                title="${isSeed ? 'Toggle races' : 'Remove athlete'}">×</button>
      </div>
      ${raceListHtml}
    </div>`;
  }).join('');

  // chip body → toggle all races
  list.querySelectorAll('.athlete-chip[data-slug]').forEach(chip => {
    chip.addEventListener('click', e => {
      if (e.target.classList.contains('athlete-chip-remove')) return;
      if (e.target.classList.contains('athlete-chip-expand')) return;
      toggleAthleteRaces(chip.dataset.slug);
    });
  });

  // expand button → show/hide race list
  list.querySelectorAll('.athlete-chip-expand').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const rl = document.getElementById(`rl-${btn.dataset.slug}`);
      if (!rl) return;
      const open = rl.classList.toggle('open');
      btn.textContent = open ? '▴' : '▾';
    });
  });

  // per-race checkbox
  list.querySelectorAll('.athlete-race-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = cb.dataset.raceId;
      if (cb.checked) hiddenRaces.delete(id);
      else {
        const wouldHideAll = getActiveRaces().every(r => hiddenRaces.has(r.id) || r.id === id);
        if (wouldHideAll) { cb.checked = true; return; }
        hiddenRaces.add(id);
      }
      document.querySelectorAll('.rc').forEach(card => {
        card.classList.toggle('dimmed', hiddenRaces.has(card.dataset.raceId));
      });
      syncAthleteChips();
      rebuildAllCharts();
      initTableRows();
      refreshTable();
      syncUrlHash();
    });
  });

  // remove button
  list.querySelectorAll('.athlete-chip-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (btn.dataset.seed === 'true') {
        toggleAthleteRaces(btn.dataset.slug);
      } else {
        const slug = btn.dataset.slug;
        athleteStore.remove(slug);
        removeAthleteRaces(slug);
        buildAthleteList();
        buildHeader();
        rebuildAllCharts();
        initTableRows();
        refreshTable();
        syncUrlHash();
      }
    });
  });
}

function toggleAthleteRaces(slug) {
  const raceIds = getAthleteRaceIds(slug);
  if (!raceIds.length) return;
  const allHidden = raceIds.every(id => hiddenRaces.has(id));
  if (allHidden) {
    raceIds.forEach(id => hiddenRaces.delete(id));
  } else {
    const wouldHideAll = getActiveRaces().every(r =>
      hiddenRaces.has(r.id) || raceIds.includes(r.id)
    );
    if (wouldHideAll) return;
    raceIds.forEach(id => hiddenRaces.add(id));
  }
  document.querySelectorAll('.rc').forEach(card => {
    card.classList.toggle('dimmed', hiddenRaces.has(card.dataset.raceId));
  });
  syncAthleteChips();
  rebuildAllCharts();
  initTableRows();
  refreshTable();
  syncUrlHash();
}

async function addTrackedAthlete() {
  const input  = document.getElementById('athleteInput');
  const status = document.getElementById('athleteSearchStatus');
  const btn    = document.getElementById('athleteAddBtn');
  const query  = input.value.trim().slice(0, 120);
  if (!query) return;

  btn.disabled = true;
  btn.textContent = '…';
  status.className = 'athlete-search-status';
  status.textContent = 'Looking up athlete…';

  const result = await lookupAthlete(query);

  btn.disabled = false;
  btn.textContent = '+ Add';

  if (!result) {
    status.className = 'athlete-search-status error';
    status.textContent = '✗ Not found. Check the name or paste a hyresult.com/athlete/… URL.';
    return;
  }

  if (getTrackedAthletes().some(a => a.slug === result.slug)) {
    status.className = 'athlete-search-status';
    status.textContent = `${result.name} is already tracked.`;
    return;
  }

  // Step 2: show race picker
  status.className = 'athlete-search-status success';
  status.textContent = `Found: ${result.name} — pick races to import`;
  input.value = '';
  showRacePicker(result.slug, result.name, result.races);
}

function showRacePicker(slug, name, races) {
  const panel = document.getElementById('racePickerPanel');
  if (!panel) return;

  const alreadyHave = new Set(RACES.map(r => r.resultId));
  const newRaces = races.filter(r => !alreadyHave.has(r.resultId));
  const existingRaces = races.filter(r => alreadyHave.has(r.resultId));

  panel.innerHTML = `
    <div class="race-picker-head">
      ${name} <span>· ${races.length} race${races.length !== 1 ? 's' : ''} found</span>
    </div>
    <div class="race-picker-list">
      ${newRaces.map(r => {
        const label = formatRaceLabel(r.text || r.resultId);
        return `
        <label class="race-picker-item">
          <input type="checkbox" value="${r.resultId}" data-text="${(r.text||r.resultId).replace(/"/g,'&quot;')}" checked>
          <span class="rp-label"><strong>${label.title}</strong><small>${label.sub}</small></span>
        </label>`;
      }).join('')}
      ${existingRaces.map(r => {
        const label = formatRaceLabel(r.text || r.resultId);
        return `
        <label class="race-picker-item already">
          <input type="checkbox" value="${r.resultId}" disabled>
          <span class="rp-label rp-label--already"><strong>${label.title}</strong><small>${label.sub}</small></span>
        </label>`;
      }).join('')}
    </div>
    <div class="race-picker-actions">
      <button class="race-picker-import-btn" id="racePickerImport">Import selected</button>
      <button class="race-picker-cancel-btn" id="racePickerCancel">Cancel</button>
      <button class="race-picker-select-all" id="racePickerSelectAll">select all / none</button>
    </div>
  `;
  panel.classList.remove('hidden');

  // toggle all
  let allSelected = true;
  panel.querySelector('#racePickerSelectAll').addEventListener('click', () => {
    allSelected = !allSelected;
    panel.querySelectorAll('.race-picker-list input:not([disabled])').forEach(cb => cb.checked = allSelected);
  });

  panel.querySelector('#racePickerCancel').addEventListener('click', () => {
    panel.classList.add('hidden');
    panel.innerHTML = '';
    document.getElementById('athleteSearchStatus').textContent = '';
  });

  panel.querySelector('#racePickerImport').addEventListener('click', async () => {
    const checked = [...panel.querySelectorAll('.race-picker-list input:checked')];
    if (!checked.length) return;

    const importBtn = panel.querySelector('#racePickerImport');
    importBtn.disabled = true;
    importBtn.textContent = 'Importing…';

    const status = document.getElementById('athleteSearchStatus');

    // Add athlete to store first
    athleteStore.add(slug, name);

    let added = 0, failed = 0;
    for (const cb of checked) {
      status.textContent = `Importing ${added + failed + 1} / ${checked.length}…`;
      const res = await importRaceById(cb.value, slug, cb.dataset.text || cb.value);
      if (res.status === 'added') added++;
      else if (res.status === 'error') failed++;
    }

    panel.classList.add('hidden');
    panel.innerHTML = '';

    status.className = failed ? 'athlete-search-status' : 'athlete-search-status success';
    status.textContent = added
      ? `✓ Imported ${added} race${added !== 1 ? 's' : ''} for ${name}${failed ? ` (⚠ ${failed} failed)` : ''}`
      : `⚠ Could not import races — CORS proxy blocked. Try again later.`;

    buildAthleteList();
    if (added) { rebuildAllCharts(); initTableRows(); refreshTable(); buildHeader(); }
  });
}

function initAthleteSearch() {
  const btn     = document.getElementById('athleteAddBtn');
  const input   = document.getElementById('athleteInput');
  const panel   = document.getElementById('athletesPanel');
  const overlay = document.getElementById('athletesPanelOverlay');
  const openBtn = document.getElementById('athletesPanelBtn');
  const closeBtn= document.getElementById('athletesPanelClose');
  if (!btn || !input || !panel) return;

  function openPanel() {
    panel.classList.add('open');
    overlay.classList.add('open');
    openBtn.classList.add('active');
    input.focus();
  }
  function closePanel() {
    panel.classList.remove('open');
    overlay.classList.remove('open');
    openBtn.classList.remove('active');
  }

  openBtn.addEventListener('click', () => panel.classList.contains('open') ? closePanel() : openPanel());
  closeBtn.addEventListener('click', closePanel);
  overlay.addEventListener('click', closePanel);

  btn.addEventListener('click', addTrackedAthlete);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') addTrackedAthlete(); });
  buildAthleteList();
}
// ─── CATEGORY TOGGLE ────────────────────────────────────────────────────────
function switchCategory(cat) {
  if (cat === activeCategory) return;
  activeCategory = cat;
  hiddenRaces.clear();

  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === cat);
  });

  buildHeader();
  rebuildAllCharts();
  initTableRows();
  refreshTable();
  syncUrlHash();
}

function initCategoryToggle() {
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => switchCategory(btn.dataset.cat));
  });
}

// ─── KEYBOARD SHORTCUTS MODAL ─────────────────────────────────────────────────
function showModal() {
  document.getElementById('shortcutsModal').classList.remove('hidden');
}
function hideModal() {
  document.getElementById('shortcutsModal').classList.add('hidden');
}

// ─── KEYBOARD SHORTCUTS ───────────────────────────────────────────────────────
const FILTER_KEYS = { 'a': 'all', 'r': 'run', 'w': 'workout', 'x': 'roxzone' };

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  const modal = document.getElementById('shortcutsModal');
  const isModalOpen = !modal.classList.contains('hidden');

  if (e.key === 'Escape') {
    if (isModalOpen) { hideModal(); return; }
    // reset: show all races + clear filters
    hiddenRaces.clear();
    document.querySelectorAll('.rc').forEach(c => c.classList.remove('dimmed'));
    document.querySelectorAll('.nav-race-dot').forEach(d => d.classList.remove('hidden-race'));
    rebuildAllCharts();
    initTableRows();
    resetTable();
    return;
  }

  if (e.key === '?') { showModal(); return; }
  if (isModalOpen) return;

  // race toggle keys — index-based so they work for any category
  const raceIdx = parseInt(e.key, 10) - 1;
  if (raceIdx >= 0) {
    const races = getActiveRaces();
    if (races[raceIdx]) { toggleRace(races[raceIdx].id); return; }
  }

  // table filter keys
  const filter = FILTER_KEYS[e.key.toLowerCase()];
  if (filter) {
    setTableFilter(filter);
    document.getElementById('table').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

// ─── SYNC BANNER ─────────────────────────────────────────────────────────────
let _syncInProgress = false;

function initSyncBanner() {
  const banner  = document.getElementById('syncBanner');
  const spinner = document.getElementById('syncSpinner');
  const msg     = document.getElementById('syncMsg');
  const close   = document.getElementById('syncClose');

  if (!banner) return;

  close.addEventListener('click', () => banner.classList.add('hidden'));

  // file:// pages are blocked by CORS proxies — skip auto-sync
  if (location.protocol === 'file:') {
    banner.classList.remove('hidden');
    spinner.style.display = 'none';
    msg.innerHTML = '⚠ Auto-sync unavailable on <code>file://</code>. '
      + 'Run via <code>npx serve .</code> in the hyrox-app folder for live sync.';
    return;
  }

  // show immediately while syncing
  if (_syncInProgress) return;
  _syncInProgress = true;
  banner.classList.remove('hidden');
  spinner.style.display = 'inline-block';
  msg.textContent = 'Checking for new races…';

  syncAthletes(
    (text) => { msg.textContent = text; },
    (added, error) => {
      _syncInProgress = false;
      spinner.style.display = 'none';
      if (error) {
        msg.textContent = `⚠ Sync failed: ${error}`;
        return;
      }
      if (added > 0) {
        msg.textContent = `✓ ${added} new race${added > 1 ? 's' : ''} added`;
        buildHeader();
        rebuildAllCharts();
        initTableRows();
        refreshTable();
      } else {
        msg.textContent = '✓ All races up to date';
        setTimeout(() => banner.classList.add('hidden'), 2500);
      }
    }
  );
}
// ─── NEWS TICKER ─────────────────────────────────────────────────────────────
function initTicker() {
  const track = document.getElementById('tickerTrack');
  const bar   = track && track.closest('.ticker-bar');
  if (!track) return;
  track.innerHTML += track.innerHTML;
  let pos = 0, paused = false;
  function tick() {
    if (!paused) {
      pos += 0.5;
      if (pos >= track.scrollWidth / 2) pos -= track.scrollWidth / 2;
      track.style.transform = 'translateX(' + (-pos) + 'px)';
    }
    requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange', () => { paused = document.hidden; });
  if (bar) {
    bar.addEventListener('mouseenter', () => { paused = true; });
    bar.addEventListener('mouseleave', () => { paused = false; });
  }
  requestAnimationFrame(tick);
}
// ─── NEWS SECTION ───────────────────────────────────────────────────────────
async function initNews() {
  const list = document.getElementById('newsList');
  if (!list) return;

  if (location.protocol === 'file:') {
    list.innerHTML = '<div class="news-offline">⚠ News unavailable on <code>file://</code>. Open via <code>npx serve .</code> for live feed.</div>';
    return;
  }

  const items = await fetchNews();
  if (!items || !items.length) {
    list.innerHTML = '<div class="news-offline">Could not load news feed.</div>';
    return;
  }

  function sanitizeText(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  list.innerHTML = items.map(item => {
    const d = new Date(item.date);
    const dateStr   = isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const safeTitle = sanitizeText(item.title);
    const safeDesc  = item.description ? sanitizeText(item.description) : '';
    const safeLink  = /^https?:\/\//i.test(item.link || '') ? item.link : '#';
    const safeImg   = /^https?:\/\//i.test(item.image || '') ? item.image : null;
    const imgHtml = safeImg
      ? `<div class="news-card-img"><img src="${safeImg}" alt="" loading="lazy"></div>`
      : `<div class="news-card-img news-card-img--placeholder"><span>📰</span></div>`;
    return `
    <a class="news-item" href="${safeLink}" target="_blank" rel="noopener noreferrer">
      ${imgHtml}
      <div class="news-card-body">
        ${dateStr ? `<div class="news-date">${dateStr}</div>` : ''}
        <div class="news-title">${safeTitle}</div>
        ${safeDesc ? `<div class="news-desc">${safeDesc}</div>` : ''}
      </div>
    </a>`;
  }).join('');
}

// ─── SHARE BUTTON ─────────────────────────────────────────────────────────────
function initShareButton() {
  const btn = document.getElementById('shareLinkBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    syncUrlHash();
    const url = location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        btn.textContent = '✓ Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = '🔗 Share'; btn.classList.remove('copied'); }, 2000);
      });
    } else {
      // Fallback: select a temp input
      const inp = document.createElement('input');
      inp.value = url;
      document.body.appendChild(inp);
      inp.select();
      document.execCommand('copy');
      document.body.removeChild(inp);
      btn.textContent = '✓ Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = '🔗 Share'; btn.classList.remove('copied'); }, 2000);
    }
  });
}

// ─── BACK TO TOP ─────────────────────────────────────────────────────────────
function initBackToTop() {
  const btn = document.getElementById('backToTop');
  if (!btn) return;
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });
}

// ─── SECTION COLLAPSE ────────────────────────────────────────────────────────
function initSectionToggles() {
  document.querySelectorAll('.section-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const body = document.getElementById(btn.dataset.target);
      if (!body) return;
      const collapsed = body.classList.toggle('collapsed');
      btn.classList.toggle('collapsed', collapsed);
      btn.title = collapsed ? 'Show' : 'Hide';
    });
  });
}

// ─── CSV EXPORT ───────────────────────────────────────────────────────────────
function initExport() {
  const btn = document.getElementById('exportCsv');
  if (!btn) return;
  btn.addEventListener('click', exportTableCSV);
}

// ─── QR CODE MODAL ───────────────────────────────────────────────────────────
function initQRCode() {
  const btn = document.getElementById('qrCodeBtn');
  const modal = document.getElementById('qrModal');
  const closeBtn = document.getElementById('qrModalClose');
  const container = document.getElementById('qrCodeContainer');
  
  if (!btn || !modal) return;
  
  btn.addEventListener('click', () => {
    // Generate QR code for current URL
    syncUrlHash();
    const url = location.href;
    
    // Clear previous QR code
    container.innerHTML = '';
    
    // Generate new QR code using qrcode npm package
    try {
      if (typeof QRCode !== 'undefined' && QRCode.toCanvas) {
        QRCode.toCanvas(url, { width: 200, margin: 1 }, (error, canvas) => {
          if (error) {
            console.error('QR code generation failed:', error);
            container.innerHTML = '<p style="color:red">Failed to generate QR code.</p>';
            return;
          }
          container.appendChild(canvas);
        });
      } else {
        console.error('QRCode is not defined or toCanvas not available');
        container.innerHTML = '<p style="color:red">QR code library not loaded. Please refresh the page.</p>';
      }
    } catch (e) {
      console.error('QR code generation error:', e);
      container.innerHTML = '<p style="color:red">Failed to generate QR code.</p>';
    }
    
    // Show modal
    modal.classList.remove('hidden');
  });
  
  // Close button
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }
  
  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
    }
  });
  
  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      modal.classList.add('hidden');
    }
  });
}

// ─── NETWORK STATUS ───────────────────────────────────────────────────────────
function initNetworkStatus() {
  const isOnline = () => navigator.onLine;
  
  const updateStatus = () => {
    if (!isOnline()) {
      // Show offline indicator
      const banner = document.getElementById('syncBanner');
      if (banner) {
        banner.classList.remove('hidden');
        banner.classList.add('error');
        document.getElementById('syncMsg').textContent = '⚠ You are offline. Some features may be limited.';
        document.getElementById('syncSpinner').style.display = 'none';
      }
    }
  };
  
  window.addEventListener('online', () => {
    // When back online, trigger sync
    const banner = document.getElementById('syncBanner');
    if (banner) {
      banner.classList.remove('error');
      banner.classList.remove('hidden');
      document.getElementById('syncMsg').textContent = 'Back online. Syncing…';
      document.getElementById('syncSpinner').style.display = 'inline-block';
      initSyncBanner();
    }
  });
  
  window.addEventListener('offline', updateStatus);
  
  // Initial check
  updateStatus();
}

// ─── OFFLINE DOWNLOAD BUTTON ───────────────────────────────────────────────────
function initOfflineDownload() {
  const btn = document.getElementById('offlineDownloadBtn');
  if (!btn) return;
  
  btn.addEventListener('click', async () => {
    if (!window.offlineDB) {
      btn.textContent = '⚠ Not supported';
      setTimeout(() => btn.textContent = '⬇ Offline', 2000);
      return;
    }
    
    btn.disabled = true;
    btn.textContent = '⏳ Saving…';
    
    try {
      // Save all current races to IndexedDB
      const races = getActiveRaces();
      await window.offlineDB.saveAllRaces(races);
      
      // Save tracked athletes
      const athletes = getTrackedAthletes();
      for (const athlete of athletes) {
        await window.offlineDB.saveAthlete(athlete);
      }
      
      btn.textContent = '✓ Saved';
      btn.classList.add('downloaded');
      setTimeout(() => {
        btn.textContent = '⬇ Offline';
        btn.classList.remove('downloaded');
      }, 3000);
    } catch (err) {
      console.error('Offline save failed:', err);
      btn.textContent = '⚠ Failed';
      setTimeout(() => btn.textContent = '⬇ Offline', 2000);
    } finally {
      btn.disabled = false;
    }
  });
}

// ─── SERVICE WORKER ───────────────────────────────────────────────────────────
function initServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./service-worker.js')
      .then(reg => {
        console.log('Service Worker registered:', reg);
      })
      .catch(err => {
        console.log('Service Worker registration failed:', err);
      });
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
function init() {
  initTheme();
  initThemeToggle();
  restoreFromHash();
  buildHeader();
  rebuildAllCharts();
  initTableRows();
  initCategoryToggle();
  refreshTable();
  setupTableFilter();
  initSectionToggles();
  initAthleteSearch();
  initTicker();
  initExport();
  initBackToTop();
  initShareButton();
  initQRCode();
  initOfflineDownload();
  initNetworkStatus();
  initServiceWorker();
  if (window.initSimulator) initSimulator();
  // modal wiring
  const modalClose = document.getElementById('modalClose');
  if (modalClose) modalClose.addEventListener('click', hideModal);
  const shortcutsModal = document.getElementById('shortcutsModal');
  if (shortcutsModal) shortcutsModal.addEventListener('click', e => {
    if (e.target === e.currentTarget) hideModal();
  });

  // sync runs async after UI is ready
  initSyncBanner();
}

window.addEventListener('DOMContentLoaded', init);
