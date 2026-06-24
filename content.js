'use strict';

const REPOST_RE = /reposted/i;
let hideEnabled = true;
let hiddenCount = 0;
let debounceTimer = null;

// Known reposted job IDs (populated from API interception + detail panel + storage).
const repostedIds = new Set();

// LinkedIn uses various class names; cover the main layouts.
const CARD_SEL =
  'li.jobs-search-results__list-item, ' +
  'li[data-occludable-job-id], ' +
  'div.job-card-container, ' +
  'li[class*="jobs-search-results"]';

// ── Job-ID utilities ──────────────────────────────────────────────────────────

function getCardJobId(card) {
  const id =
    card.dataset.jobId ||
    card.dataset.occludableJobId ||
    card.querySelector('[data-job-id]')?.dataset.jobId ||
    card.querySelector('[data-entity-urn]')?.dataset.entityUrn?.match(/jobPosting:(\d+)/)?.[1];
  if (id) return String(id);

  const link = card.querySelector('a[href*="/jobs/view/"]');
  if (link) {
    const m = link.href.match(/jobs\/view\/(\d+)/);
    if (m) return m[1];
  }
  return null;
}

function findCardByJobId(jobId) {
  let el = document.querySelector(`[data-job-id="${jobId}"]`);
  if (el) return el.closest(CARD_SEL) || el;

  el = document.querySelector(`[data-occludable-job-id="${jobId}"]`);
  if (el) return el;

  const link = document.querySelector(`a[href*="/jobs/view/${jobId}"]`);
  return link ? link.closest('li, div.job-card-container') : null;
}

// ── Detection ─────────────────────────────────────────────────────────────────

function isReposted(card) {
  // textContent captures all text nodes including hidden/aria ones
  if (REPOST_RE.test(card.textContent)) return true;

  for (const el of card.querySelectorAll('[aria-label]')) {
    if (REPOST_RE.test(el.getAttribute('aria-label'))) return true;
  }

  const id = getCardJobId(card);
  return id ? repostedIds.has(id) : false;
}

// ── Apply ─────────────────────────────────────────────────────────────────────

function addBadge(card) {
  if (card.querySelector('.rrb-badge')) return;
  const badge = document.createElement('span');
  badge.className = 'rrb-badge';
  badge.textContent = 'Reposted';
  card.style.position = 'relative';
  card.prepend(badge);
}

function applyCard(card) {
  if (card.dataset.rrbReposted) return;
  card.dataset.rrbReposted = '1';
  if (hideEnabled) {
    card.style.display = 'none';
    hiddenCount++;
  } else {
    addBadge(card);
  }
}

// ── Record a confirmed reposted job ID ────────────────────────────────────────

function markJobId(jobId) {
  if (repostedIds.has(jobId)) {
    // Already known — just make sure the card is hidden if it's on screen
    const card = findCardByJobId(jobId);
    if (card && !card.dataset.rrbReposted) { applyCard(card); broadcastCount(); }
    return;
  }

  repostedIds.add(jobId);

  // Persist (cap at 1000 to bound storage size)
  chrome.storage.local.get({ repostedJobIds: [] }, ({ repostedJobIds }) => {
    if (!repostedJobIds.includes(jobId)) {
      repostedJobIds.push(jobId);
      if (repostedJobIds.length > 1000) repostedJobIds = repostedJobIds.slice(-1000);
      chrome.storage.local.set({ repostedJobIds });
    }
  });

  const card = findCardByJobId(jobId);
  if (card && !card.dataset.rrbReposted) { applyCard(card); broadcastCount(); }
}

// ── Full page scan ────────────────────────────────────────────────────────────

function processAll() {
  // Pass 1: check known card containers via text/aria-label/stored IDs
  document.querySelectorAll(CARD_SEL).forEach(card => {
    if (!card.dataset.rrbReposted && isReposted(card)) applyCard(card);
  });

  // Pass 2: find aria-labels with "Reposted" anywhere, walk up to card
  document.querySelectorAll('[aria-label]').forEach(el => {
    if (!REPOST_RE.test(el.getAttribute('aria-label'))) return;
    const card = el.closest('li, article, div.job-card-container, [data-job-id], [data-occludable-job-id]');
    if (card && !card.dataset.rrbReposted) applyCard(card);
  });

  broadcastCount();
}

function broadcastCount() {
  window.postMessage({ type: 'RRB_COUNT', count: hiddenCount }, '*');
}

// ── Detail panel ──────────────────────────────────────────────────────────────
// LinkedIn only shows "Reposted X ago" in the right-side detail panel, not on
// the list cards. When the panel changes and says "Reposted", extract the job
// ID from the URL (?currentJobId=XXX) and hide that card.

let lastDetailSnippet = '';

function checkDetailPanel() {
  const panel = document.querySelector(
    '.jobs-unified-top-card, ' +
    '.jobs-search__job-details--wrapper, ' +
    '.job-view-layout'
  );
  if (!panel) return;

  const snippet = panel.textContent.slice(0, 600);
  if (snippet === lastDetailSnippet) return;
  lastDetailSnippet = snippet;

  if (!REPOST_RE.test(snippet)) return;

  // Primary: get the job ID from the URL param LinkedIn always sets
  const jobId = new URLSearchParams(window.location.search).get('currentJobId');
  if (jobId) {
    markJobId(jobId);
    return;
  }

  // Fallback: use the visually-selected card
  const active =
    document.querySelector('.job-card-container--active') ||
    document.querySelector('[aria-selected="true"]');
  if (active) {
    const id = getCardJobId(active);
    if (id) markJobId(id);
    else if (!active.dataset.rrbReposted) { applyCard(active); broadcastCount(); }
  }
}

// ── Listen for API-interception messages from injected.js ────────────────────

window.addEventListener('message', ({ source, data }) => {
  if (source !== window || data?.type !== 'RRB_REPOSTED_JOB') return;
  markJobId(String(data.jobId));
});

// ── Toggle ────────────────────────────────────────────────────────────────────

function applyToggle(hide) {
  hideEnabled = hide;
  hiddenCount = 0;
  document.querySelectorAll('[data-rrb-reposted]').forEach(card => {
    card.querySelector('.rrb-badge')?.remove();
    if (hide) {
      card.style.display = 'none';
      hiddenCount++;
    } else {
      card.style.display = '';
      addBadge(card);
    }
  });
  broadcastCount();
}

// ── Messages ──────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'RRB_TOGGLE') {
    applyToggle(msg.hide);
    sendResponse({ count: hiddenCount });
    return false;
  }
  if (msg.type === 'RRB_GET_COUNT') {
    sendResponse({ count: hiddenCount });
    return false;
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────

// Restore persisted reposted job IDs from previous sessions
chrome.storage.local.get({ repostedJobIds: [] }, ({ repostedJobIds }) => {
  repostedJobIds.forEach(id => repostedIds.add(id));
  processAll(); // re-scan with restored IDs in case cards are already rendered
});

chrome.storage.sync.get({ hideReposted: true }, ({ hideReposted }) => {
  hideEnabled = hideReposted;
  processAll();
  checkDetailPanel();
});

// Debounced MutationObserver handles infinite scroll + lazy card content
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    processAll();
    checkDetailPanel();
  }, 150);
});

observer.observe(document.body, { childList: true, subtree: true });
