// background.js - Service Worker

// Caches simples en mémoire (réinitialisés quand le service worker se recrée)
const SEARCH_CACHE = new Map();

function normalizeTitleKey(title) {
  const t = (title || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Retire suffixes de site fréquemment injectés dans <title>
    .replace(/\s*[-|–—]\s*(?:mangamoins(?:\.[a-z]{2,})?|manga\s*moins)\s*$/i, '')
    .replace(/\s*[|–—-]\s*(?:scan|scans|manga|manhwa|webtoon)\b.*$/i, '')
    .replace(/\s*[-|–—]\s*(?:chapter|chapitre|chap|ch\.?)\s*\d+(?:\.\d+)?\s*.*$/i, '')
    .replace(/\s*\b(?:chapter|chapitre|chap|ch\.?)\s*\d+(?:\.\d+)?\s*.*$/i, '')
    // Retire les patterns "OP1177" / numéros finaux (souvent des chapitres)
    .replace(/\bop\s*\d+\b/gi, '')
    .replace(/\bop\d+\b/gi, '')
    .replace(/\b\d+(?:\.\d+)?\b\s*$/i, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
  // Si mangamoins est au milieu, on le retire aussi
  return t.replace(/\bmangamoins\b/gi, '').replace(/\s+/g, ' ').trim();
}

function getWorkKeyFromUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const parts = u.pathname.split('/').filter(Boolean);
    // MangaMoins: pages du type https://mangamoins.com/scan/<slug>
    if (host === 'mangamoins.com' && parts[0] === 'scan' && parts[1]) {
      const raw = parts[1].toString();
      // Si le slug ressemble à un ID de chapitre (ex: OP1177), ne pas l'utiliser comme clé d'œuvre
      if (/^op\d+$/i.test(raw.replace(/\s+/g, ''))) return '';
      const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      return `mangamoins:scan:${slug}`;
    }
    return '';
  } catch {
    return '';
  }
}

function getWorkKey(metaTitle, url) {
  const urlKey = getWorkKeyFromUrl(url);
  if (urlKey) return urlKey;
  const titleKey = normalizeTitleKey(metaTitle);
  return titleKey ? `title:${titleKey}` : '';
}

/** Identifiant stable pour l'historique (UTF-8 → base64, sans utiliser btoa). */
function idFromTitleAndChapter(title, chapter) {
  const raw = String(title || '') + '\0' + String(chapter ?? '');
  const bytes = new TextEncoder().encode(raw);
  const base64abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i;
  for (i = 0; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    result +=
      base64abc[(n >>> 18) & 63] +
      base64abc[(n >>> 12) & 63] +
      base64abc[(n >>> 6) & 63] +
      base64abc[n & 63];
  }
  if (i < bytes.length) {
    let n = bytes[i] << 16;
    let pad = '==';
    if (i + 1 < bytes.length) {
      n |= bytes[i + 1] << 8;
      pad = '=';
    }
    result +=
      base64abc[(n >>> 18) & 63] +
      base64abc[(n >>> 12) & 63] +
      (pad === '==' ? '=' : base64abc[(n >>> 6) & 63]) +
      pad;
  }
  return result;
}

// 1. Gestion de l'installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('MangaCentral installé.');
  chrome.storage.local.get(['readingHistory', 'settings', 'library'], (result) => {
    if (!result.readingHistory) chrome.storage.local.set({ readingHistory: [] });
    if (!result.library) chrome.storage.local.set({ library: [] });
    if (!result.settings) chrome.storage.local.set({ settings: { autoScrollSpeed: 2 } });
  });
});

// 2. Gestion des Messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'CHAPTER_DETECTED':
      StorageService.handleChapterDetected(message.payload, sender);
      break;
    case 'CAPTURE_TAB':
      OcrService.handleCaptureTab(sender, sendResponse);
      return true; // Important pour sendResponse asynchrone
    case 'TRANSLATE_TEXT':
      OcrService.handleTranslation(message.payload, sendResponse);
      return true;
    case 'SEARCH_MANGA':
      SearchService.handleSearch(message.payload, sendResponse);
      return true;
    case 'GET_CURRENT_PAGE_META':
      handleGetCurrentPageMeta(sendResponse);
      return true;
    case 'OPEN_TAB':
      if (message.url) chrome.tabs.create({ url: message.url });
      break;
    case 'FETCH_IMAGE_DATAURL':
      MediaService.fetchImageAsDataUrl(message.payload, sendResponse);
      return true;
  }
});

function handleGetCurrentPageMeta(sendResponse) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) {
      sendResponse({ error: 'no_tab' });
      return;
    }
    const tabId = tabs[0].id;
    chrome.tabs.sendMessage(tabId, { type: 'GET_META' }, (response) => {
      if (!chrome.runtime.lastError) {
        const res = response || { error: 'no_data' };
        // Fallback cover: si le parser ne fournit pas de cover, tente og:image/twitter:image
        if (res && !res.error && res.meta && (!res.meta.cover || !String(res.meta.cover).trim())) {
          chrome.scripting.executeScript(
            {
              target: { tabId },
              world: 'MAIN',
              func: () => {
                const pick = (sel) => {
                  const el = document.querySelector(sel);
                  return el && el.content ? el.content : '';
                };
                return (
                  pick('meta[property="og:image"]') ||
                  pick('meta[name="twitter:image"]') ||
                  pick('meta[property="twitter:image"]') ||
                  ''
                );
              }
            },
            (results) => {
              const cover = results && results[0] && results[0].result ? String(results[0].result) : '';
              if (cover && res.meta) res.meta.cover = cover;
              sendResponse(res);
            }
          );
          return;
        }
        sendResponse(res);
        return;
      }
      // Content script absent : extraire les meta en page (toutes variantes URL)
      chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
          const getChapterFromUrl = (href) => {
            if (!href) return null;
            const pathOnly = href.split('?')[0].replace(/#.*$/, '');
            const pathPatterns = [
              /[?&](?:chapter|chapitre|chap)=(\d+(?:\.\d+)?)/i, /[?&]ch=(\d+(?:\.\d+)?)/i, /[?&]c=(\d+)/i,
              /(?:chapter|chapitre|chap)[-_\/]?(\d+(?:\.\d+)?)/i, /(?:chapter|chapitre)s?\/(\d+)/i,
              /\/ch[-_]?(\d+)(?:\/|$)/i, /\/c(\d+)(?:\/|$)/i, /chap[-_](\d+)/i, /vol-\d+\/chap[-_]?(\d+)/i,
              /chapter-(\d+)\.html/i, /chapter-(\d+)(?:-|\.|$)/i, /chapters\/(\d+)/i,
              /episode[-_]?(\d+)/i, /episode\/(\d+)/i, /viewer\/(\d+)/i, /\/view\/(\d+)(?:\/|$)/i,
              /\/read\/[^/]+\/[^/]+\/\d+\/(\d+)\/?/i,
              /(?:manga|manhwa|comics?|scan-vf)\/[^/]+\/[^/]+\/(\d+)\/?/i,
              /(?:library|directory|archives|online)\/[^/]+\/[^/]+\/[^/]+\/(\d+)(?:\/|\.)/i,
              /manga-list\/[^/]+\/[^/]+\/chapter-(\d+)\.html/i,               /(?:comic|title)\/\d+\/view\/(\d+)/i,
              /\/title\/\d+\/chapter\/(\d+)/i,
              /\/scan\/[^/]*?(\d+)(?:\/|$)/i,
              /(?:\/lecture|\/view|\/read)\/[^/]*?(\d+)(?:\/|$)/i,
              /(?:^|\/)(\d+)\/?$/
            ];
            for (const re of pathPatterns) {
              const m = pathOnly.match(re) || href.match(re);
              if (m && m[1]) return m[1];
            }
            const t = document.title && document.title.match(/(?:chapter|chapitre|ch\.|chap)\s*(\d+)/i);
            return t ? t[1] : null;
          };
          const getMeta = (doc, loc) => {
            const ogTitle = doc.querySelector('meta[property="og:title"]');
            const title = (ogTitle && ogTitle.content) || (doc.querySelector('h1') && doc.querySelector('h1').innerText) || doc.title || '';
            const cleanTitle =
              title
                .replace(/\s*[-|–—]\s*(?:Chapitre|Chapter|Ch\.?|Chap)\s*\d+.*$/i, '')
                .trim() || title;
            const ch = getChapterFromUrl(loc.href || '');
            const chapter = ch || 'Inconnu';
            const ogImage = doc.querySelector('meta[property="og:image"]');
            const twImage = doc.querySelector('meta[name="twitter:image"], meta[property="twitter:image"]');
            const cover = (ogImage && ogImage.content) || (twImage && twImage.content) || '';
            return { title: cleanTitle, chapter, cover };
          };
          const meta = getMeta(document, location);
          if (meta.chapter === 'Inconnu' && !meta.title) return null;
          meta.url = location.href;
          return { meta, url: location.href };
        }
      }, (results) => {
        if (results && results[0] && results[0].result) {
          sendResponse(results[0].result);
        } else {
          sendResponse({ error: 'not_manga_page' });
        }
      });
    });
  });
}

// --- Fonctions Logiques ---

function handleCaptureTab(sender, sendResponse) {
  const opts = { format: 'jpeg', quality: 80 };
  const onDone = (dataUrl) => {
    const lastErr = (typeof chrome !== 'undefined' && chrome && chrome.runtime) ? chrome.runtime.lastError : null;
    if (lastErr) {
      const msg =
        (lastErr && typeof lastErr.message === 'string' && lastErr.message) ||
        (typeof lastErr === 'string' && lastErr) ||
        '';
      console.error('Capture failed:', msg);
      const userMsg = /activeTab|all_urls|permission/i.test(msg)
        ? "Permission de capture manquante. Ouvrez une fois l'icône MangaCentral (popup), puis réessayez. Si le problème persiste, rechargez l'extension (chrome://extensions)."
        : msg;
      sendResponse({ error: userMsg });
    } else {
      if (!dataUrl || typeof dataUrl !== 'string') {
        sendResponse({ error: "Impossible de capturer l'écran" });
        return;
      }
      sendResponse({ dataUrl });
    }
  };

  const runWithWindowId = (windowId) => {
    if (typeof windowId === 'number') {
      chrome.tabs.captureVisibleTab(windowId, opts, onDone);
    } else {
      chrome.tabs.captureVisibleTab(opts, onDone);
    }
  };

  const tab = sender && sender.tab;
  let windowId = tab && typeof tab.windowId === 'number' ? tab.windowId : undefined;
  if (windowId !== undefined) {
    runWithWindowId(windowId);
    return;
  }

  // Certains contextes n’envoient pas sender.tab : utiliser l’onglet actif de la fenêtre courante.
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const t = tabs && tabs[0];
    windowId = t && typeof t.windowId === 'number' ? t.windowId : undefined;
    runWithWindowId(windowId);
  });
}

function handleChapterDetected(meta, sender) {
  if (!meta || !meta.title) return;

  const url = meta.url || (sender && sender.tab && sender.tab.url) || '';
  const now = Date.now();
  const entry = {
    ...meta,
    url,
    lastRead: now,
    id: idFromTitleAndChapter(meta.title, meta.chapter)
  };

  const workKey = getWorkKey(meta.title, url);

  chrome.storage.local.get(['readingHistory', 'library'], (result) => {
    let history = result.readingHistory || [];
    history = history.filter((item) => getWorkKey(item.title, item.url) !== workKey);
    history.unshift(entry);
    if (history.length > 50) history.pop();
    chrome.storage.local.set({ readingHistory: history });

    let library = result.library || [];
    const inLibrary = library.find((m) => getWorkKey(m.title, m.url) === workKey);
    if (inLibrary) {
      inLibrary.lastChapter = meta.chapter;
      inLibrary.url = url;
      inLibrary.title = meta.title;
      inLibrary.lastRead = now;
      inLibrary.workKey = workKey;
      const chNum = parseFloat(meta.chapter) || 0;
      inLibrary.furthestChapter = Math.max(parseFloat(inLibrary.furthestChapter) || 0, chNum);
      const prev = inLibrary.recentChapters || [];
      const newEntry = { ch: String(meta.chapter), url };
      const prevNormalized = prev.map(x => (typeof x === 'string' ? { ch: x, url: inLibrary.url } : x));
      const next = [newEntry, ...prevNormalized.filter(x => String(x.ch) !== String(meta.chapter))].slice(0, 3);
      inLibrary.recentChapters = next;
    }
    // Une seule entrée par manga : déduplication par titre (garder le dernier chapitre)
    const byTitle = new Map();
    library.forEach(m => {
      const key = m.workKey || getWorkKey(m.title, m.url);
      if (!key) return;
      const cur = byTitle.get(key);
      const ch = parseFloat(m.furthestChapter) || parseFloat(m.lastChapter) || 0;
      const curCh = cur ? (parseFloat(cur.furthestChapter) || parseFloat(cur.lastChapter) || 0) : -1;
      if (!cur || ch >= curCh) byTitle.set(key, m);
    });
    const deduped = Array.from(byTitle.values());
    if (deduped.length !== library.length || inLibrary) chrome.storage.local.set({ library: deduped });
  });
}

// Services logiques regroupés par domaine (utilisés dans le switch de messages)
const StorageService = { handleChapterDetected };
const OcrService = { handleCaptureTab, handleTranslation };
const SearchService = { handleSearch };
const MediaService = { fetchImageAsDataUrl };

async function fetchImageAsDataUrl(payload, sendResponse) {
  try {
    const url = payload && payload.url ? String(payload.url).trim() : '';
    const referer = payload && payload.referer ? String(payload.referer).trim() : '';
    if (!url) {
      sendResponse({ error: 'no_url' });
      return;
    }
    const res = await fetch(url, referer ? { referrer: referer, credentials: 'include' } : { credentials: 'include' });
    if (!res.ok) {
      sendResponse({ error: 'http_' + res.status });
      return;
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.startsWith('image/')) {
      sendResponse({ error: 'not_image' });
      return;
    }
    const blob = await res.blob();
    const reader = new FileReader();
    reader.onloadend = () => sendResponse({ dataUrl: reader.result });
    reader.onerror = () => sendResponse({ error: 'read_failed' });
    reader.readAsDataURL(blob);
  } catch (e) {
    sendResponse({ error: 'fetch_failed' });
  }
}

async function handleTranslation(payload, sendResponse) {
  const imageDataUrl = payload && payload.image;
  if (!imageDataUrl || typeof imageDataUrl !== 'string') {
    sendResponse({ translation: "Aucune image reçue. Sélectionnez une zone puis relancez la traduction." });
    return;
  }

  const { settings = {} } = await chrome.storage.local.get('settings');
  const apiKey = (settings.geminiApiKey || '').trim();
  const lang = (settings.translationLang || 'fr').trim();

  if (!apiKey) {
    sendResponse({
      translation: "⚠️ Traduction non configurée\n\nOuvrez l’extension → Paramètres → saisissez une clé API Gemini pour activer l’OCR et la traduction.\n\nEn attendant, la sélection et la capture fonctionnent ; seul l’appel à l’API est désactivé."
    });
    return;
  }

  const langNames = { fr: 'français', en: 'English', es: 'español', de: 'Deutsch' };
  const langLabel = langNames[lang] || lang;

  let base64Data = imageDataUrl;
  let mimeType = 'image/png';
  const match = imageDataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (match) {
    mimeType = 'image/' + match[1].toLowerCase();
    if (mimeType === 'image/jpg') mimeType = 'image/jpeg';
    base64Data = match[2];
  }

  const buildUrl = (model) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const modelsToTry = [
    // Le preview peut être saturé ; on essaie ensuite des modèles plus stables.
    'gemini-3-flash-preview',
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ];

  const prompt = `You are doing OCR + translation from an image (manga/comic speech bubbles).
Rules:
- First, read ALL text in the image (OCR). Preserve line breaks and reading order.
- Then translate it into ${langLabel}.
- Output ONLY the translated text. No quotes, no labels, no markdown.
- Do NOT truncate. If the text is long, still include everything.
- If there is no readable text, output exactly: (aucun texte)`;

  try {
    const doRequest = async (model) => {
      const controller = new AbortController();
      const timeoutMs = 25000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(buildUrl(model), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType,
                    data: base64Data
                  }
                }
              ]
            }],
            generationConfig: {
              // Bulles longues → éviter les sorties tronquées
              maxOutputTokens: 1536,
              temperature: 0.2
            }
          })
        });
        return res;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    let res = null;
    let lastErrMsg = '';
    for (let mi = 0; mi < modelsToTry.length; mi++) {
      const model = modelsToTry[mi];
      // 2 tentatives par modèle (backoff léger)
      for (let attempt = 1; attempt <= 2; attempt++) {
        res = await doRequest(model);
        if (res.ok) break;
        const errBody = await res.text().catch(() => '');
        lastErrMsg = '';
        try {
          const errJson = errBody ? JSON.parse(errBody) : null;
          const err = errJson && errJson.error ? errJson.error : {};
          lastErrMsg = (err && typeof err.message === 'string') ? err.message : '';
        } catch (_) {}

        const msgLower = (lastErrMsg || '').toLowerCase();
        const highDemand =
          res.status === 503 ||
          /high demand|temporar|spikes in demand|overloaded|try again later/i.test(lastErrMsg || '') ||
          /backend error/i.test(msgLower);

        const transient = highDemand || res.status === 500 || res.status === 502 || res.status === 504;
        if (!transient) break;
        await sleep(attempt === 1 ? 800 : 1600);
      }
      if (res && res.ok) break;
      // petit délai avant de changer de modèle
      await sleep(250);
    }

    if (!res.ok) {
      const errBody = await res.text();
      let errMsg = `API Gemini : ${res.status}`;
      try {
        const errJson = JSON.parse(errBody);
        const err = errJson.error || {};
        if (err.message) errMsg = err.message;
        const status = (err.status || '').toString();
        const highDemandMsg =
          /high demand|spikes in demand|try again later|overloaded/i.test(errMsg || '') ||
          res.status === 503;
        if (highDemandMsg) {
          sendResponse({
            translation:
              "Gemini est temporairement surchargé (forte demande).\n\nRéessayez dans 10–60 secondes. Astuce : sélectionnez une zone plus petite pour accélérer."
          });
          return;
        }
        if (res.status === 429 || status === 'RESOURCE_EXHAUSTED' || /quota|rate limit/i.test(errMsg || '')) {
          sendResponse({
            translation:
              'Limite ou quota Gemini atteint.\n\nRéduisez la fréquence des traductions ou vérifiez vos quotas sur la console Google.'
          });
          return;
        }
      } catch (_) {}
      // Si on a un message d'erreur plus précis des tentatives précédentes, l'afficher.
      const finalMsg = (lastErrMsg && lastErrMsg.trim()) ? lastErrMsg.trim() : errMsg;
      sendResponse({ translation: 'Erreur ' + finalMsg });
      return;
    }

    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts)
      ? parts.map(p => (p && typeof p.text === 'string' ? p.text : '')).join('').trim()
      : data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text && typeof text === 'string') {
      // Nettoyage léger si le modèle ajoute un préfixe (rare)
      const cleaned = text
        .replace(/^\s*(translated|translation)\s*:\s*/i, '')
        .trim();
      sendResponse({ translation: cleaned });
    } else {
      sendResponse({ translation: "Aucun texte retourné par Gemini. L’image est peut-être illisible ou vide." });
    }
  } catch (e) {
    console.error('Traduction Gemini:', e);
    const errName = e && typeof e.name === 'string' ? e.name : '';
    const errMessage = e && typeof e.message === 'string' ? e.message : '';
    const errString = (() => {
      if (errName || errMessage) return `${errName}${errMessage ? ': ' + errMessage : ''}`.trim();
      try {
        return String(e);
      } catch (_) {
        return 'unknown_error';
      }
    })();

    if (errName === 'AbortError' || /AbortError/i.test(errString)) {
      sendResponse({
        translation: "La traduction met trop de temps (timeout).\n\nEssayez de sélectionner une zone plus petite, ou réessayez."
      });
      return;
    }
    sendResponse({
      translation:
        "Erreur réseau ou API : " +
        (errString || 'erreur inconnue') +
        "\n\nVérifiez votre connexion et la clé API Gemini."
    });
  }
}

function getDomain(url) {
  if (!url || !url.trim()) return '';
  try {
    return new URL(url.trim()).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function buildSearchUrlForDomain(domain, query) {
  const enc = encodeURIComponent(query);
  const base = domain.startsWith('http') ? domain : `https://${domain.replace(/^www\./, '')}`;
  try {
    const host = new URL(base).origin;
    return `${host}/?s=${enc}`;
  } catch {
    return `https://${domain}/?s=${enc}`;
  }
}

async function askGeminiForReadingUrl(apiKey, mangaTitle) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${encodeURIComponent(apiKey)}`;
  const prompt = `The user wants to read this manga online. Manga title: "${mangaTitle}". Reply with ONLY one valid URL where they can read it (French or English), for example a direct link to the manga page on a scan site or MangaDex. If you don't know a specific URL, reply with ONLY one domain name (e.g. mangadex.org) where this manga might be found. No explanation, no quotes, no markdown, just the URL or the domain.`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 128, temperature: 0.2 }
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text || typeof text !== 'string') return null;
    const cleaned = text.trim().replace(/^["']|["']$/g, '').split(/\s/)[0];
    if (/^https?:\/\//i.test(cleaned)) return cleaned;
    const domain = cleaned.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^www\./, '');
    if (domain && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return buildSearchUrlForDomain(domain, mangaTitle);
    return null;
  } catch (e) {
    console.warn('Gemini search:', e);
    return null;
  }
}

async function handleSearch(query, sendResponse) {
  const q = (query || '').trim();
  if (!q) {
    sendResponse({ results: [] });
    return;
  }
  const encoded = encodeURIComponent(q);
  const norm = (t) => (t || '').trim().toLowerCase();
  const queryNorm = norm(q);
  const cacheKey = queryNorm;

  const cached = SEARCH_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    sendResponse({ results: cached.results });
    return;
  }

  try {
    const { library = [], readingHistory = [], customSites = [], settings = {} } = await new Promise((resolve) => {
      chrome.storage.local.get(['library', 'readingHistory', 'customSites', 'settings'], resolve);
    });

    const results = [];
    const seenTitles = new Set();
    const seenDomains = new Set();

    function addUnique(r) {
      const key = norm(r.title);
      if (!key || seenTitles.has(key)) return;
      seenTitles.add(key);
      results.push(r);
    }

    function addResult(r) {
      results.push(r);
    }

    // 0) Suggestion Gemini en premier (si clé API : lien de lecture proposé par l’API)
    const apiKey = (settings.geminiApiKey || '').trim();
    if (apiKey) {
      const geminiUrl = await askGeminiForReadingUrl(apiKey, q);
      if (geminiUrl) {
        addResult({
          id: 'gemini-suggestion',
          title: `Suggestion API : lire « ${q} »`,
          source: 'Gemini',
          cover: '',
          latestChapter: '?',
          url: geminiUrl
        });
      }
    }

    // 1) SITES DÉJÀ VISITÉS : un lien "Rechercher [titre] sur [domaine]" par domaine
    for (const entry of readingHistory) {
      const d = getDomain(entry.url || '');
      if (!d || seenDomains.has(d)) continue;
      seenDomains.add(d);
      const searchUrl = buildSearchUrlForDomain(d, q);
      addResult({
        id: 'site-' + d,
        title: `"${q}" sur ${d}`,
        source: d,
        cover: '',
        latestChapter: '?',
        url: searchUrl
      });
    }
    for (const site of customSites) {
      const d = (site.domain || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./, '').split('/')[0];
      if (!d || seenDomains.has(d)) continue;
      seenDomains.add(d);
      const searchUrl = buildSearchUrlForDomain(d, q);
      addResult({
        id: 'site-' + d,
        title: `"${q}" sur ${d}`,
        source: d,
        cover: '',
        latestChapter: '?',
        url: searchUrl
      });
    }

    // 2) Bibliothèque + Historique (titres qui matchent → lien direct de lecture)
    for (const m of library) {
      const title = (m.title || '').trim();
      if (!title || !norm(title).includes(queryNorm)) continue;
      const url = (m.url || '').trim();
      addUnique({
        id: m.id || 'lib-' + title,
        title,
        source: url ? getDomain(url) || 'Bibliothèque' : 'Bibliothèque',
        cover: (m.cover || '').trim(),
        latestChapter: m.lastChapter || m.furthestChapter || '?',
        url: url || ''
      });
    }
    for (const entry of readingHistory) {
      const title = (entry.title || '').trim();
      if (!title || !norm(title).includes(queryNorm)) continue;
      const url = (entry.url || '').trim();
      if (!url) continue;
      addUnique({
        id: 'hist-' + (entry.id || title),
        title,
        source: getDomain(url) || 'Historique',
        cover: (entry.cover || '').trim(),
        latestChapter: entry.chapter || '?',
        url
      });
    }

    // 3) MangaDex (lecture directe)
    const mangadexRes = await fetch(
      `https://api.mangadex.org/manga?title=${encoded}&limit=20&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive`
    ).then((r) => (r.ok ? r.json() : { data: [], included: [] }));

    const included = mangadexRes.included || [];
    for (const m of mangadexRes.data || []) {
      const att = m.attributes || {};
      const titleObj = att.title || {};
      const title = titleObj.en || titleObj.ja || Object.values(titleObj)[0] || '';
      if (!title) continue;
      let cover = '';
      const coverRel = (m.relationships || []).find((r) => r.type === 'cover_art');
      if (coverRel) {
        const art = included.find((i) => i.type === 'cover_art' && i.id === coverRel.id);
        const fileName = art?.attributes?.fileName;
        if (fileName) cover = `https://uploads.mangadex.org/covers/${m.id}/${fileName}.256.jpg`;
      }
      addUnique({
        id: m.id,
        title,
        source: 'MangaDex',
        cover,
        latestChapter: '?',
        url: `https://mangadex.org/title/${m.id}`
      });
    }

    // 5) Jikan/AniList → résolution vers MangaDex (plus de titres, lien lecture)
    const [jikanData, anilistData] = await Promise.allSettled([
      fetch(`https://api.jikan.moe/v4/manga?q=${encoded}&limit=15`).then((r) => (r.ok ? r.json() : { data: [] })),
      fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query($search: String) { Page(page: 1, perPage: 15) { media(type: MANGA, search: $search, sort: POPULARITY_DESC) { title { romaji english } coverImage { large } } } }`,
          variables: { search: q }
        })
      }).then((r) => (r.ok ? r.json() : { data: { Page: { media: [] } } }))
    ]);

    const extraTitles = [];
    if (jikanData.status === 'fulfilled' && jikanData.value.data) {
      for (const m of jikanData.value.data) {
        const t = (m.title || m.title_english || '').trim();
        if (t) extraTitles.push({ title: t, cover: m.images?.jpg?.image_url || m.images?.jpg?.large_image_url || '' });
      }
    }
    if (anilistData.status === 'fulfilled' && anilistData.value.data?.Page?.media) {
      for (const m of anilistData.value.data.Page.media) {
        const t = (m.title?.romaji || m.title?.english || '').trim();
        if (t) extraTitles.push({ title: t, cover: m.coverImage?.large || '' });
      }
    }

    for (const { title, cover } of extraTitles.slice(0, 5)) {
      if (seenTitles.has(norm(title))) continue;
      const dexRes = await fetch(
        `https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=1&includes[]=cover_art`
      ).then((r) => (r.ok ? r.json() : { data: [] }));
      const first = dexRes.data?.[0];
      if (!first) continue;
      let coverUrl = cover;
      if (!coverUrl && first.relationships) {
        const rel = first.relationships.find((r) => r.type === 'cover_art');
        const inc = (dexRes.included || []).find((i) => i.type === 'cover_art' && i.id === rel?.id);
        if (inc?.attributes?.fileName)
          coverUrl = `https://uploads.mangadex.org/covers/${first.id}/${inc.attributes.fileName}.256.jpg`;
      }
      addUnique({
        id: first.id,
        title: title,
        source: 'MangaDex',
        cover: coverUrl || '',
        latestChapter: '?',
        url: `https://mangadex.org/title/${first.id}`
      });
    }

    SEARCH_CACHE.set(cacheKey, { results, timestamp: Date.now() });
    sendResponse({ results });
  } catch (e) {
    console.error('Search error:', e);
    sendResponse({ results: [] });
  }
}