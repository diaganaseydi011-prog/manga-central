import ParserFactory from './parsers/ParserFactory.js';
import AutoScroller from './autoscroll.js';
import UIManager from './ui.js';

// Dernière URL vue (pour détecter les changements sans rechargement, ex. SPA)
let lastUrl = '';

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
  window.hasMangaCentralRun = true;

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