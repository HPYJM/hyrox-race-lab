// ─── URL HASH STATE ─────────────────────────────────────────────────────────────
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
        <div class="athlete">${athleteLine}</div>
        <div class="event">${r.label}</div>
        <div class="total">${r.total}</div>
        <div class="rank">${r.rank} · ${r.ag}</div>
        <div class="mini-grid">
          <div class="mini-stat"><div class="lbl">Runs</div><div class="val">${fmt(r.runsSecs)}</div></div>
          <div class="mini-stat"><div class="lbl">Workouts</div><div class="val">${fmt(r.workoutsSecs)}</div></div>
          <div class="mini-stat"><div class="lbl">Roxzone</div><div class="val">${fmt(r.roxzoneSecs)}</div></div>
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
    return `
    <div class="athlete-chip${allHidden ? ' dimmed' : ''}" data-slug="${a.slug}" title="Click to toggle races">
      <span class="athlete-chip-name">${a.name}</span>
      <span class="athlete-chip-slug">${a.slug}</span>
      ${isSeed
        ? '<span class="athlete-chip-seed">seed</span>'
        : ''}
      <button class="athlete-chip-remove" data-slug="${a.slug}"
              data-seed="${isSeed}"
              title="${isSeed ? 'Toggle races' : 'Remove athlete'}">×</button>
    </div>`;
  }).join('');

  list.querySelectorAll('.athlete-chip[data-slug]').forEach(chip => {
    // click chip body → toggle all races
    chip.addEventListener('click', e => {
      if (e.target.classList.contains('athlete-chip-remove')) return;
      toggleAthleteRaces(chip.dataset.slug);
    });
  });

  list.querySelectorAll('.athlete-chip-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (btn.dataset.seed === 'true') {
        // seed: just toggle visibility
        toggleAthleteRaces(btn.dataset.slug);
      } else {
        athleteStore.remove(btn.dataset.slug);
        buildAthleteList();
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
  const query  = input.value.trim().slice(0, 120); // cap length
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

  athleteStore.add(result.slug, result.name);
  input.value = '';
  status.className = 'athlete-search-status success';
  status.textContent = `✓ Added ${result.name} — sync will pick up their races on next load.`;
  buildAthleteList();
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
  if (!track) return;
  track.innerHTML += track.innerHTML;
  let pos = 0;
  let rafId = null;
  function tick() {
    pos += 0.5;
    if (pos >= track.scrollWidth / 2) pos -= track.scrollWidth / 2;
    track.style.transform = 'translateX(' + (-pos) + 'px)';
    rafId = requestAnimationFrame(tick);
  }
  // Pause when tab is hidden to save CPU/battery
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    } else {
      if (!rafId) rafId = requestAnimationFrame(tick);
    }
  });
  rafId = requestAnimationFrame(tick);
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

// ─── INIT ─────────────────────────────────────────────────────────────────────
function init() {  restoreFromHash();  buildHeader();
  rebuildAllCharts();
  initTableRows();
  refreshTable();
  setupTableFilter();
  initCategoryToggle();
  initSectionToggles();
  initAthleteSearch();
  initTicker();
  initExport();
  initBackToTop();
  initShareButton();
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
