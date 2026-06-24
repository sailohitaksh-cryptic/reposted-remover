'use strict';

const REPOST_RE = /reposted/i;
let hideEnabled = true;
let hiddenCount = 0;
let debounceTimer = null;

// Multiple selectors to cover LinkedIn's various layouts and A/B tests.
// The outer <li> is the most stable anchor.
const CARD_SEL =
  'li.jobs-search-results__list-item, ' +
  'li[data-occludable-job-id], ' +
  'div.job-card-container, ' +
  'li[class*="jobs-search-results"]';

// ── Detection ─────────────────────────────────────────────────────────────────
// Uses textContent (not innerText) so hidden/aria elements are included.
// LinkedIn renders "Reposted X ago" in aria-labels on the job title link
// even when the visible card text shows "Viewed · Promoted".

function isReposted(card) {
  if (REPOST_RE.test(card.textContent)) return true;
  for (const el of card.querySelectorAll('[aria-label]')) {
    if (REPOST_RE.test(el.getAttribute('aria-label'))) return true;
  }
  return false;
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

// ── Scan ──────────────────────────────────────────────────────────────────────

function processAll() {
  // Pass 1: walk known card containers
  document.querySelectorAll(CARD_SEL).forEach(card => {
    if (!card.dataset.rrbReposted && isReposted(card)) applyCard(card);
  });

  // Pass 2: find aria-label="... Reposted ..." anywhere on the page,
  // then walk up to the nearest list-item ancestor.
  // This catches cards where visible text says "Viewed" but aria-label
  // still contains the original "Reposted X ago" string.
  document.querySelectorAll('[aria-label]').forEach(el => {
    if (!REPOST_RE.test(el.getAttribute('aria-label'))) return;
    const card = el.closest('li, article, [data-job-id], [data-occludable-job-id], div.job-card-container');
    if (card && !card.dataset.rrbReposted) applyCard(card);
  });

  broadcastCount();
}

function broadcastCount() {
  window.postMessage({ type: 'RRB_COUNT', count: hiddenCount }, '*');
}

// ── Detail panel ──────────────────────────────────────────────────────────────
// When a user clicks a job, LinkedIn loads a detail panel on the right.
// If it says "Reposted", find the active/selected card in the list and mark it.

let lastDetailSnippet = '';

function checkDetailPanel() {
  const panel = document.querySelector(
    '.jobs-unified-top-card, ' +
    '.jobs-search__job-details--wrapper, ' +
    '.job-view-layout'
  );
  if (!panel) return;

  const snippet = panel.textContent.slice(0, 500);
  if (snippet === lastDetailSnippet) return;
  lastDetailSnippet = snippet;

  if (!REPOST_RE.test(snippet)) return;

  // LinkedIn marks the selected card with --active or aria-selected
  const active =
    document.querySelector('.job-card-container--active') ||
    document.querySelector('[aria-selected="true"]') ||
    null;

  if (active && !active.dataset.rrbReposted) {
    applyCard(active);
    broadcastCount();
  }
}

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

chrome.storage.sync.get({ hideReposted: true }, ({ hideReposted }) => {
  hideEnabled = hideReposted;
  processAll();
  checkDetailPanel();
});

// Debounced observer handles infinite scroll and lazy-loaded card content.
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    processAll();
    checkDetailPanel();
  }, 150);
});

observer.observe(document.body, { childList: true, subtree: true });
