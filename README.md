# LinkedIn Reposted Job Remover

A lightweight Chrome/Edge extension that automatically detects and hides job listings marked **"Reposted X days ago"** on LinkedIn job search pages.

## Features

- **Auto-hide** – Reposted jobs disappear from your results the moment the page loads or new cards appear (infinite scroll supported).
- **Badge mode** – Turn hiding off to see all jobs, with a black "Reposted" badge on recycled listings so you can spot them at a glance.
- **Live count** – The popup shows how many jobs were hidden on the current page.
- **Toggle anytime** – Flip the switch in the popup to instantly show or re-hide reposted jobs without reloading the page.
- **Persistent setting** – Your preference is saved via `chrome.storage.sync` and restored on every visit.
- **No tracking** – Everything runs locally; no data ever leaves your browser.

## Installation (developer mode)

1. Clone or download this repository.
2. Open **chrome://extensions** (or **edge://extensions**).
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `reposted-remover` folder.
5. Navigate to **linkedin.com/jobs** and search for jobs.

## How it works

The content script (`content.js`) attaches a `MutationObserver` to `document.body` so it catches job cards loaded by LinkedIn's infinite scroll. For each card it checks whether the card's text or `aria-label` attributes match the pattern `/reposted/i`. Matching cards are either hidden (`display: none`) or badged depending on the toggle state.

## File overview

```
manifest.json      – Extension manifest (MV3)
content.js         – Content script injected on linkedin.com/jobs/*
styles.css         – Badge styling injected alongside the content script
popup.html         – Popup UI
popup.css          – Popup styles
popup.js           – Popup logic (reads count, sends toggle message)
icons/             – Extension icons (replace placeholders with real art)
generate-icons.js  – Helper to regenerate placeholder icons
```

## Replacing placeholder icons

The `icons/` directory contains minimal placeholder PNGs. Before publishing, replace them with proper 16×16, 48×48, and 128×128 artwork. Run `node generate-icons.js` if you need to regenerate the placeholders.

## Permissions

| Permission | Reason |
|---|---|
| `storage` | Save the hide/badge preference across sessions |
| `host_permissions: linkedin.com/*` | Inject the content script on LinkedIn job pages |
