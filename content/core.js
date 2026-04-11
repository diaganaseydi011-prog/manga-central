import ParserFactory from './parsers/ParserFactory.js';
import AutoScroller from './autoscroll.js';
import UIManager from './ui.js';

// Dernière URL vue (pour détecter les changements sans rechargement, ex. SPA)
let lastUrl = '';

function getHostnameNoWww() {
  return (location.hostname || '').replace(/^www\./i, '').toLowerCase();
}

function isExtensionInactiveForPage(settings) {
  const s = settings || {};
  if (s.extensionDisabled === true) return true;
  const host = getHostnameNoWww();
  const hosts = Array.isArray(s.disabledHosts) ? s.disabledHosts : [];
  return hosts.some((h) => String(h).replace(/^www\./i, '').toLowerCase() === host);
}

let extensionToggleWatchInstalled = false;
function watchExtensionToggleReload() {
  if (extensionToggleWatchInstalled) return;
  extensionToggleWatchInstalled = true;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    const prev = changes.settings.oldValue && typeof changes.settings.oldValue === 'object' ? changes.settings.oldValue : {};
    const next = changes.settings.newValue && typeof changes.settings.newValue === 'object' ? changes.settings.newValue : {};
    const was = isExtensionInactiveForPage(prev);
    const now = isExtensionInactiveForPage(next);
    if (was !== now) location.reload();
  });
}

async function detectAndApply(ui) {
  try {
    const parser = await ParserFactory.getParser(window.location.href, document);
    const meta = await parser.getMeta();
    if (meta && meta.chapter !== 'Inconnu') {
      meta.url = window.location.href;
      console.log('📖 [MangaCentral] Manga détecté :', meta);
      chrome.runtime.sendMessage({ type: 'CHAPTER_DETECTED', payload: meta });
      return { meta, parser };
    }
  } catch (err) {
    // Page non reconnue comme manga
  }
  return null;
}

function startUrlWatch(ui) {
  const checkUrl = async () => {
    const current = window.location.href;
    if (current === lastUrl) return;
    lastUrl = current;
    const result = await detectAndApply(ui);
    if (result && ui.shadowRoot) {
      ui.updateMeta(result.meta, result.parser);
    }
  };

  window.addEventListener('popstate', checkUrl);

  const origPush = history.pushState;
  const origReplace = history.replaceState;
  if (origPush) {
    history.pushState = function (...args) {
      origPush.apply(this, args);
      checkUrl();
    };
  }
  if (origReplace) {
    history.replaceState = function (...args) {
      origReplace.apply(this, args);
      checkUrl();
    };
  }

  setInterval(checkUrl, 1500);
}

(async () => {
  if (window.hasMangaCentralRun) return;

  const { settings = {} } = await chrome.storage.local.get('settings');
  if (isExtensionInactiveForPage(settings)) {
    window.hasMangaCentralRun = true;
    watchExtensionToggleReload();
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type !== 'GET_META') return false;
      sendResponse({ error: 'extension_disabled' });
      return false;
    });
    return;
  }

  window.hasMangaCentralRun = true;
  watchExtensionToggleReload();

  console.log('🚀 [MangaCentral] Core Initialized');

  const parser = await ParserFactory.getParser(window.location.href, document);
  const autoScroller = new AutoScroller();
  const ui = new UIManager(parser, autoScroller);

  try {
    const result = await detectAndApply(ui);
    if (result) {
      ui.init(result.meta);
      lastUrl = window.location.href;
      startUrlWatch(ui);
    }
  } catch (err) {
    // Page non manga
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== 'GET_META') return false;
    (async () => {
      try {
        const p = await ParserFactory.getParser(window.location.href, document);
        const meta = await p.getMeta();
        if (meta && meta.chapter !== 'Inconnu') {
          meta.url = window.location.href;
          sendResponse({ meta, url: window.location.href });
        } else {
          sendResponse({ error: 'not_manga_page' });
        }
      } catch (e) {
        sendResponse({ error: 'not_manga_page' });
      }
    })();
    return true;
  });
})();