// Runs in the page's main world (injected via inject-loader.js).
// Intercepts LinkedIn's fetch/XHR calls to detect reposted jobs from the raw
// API response before they are rendered, then notifies the content script.
'use strict';

(function () {
  function urnToJobId(urn) {
    if (typeof urn !== 'string') return null;
    const m = urn.match(/jobPosting[:\s](\d+)/i);
    return m ? m[1] : null;
  }

  function emit(jobId) {
    if (!jobId) return;
    window.postMessage({ type: 'RRB_REPOSTED_JOB', jobId: String(jobId) }, '*');
  }

  // Walk a parsed LinkedIn API response looking for job postings where
  // renewedAt > listedAt (i.e. the job was reposted after its original listing).
  function scan(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 10) return;

    // Job posting object: has both listedAt and renewedAt timestamps
    if (
      typeof obj.listedAt === 'number' &&
      typeof obj.renewedAt === 'number' &&
      obj.renewedAt > obj.listedAt
    ) {
      const jobId =
        urnToJobId(obj.entityUrn) ||
        String(obj.jobPostingId || obj.id || '');
      if (jobId) emit(jobId);
    }

    // Explicit repost flag (some API versions)
    if (obj.repostedJob === true || obj.isRepost === true) {
      const jobId =
        urnToJobId(obj.entityUrn) ||
        String(obj.jobPostingId || obj.id || '');
      if (jobId) emit(jobId);
    }

    if (Array.isArray(obj)) {
      for (const item of obj) scan(item, depth + 1);
    } else {
      for (const val of Object.values(obj)) {
        if (val && typeof val === 'object') scan(val, depth + 1);
      }
    }
  }

  function process(url, text) {
    // Only check job-related LinkedIn API endpoints
    const isJobUrl =
      url.includes('/voyagerJobsDash') ||
      url.includes('/jobPosting') ||
      url.includes('/jobs/view/') ||
      /voyager\/api.*job/i.test(url);

    if (!isJobUrl) return;

    // Quick pre-filter before expensive JSON parse
    if (!/renew|repost/i.test(text)) return;

    let data;
    try { data = JSON.parse(text); } catch (_) { return; }

    scan(data, 0);
  }

  // ── Intercept fetch ──────────────────────────────────────────────────────────

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const url = args[0] instanceof Request ? args[0].url : String(args[0] || '');
      process(url, await res.clone().text());
    } catch (_) {}
    return res;
  };

  // ── Intercept XHR ────────────────────────────────────────────────────────────

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._rrbUrl = String(url || '');
    return origOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', () => {
      try { process(this._rrbUrl || '', this.responseText); } catch (_) {}
    });
    return origSend.apply(this, args);
  };
})();
