// Runs at document_start to inject the fetch interceptor into the page's main
// world before LinkedIn makes its first job API calls.
const s = document.createElement('script');
s.src = chrome.runtime.getURL('injected.js');
(document.head || document.documentElement).appendChild(s);
