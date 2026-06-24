// Selectors for LinkedIn job cards and the repost label
const JOB_CARD_SELECTOR = 'li.jobs-search-results__list-item, li.job-card-container, li[data-occludable-job-id]';
const REPOST_PATTERN = /reposted/i;

let hideEnabled = true;
let hiddenCount = 0;

function isReposted(card) {
  // LinkedIn surfaces the repost label in several places depending on layout
  const text = card.innerText || '';
  if (REPOST_PATTERN.test(text)) return true;

  // Also check aria-labels and data attributes
  const labels = card.querySelectorAll('[aria-label]');
  for (const el of labels) {
    if (REPOST_PATTERN.test(el.getAttribute('aria-label'))) return true;
  }
  return false;
}

function applyToCard(card) {
  if (card.dataset.repostedProcessed) return;
  card.dataset.repostedProcessed = '1';

  if (!isReposted(card)) return;

  card.dataset.reposted = '1';

  if (hideEnabled) {
    hideCard(card);
  } else {
    badgeCard(card);
  }
}

function hideCard(card) {
  card.style.display = 'none';
  hiddenCount++;
  updateBadge();
}

function badgeCard(card) {
  if (card.querySelector('.rrb-badge')) return;
  const badge = document.createElement('span');
  badge.className = 'rrb-badge';
  badge.textContent = 'Reposted';
  card.style.position = 'relative';
  card.prepend(badge);
}

function updateBadge() {
  window.postMessage({ type: 'RRB_COUNT', count: hiddenCount }, '*');
}

function processAll() {
  const cards = document.querySelectorAll(JOB_CARD_SELECTOR);
  cards.forEach(applyToCard);
}

function applyHideState(enabled) {
  hideEnabled = enabled;
  hiddenCount = 0;

  document.querySelectorAll('[data-reposted="1"]').forEach(card => {
    // Remove badge if present
    const badge = card.querySelector('.rrb-badge');
    if (badge) badge.remove();

    if (hideEnabled) {
      card.style.display = 'none';
      hiddenCount++;
    } else {
      card.style.display = '';
      badgeCard(card);
    }
  });

  // Reset processed flag so new cards run through applyToCard fresh
  document.querySelectorAll('[data-reposted-processed="1"]:not([data-reposted="1"])').forEach(card => {
    delete card.dataset.repostedProcessed;
  });

  updateBadge();
}

// Load initial setting from storage via background-less messaging
chrome.storage.sync.get({ hideReposted: true }, ({ hideReposted }) => {
  hideEnabled = hideReposted;
  processAll();
});

// Listen for toggle messages from the popup
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'RRB_TOGGLE') {
    hideEnabled = msg.hide;
    applyHideState(hideEnabled);
  }
  if (msg.type === 'RRB_GET_COUNT') {
    return Promise.resolve({ count: hiddenCount });
  }
});

// MutationObserver to catch dynamically loaded job cards (infinite scroll / pagination)
const observer = new MutationObserver(() => {
  processAll();
});

observer.observe(document.body, { childList: true, subtree: true });
