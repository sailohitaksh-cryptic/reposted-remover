const toggle = document.getElementById('toggle');
const countEl = document.getElementById('count');
const modeHide = document.getElementById('mode-hide');
const modeBadge = document.getElementById('mode-badge');

function updateModeUI(hide) {
  modeHide.classList.toggle('active', hide);
  modeBadge.classList.toggle('active', !hide);
}

// Load saved preference
chrome.storage.sync.get({ hideReposted: true }, ({ hideReposted }) => {
  toggle.checked = hideReposted;
  updateModeUI(hideReposted);
});

// Query the active tab for the current hidden count
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, { type: 'RRB_GET_COUNT' }, (resp) => {
    if (chrome.runtime.lastError) return; // content script not on this page
    if (resp && resp.count != null) countEl.textContent = resp.count;
  });
});

// Handle toggle change
toggle.addEventListener('change', () => {
  const hide = toggle.checked;
  chrome.storage.sync.set({ hideReposted: hide });
  updateModeUI(hide);

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: 'RRB_TOGGLE', hide }, (resp) => {
      if (chrome.runtime.lastError) return;
      if (resp && resp.count != null) countEl.textContent = resp.count;
    });
  });
});
