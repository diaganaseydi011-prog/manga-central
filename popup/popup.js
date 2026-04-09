// ===========================
// MangaCentral Popup Logic
// ===========================

// Placeholder couverture (data URI pour affichage garanti sans CORS)
const COVER_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='280' viewBox='0 0 200 280'%3E%3Crect fill='%231e293b' width='200' height='280'/%3E%3Ctext x='100' y='140' fill='%2394a3b8' font-size='14' text-anchor='middle' font-family='sans-serif'%3ENo cover%3C/text%3E%3C/svg%3E";

function setCoverFallback(img) {
  if (!img || img.dataset.mcCoverFixed) return;
  img.dataset.mcCoverFixed = '1';
  img.addEventListener('error', function onErr() {
    img.removeEventListener('error', onErr);
    const originalSrc = img.src;
    const referer = img.dataset.mcReferer || '';
    // Tentative 1: demander au background de récupérer l'image (bypass hotlink/referrer)
    chrome.runtime.sendMessage(
      { type: 'FETCH_IMAGE_DATAURL', payload: { url: originalSrc, referer } },
      (res) => {
        if (res && res.dataUrl && typeof res.dataUrl === 'string') {
          img.src = res.dataUrl;
        } else {
          img.src = COVER_PLACEHOLDER;
        }
      }
    );
  });
}

class PopupManager {
  constructor() {
    this.currentTab = 'dashboard';
    this.library = [];
    this.history = [];
    this.customSites = [];
    this.settings = {
      autoScrollSpeed: 2,
      geminiApiKey: '',
      translationLang: 'fr'
    };

    this._coverCache = new Map();
    this._modalCoverDataUrl = '';

    this._libraryView = {
      status: 'all',
      query: '',
      sort: 'title_asc',
      domain: ''
    };

    this.init();
  }

  _normalizeText(text) {
    return (text || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  _getDomainFromManga(manga) {
    const url = (manga && manga.url) ? String(manga.url) : '';
    if (!url) return '';
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  _refreshLibraryDomainSelect() {
    const domainSelect = document.getElementById('libraryDomainSelect');
    if (!domainSelect) return;

    const current = domainSelect.value || '';
    const domains = new Set();
    for (const m of (this.library || [])) {
      const d = this._getDomainFromManga(m);
      if (d) domains.add(d);
    }
    const sorted = Array.from(domains).sort((a, b) => a.localeCompare(b));

    domainSelect.innerHTML = `<option value="">Tous les sites</option>` +
      sorted.map(d => `<option value="${this._escapeHtml(d)}">${this._escapeHtml(d)}</option>`).join('');

    domainSelect.value = sorted.includes(current) ? current : '';
    this._libraryView.domain = domainSelect.value || '';
  }

  async init() {
    // Load data from storage
    await this.loadData();
    
    // Setup event listeners
    this.setupTabs();
    this.setupModals();
    this.setupSearch();
    this.setupLibrary();
    this.setupHistory();
    this.setupSettings();
    this.setupCustomSites();
    
    // Initial render
    this.renderDashboard();
    this.renderLibrary();
    this.renderHistory();
    this.renderCustomSitesPreview();
  }

  _normalizeTitle(t) {
    const out = (t || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s*[-|–—]\s*(?:mangamoins(?:\.[a-z]{2,})?|manga\s*moins)\s*$/i, '')
      .replace(/\s*[|–—-]\s*(?:scan|scans|manga|manhwa|webtoon)\b.*$/i, '')
      .replace(/\s*[-|–—]\s*(?:chapter|chapitre|chap|ch\.?)\s*\d+(?:\.\d+)?\s*.*$/i, '')
      .replace(/\s*\b(?:chapter|chapitre|chap|ch\.?)\s*\d+(?:\.\d+)?\s*.*$/i, '')
      .replace(/\bop\s*\d+\b/gi, '')
      .replace(/\bop\d+\b/gi, '')
      .replace(/\b\d+(?:\.\d+)?\b\s*$/i, '')
      .replace(/[^a-z0-9]+/gi, ' ')
      .trim()
      .toLowerCase();
    return out.replace(/\bmangamoins\b/gi, '').replace(/\s+/g, ' ').trim();
  }

  _getWorkKeyFromUrl(url) {
    if (!url) return '';
    try {
      const u = new URL(String(url).trim());
      const host = u.hostname.replace(/^www\./, '').toLowerCase();
      const parts = u.pathname.split('/').filter(Boolean);
      if (host === 'mangamoins.com' && parts[0] === 'scan' && parts[1]) {
        const raw = parts[1].toString();
        if (/^op\d+$/i.test(raw.replace(/\s+/g, ''))) return '';
        const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        return `mangamoins:scan:${slug}`;
      }
      return '';
    } catch {
      return '';
    }
  }

  _getWorkKey(title, url) {
    const urlKey = this._getWorkKeyFromUrl(url);
    if (urlKey) return urlKey;
    const titleKey = this._normalizeTitle(title);
    return titleKey ? `title:${titleKey}` : '';
  }

  _findLibraryByTitle(title) {
    const n = this._normalizeTitle(title);
    return this.library.find(m => this._normalizeTitle(m.title) === n) || null;
  }

  _normalizeRecentChapters(manga) {
    const raw = (manga.recentChapters || []).slice(0, 3);
    const baseUrl = manga.url || '';
    return raw.map(x => (typeof x === 'string' ? { ch: x, url: baseUrl } : { ch: String(x.ch), url: x.url || baseUrl }));
  }

  /**
   * Manga actuellement lu (onglet actif).
   * Retourne l’entrée bibliothèque si le manga est en liste, sinon une entrée "virtuelle" depuis la page (même pas encore ajouté).
   * Retourne null si l’onglet actif n’est pas une page chapitre reconnue.
   */
  async getCurrentTabReading() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_PAGE_META' });
      if (res.error || !res.meta || !res.meta.title || (res.meta.chapter || '') === 'Inconnu') return null;
      const inLibrary = this._findLibraryByTitle(res.meta.title);
      if (inLibrary && inLibrary.status === 'reading') return { manga: inLibrary, virtual: false };
      return {
        manga: {
          _virtual: true,
          id: null,
          title: res.meta.title,
          lastChapter: res.meta.chapter,
          url: res.url || '',
          cover: res.meta.cover || '',
          recentChapters: [],
        },
        virtual: true,
      };
    } catch (_) {
      return null;
    }
  }

  _dedupeLibrary() {
    const seen = new Map();
    for (const m of this.library) {
      const key = this._normalizeTitle(m.title);
      if (!key) continue;
      const existing = seen.get(key);
      const ch = parseFloat(m.furthestChapter) || parseFloat(m.lastChapter) || 0;
      const existingCh = existing ? (parseFloat(existing.furthestChapter) || parseFloat(existing.lastChapter) || 0) : -1;
      if (!existing || ch >= existingCh) seen.set(key, m);
    }
    this.library = Array.from(seen.values());
  }

  async loadData() {
    const result = await chrome.storage.local.get(['library', 'readingHistory', 'settings', 'customSites']);
    this.library = result.library || [];
    this._dedupeLibrary();
    const prevLibLen = (result.library || []).length;
    if (this.library.length !== prevLibLen) await this.saveLibrary();
    this.history = result.readingHistory || [];
    const prevHistLen = this.history.length;
    this._dedupeHistory();
    if (this.history.length !== prevHistLen) await chrome.storage.local.set({ readingHistory: this.history });
    this.customSites = result.customSites || [];
    this.settings = { ...this.settings, ...(result.settings || {}) };
  }

  _dedupeHistory() {
    const seen = new Map();
    for (const e of this.history) {
      const key = (e.title || '').trim().toLowerCase();
      if (!key) continue;
      const existing = seen.get(key);
      if (!existing || (e.lastRead && (existing.lastRead || 0) < e.lastRead)) seen.set(key, e);
    }
    this.history = Array.from(seen.values());
  }

  async saveLibrary() {
    await chrome.storage.local.set({ library: this.library });
  }

  async saveSettings() {
    await chrome.storage.local.set({ settings: this.settings });
  }

  /**
   * Nettoie le titre pour la recherche (enlève "Chapter X", limite la longueur).
   */
  _searchTitleForCover(title) {
    if (!title || typeof title !== 'string') return '';
    return title
      // Enlève bruit fréquent dans <title>
      .replace(/\s*[\[\(].*?[\]\)]\s*/g, ' ')
      .replace(/\s*[|–—-]\s*(?:scan|scans|vf|vostfr|raw|manga|manhwa|webtoon)\b.*$/i, '')
      // Enlève patterns chapitre/épisode variés
      .replace(/\s*[-|–—]\s*(?:chapter|chapitre|chap|ch\.?)\s*\d+(?:\.\d+)?\s*.*$/i, '')
      .replace(/\s*\b(?:chapter|chapitre|chap|ch\.?|ep\.?|episode)\s*\d+(?:\.\d+)?\s*.*$/i, '')
      // Enlève numéros finaux (souvent chapitres collés au titre)
      .replace(/\b\d+(?:\.\d+)?\b\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
  }

  /**
   * Récupère l'URL de la couverture en essayant plusieurs sources (Jikan, AniList, MangaDex).
   * @param {string} title - Titre du manga
   * @returns {Promise<string|null>} URL de l'image ou null
   */
  async fetchCoverByTitle(title) {
    const search = this._searchTitleForCover(title);
    if (search.length < 2) return null;

    const cacheKey = search.toLowerCase();
    if (this._coverCache.has(cacheKey)) {
      return this._coverCache.get(cacheKey);
    }

    const tryJikan = async () => {
      try {
        const res = await fetch(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(search)}&limit=3`);
        if (!res.ok) return null;
        const json = await res.json();
        const first = json.data?.[0];
        const url = first?.images?.jpg?.image_url;
        return url || null;
      } catch (_) { return null; }
    };

    const tryAniList = async () => {
      try {
        const res = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'query($search: String) { Page(page: 1, perPage: 3) { media(type: MANGA, search: $search) { coverImage { large } } } }',
            variables: { search }
          })
        });
        if (!res.ok) return null;
        const json = await res.json();
        const media = json?.data?.Page?.media;
        const first = media?.[0];
        return first?.coverImage?.large || null;
      } catch (_) { return null; }
    };

    const tryMangaDex = async () => {
      try {
        const res = await fetch(`https://api.mangadex.org/manga?title=${encodeURIComponent(search)}&limit=3&includes[]=cover_art`);
        if (!res.ok) return null;
        const json = await res.json();
        const manga = json.data?.[0];
        if (!manga?.id) return null;
        const rel = (manga.relationships || []).find(r => r.type === 'cover_art');
        const coverId = rel?.id;
        if (!coverId) return null;
        const included = json.included || [];
        const coverArt = included.find(c => c.type === 'cover_art' && c.id === coverId);
        const fileName = coverArt?.attributes?.fileName;
        if (!fileName) return null;
        return `https://uploads.mangadex.org/covers/${manga.id}/${fileName}.256.jpg`;
      } catch (_) { return null; }
    };

    const url = await tryJikan() || await tryAniList() || await tryMangaDex();
    this._coverCache.set(cacheKey, url || null);
    return url || null;
  }

  // ===== TAB MANAGEMENT (bottom nav) =====
  setupTabs() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        this.switchTab(tabName);
      });
    });
  }

  switchTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    const btn = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
    if (btn) btn.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const panel = document.getElementById(tabName);
    if (panel) panel.classList.add('active');

    this.currentTab = tabName;
  }

  // ===== DASHBOARD (2 colonnes + bloc "En cours") =====
  async renderDashboard() {
    const container = document.getElementById('readingList');
    const countEl = document.getElementById('readingCount');
    const currentBlock = document.getElementById('currentReadingBlock');

    const reading = this.library.filter(m => m.status === 'reading');
    const totalChapters = this.history.length;
    countEl.textContent = totalChapters >= 0 ? totalChapters : reading.length;

    const currentTab = await this.getCurrentTabReading();

    if (currentTab) {
      const { manga: featured, virtual } = currentTab;
      const recentFeatured = this._normalizeRecentChapters(featured).slice(0, 3);
      const featuredReferer = (featured && featured.url) ? String(featured.url) : '';
      currentBlock.innerHTML = `
        <div class="current-reading-content">
          <img src="${(featured.cover && featured.cover.trim()) ? featured.cover : COVER_PLACEHOLDER}" data-mc-referer="${this._escapeHtml(featuredReferer)}" class="current-reading-cover" alt="${this._escapeHtml(featured.title)}">
          <div class="current-reading-title">${this._escapeHtml(featured.title)}</div>
          ${virtual ? '<div class="current-reading-badge">Pas encore en bibliothèque</div>' : ''}
          <div class="current-reading-chapter">Ch. ${featured.lastChapter || '?'}</div>
          ${recentFeatured.length ? `<div class="current-reading-recent">${recentFeatured.map(r => r.url ? `<a href="${this._escapeHtml(r.url)}" class="current-reading-recent-chap" data-url="${this._escapeHtml(r.url)}">Ch. ${this._escapeHtml(r.ch)}</a>` : `<span class="current-reading-recent-chap">Ch. ${this._escapeHtml(r.ch)}</span>`).join('')}</div>` : ''}
          <div class="current-reading-actions">
            <button type="button" class="btn-neon btn-continue">${featured.url ? 'Continuer' : 'Ouvrir'}</button>
            ${virtual ? '<button type="button" class="btn-neon btn-add-current">Ajouter à la bibliothèque</button>' : '<button type="button" class="btn-neon btn-open-tools">Outils</button>'}
          </div>
        </div>
      `;
      currentBlock.querySelectorAll('.current-reading-cover').forEach(setCoverFallback);
      currentBlock.querySelectorAll('.current-reading-recent-chap[data-url]').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const url = link.getAttribute('data-url');
          if (url) chrome.tabs.create({ url });
        });
      });
      currentBlock.querySelector('.btn-continue').addEventListener('click', (e) => {
        e.preventDefault();
        if (featured.url) chrome.tabs.create({ url: featured.url });
        else this.openAddModal(featured);
      });
      if (virtual) {
        currentBlock.querySelector('.btn-add-current').addEventListener('click', (e) => {
          e.preventDefault();
          this.addCurrentPageToLibrary();
        });
      } else {
        currentBlock.querySelector('.btn-open-tools').addEventListener('click', (e) => {
          e.preventDefault();
          if (featured.url) chrome.tabs.create({ url: featured.url });
          else this.openAddModal(featured);
        });
      }
      if (!featured.cover || !featured.cover.trim()) {
        this.fetchCoverByTitle(featured.title).then(coverUrl => {
          if (!coverUrl) return;
          const img = document.getElementById('currentReadingBlock')?.querySelector('.current-reading-cover');
          if (img) img.src = coverUrl;
        });
      }
    } else {
      currentBlock.innerHTML = `
        <div class="current-reading-placeholder">
          <div class="placeholder-icon">📚</div>
          <p>En cours de lecture</p>
          <small>Ouvrez un chapitre manga dans un onglet pour le voir ici</small>
        </div>
      `;
    }

    if (reading.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>Aucune lecture en cours</p>
          <small>Ouvrez un chapitre pour commencer</small>
        </div>
      `;
    } else {
      const readingOrdered = currentTab && !currentTab.virtual && reading.some(m => m.id === currentTab.manga.id)
        ? [currentTab.manga, ...reading.filter(m => m.id !== currentTab.manga.id)]
        : reading;

    container.innerHTML = readingOrdered.map(manga => {
      const recent = this._normalizeRecentChapters(manga).slice(0, 3);
      const mainChapter = manga.furthestChapter != null && manga.furthestChapter !== '' ? manga.furthestChapter : manga.lastChapter;
      const referer = manga && manga.url ? this._escapeHtml(String(manga.url)) : '';
      return `
      <div class="manga-card" data-id="${manga.id}">
        <img src="${(manga.cover && manga.cover.trim()) ? manga.cover : COVER_PLACEHOLDER}" data-mc-referer="${referer}" class="manga-cover" alt="${manga.title}">
        <div class="manga-info">
          <h3>${this._escapeHtml(manga.title)}</h3>
          <p class="manga-latest">Ch. ${mainChapter || '?'}</p>
          ${recent.length ? `<div class="manga-recent-chapters">${recent.map(r => r.url ? `<a href="${this._escapeHtml(r.url)}" class="manga-recent-chap" data-url="${this._escapeHtml(r.url)}">Ch. ${this._escapeHtml(r.ch)}</a>` : `<span class="manga-recent-chap">Ch. ${this._escapeHtml(r.ch)}</span>`).join('')}</div>` : ''}
        </div>
      </div>
    `;
    }).join('');

    container.querySelectorAll('.manga-cover').forEach(setCoverFallback);
    container.querySelectorAll('.manga-card .manga-recent-chap[data-url]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const url = link.getAttribute('data-url');
        if (url) chrome.tabs.create({ url });
      });
    });
    container.querySelectorAll('.manga-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.manga-recent-chap[data-url]')) return;
        e.preventDefault();
        const id = card.dataset.id;
        const manga = this.library.find(m => m.id === id);
        if (!manga) return;
        if (manga.url) chrome.tabs.create({ url: manga.url });
        else this.openAddModal(manga);
      });
    });
    }
  }

  // ===== LIBRARY =====
  setupLibrary() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._libraryView.status = btn.dataset.status || 'all';
        this.renderLibrary();
      });
    });

    const searchInput = document.getElementById('librarySearchInput');
    const sortSelect = document.getElementById('librarySortSelect');
    const domainSelect = document.getElementById('libraryDomainSelect');

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this._libraryView.query = searchInput.value || '';
        this.renderLibrary();
      });
    }
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        this._libraryView.sort = sortSelect.value || 'title_asc';
        this.renderLibrary();
      });
    }
    if (domainSelect) {
      domainSelect.addEventListener('change', () => {
        this._libraryView.domain = domainSelect.value || '';
        this.renderLibrary();
      });
    }

    document.getElementById('addCurrentPageBtn').addEventListener('click', () => this.addCurrentPageToLibrary());
    document.getElementById('addManualBtn').addEventListener('click', () => this.openAddModal());

    document.getElementById('toggleAdvancedBtn').addEventListener('click', () => {
      const row = document.getElementById('modalCoverRow');
      const btn = document.getElementById('toggleAdvancedBtn');
      const isShown = row.style.display !== 'none';
      row.style.display = isShown ? 'none' : 'block';
      btn.textContent = isShown ? '+ Couverture (optionnel)' : '− Masquer couverture';
    });
  }

  async addCurrentPageToLibrary() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_PAGE_META' }) || {};
      if (response.error) {
        if (response.error === 'no_tab') this.showToast('Aucun onglet actif.', 'error');
        else this.showToast('Cette page n’est pas reconnue comme un chapitre manga.\n\nOuvrez un chapitre (l’URL doit contenir un numéro, ex. chapitre-614 ou chapter-123) puis réessayez.', 'error');
        return;
      }
      const meta = response.meta;
      const url = response.url;
      if (!meta || !url) {
        this.showToast('Impossible de lire les infos de la page. Rechargez l’onglet puis réessayez.', 'error');
        return;
      }
      let cover = meta.cover || '';
      if (!cover && meta.title) {
        cover = await this.fetchCoverByTitle(meta.title) || '';
      }
      const incomingKey = this._getWorkKey(meta.title, url);
      const existing =
        (incomingKey && this.library.find(m => this._getWorkKey(m.title, m.url) === incomingKey)) ||
        this._findLibraryByTitle(meta.title);
      if (existing) {
        existing.url = url;
        existing.cover = cover || existing.cover;
        existing.lastChapter = meta.chapter;
        existing.title = meta.title;
        existing.lastRead = Date.now();
        if (incomingKey) existing.workKey = incomingKey;
        const chNum = parseFloat(meta.chapter) || 0;
        existing.furthestChapter = Math.max(parseFloat(existing.furthestChapter) || 0, chNum);
        const prev = (existing.recentChapters || []).map(x => (typeof x === 'string' ? { ch: x, url: existing.url } : x));
        existing.recentChapters = [{ ch: String(meta.chapter), url }, ...prev.filter(x => String(x.ch) !== String(meta.chapter))].slice(0, 3);
        await this.saveLibrary();
        this.renderLibrary();
        this.renderDashboard();
        this.showToast(`"${meta.title}" mis à jour (Ch. ${meta.chapter}).`, 'success');
        return;
      }
      const chNum = parseFloat(meta.chapter) || 0;
      this.library.push({
        id: Date.now().toString(),
        title: meta.title,
        url,
        cover,
        workKey: incomingKey || '',
        status: 'reading',
        lastChapter: meta.chapter,
        furthestChapter: chNum,
        recentChapters: [{ ch: String(meta.chapter), url }],
        lastRead: Date.now(),
        addedAt: Date.now()
      });
      await this.saveLibrary();
      this.renderLibrary();
      this.renderDashboard();
      this.showToast(`"${meta.title}" ajouté (Ch. ${meta.chapter}).`, 'success');
    } catch (e) {
      console.error(e);
      this.showToast('Impossible de lire la page actuelle. Ouvrez un chapitre manga puis réessayez.', 'error');
    }
  }

  renderLibrary() {
    const container = document.getElementById('libraryList');

    this._refreshLibraryDomainSelect();

    const filterStatus = this._libraryView.status || 'all';
    const queryNorm = this._normalizeText(this._libraryView.query || '');
    const domain = (this._libraryView.domain || '').trim();
    const sortKey = this._libraryView.sort || 'title_asc';

    let filtered = (this.library || []).slice();
    if (filterStatus !== 'all') {
      filtered = filtered.filter(m => (m.status || '') === filterStatus);
    }
    if (domain) {
      filtered = filtered.filter(m => this._getDomainFromManga(m) === domain);
    }
    if (queryNorm) {
      filtered = filtered.filter(m => {
        const title = this._normalizeText(m.title || '');
        return title.includes(queryNorm);
      });
    }

    const toNum = (v) => {
      const n = typeof v === 'number' ? v : parseFloat(String(v || ''));
      return Number.isFinite(n) ? n : 0;
    };

    filtered.sort((a, b) => {
      if (sortKey === 'title_desc') return (b.title || '').localeCompare(a.title || '');
      if (sortKey === 'lastread_desc') return toNum(b.lastRead || b.addedAt) - toNum(a.lastRead || a.addedAt);
      if (sortKey === 'added_desc') return toNum(b.addedAt) - toNum(a.addedAt);
      return (a.title || '').localeCompare(b.title || '');
    });
    
    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>📚 Aucun manga ${filterStatus !== 'all' ? 'dans cette catégorie' : ''}</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = filtered.map(manga => {
      const referer = manga && manga.url ? this._escapeHtml(String(manga.url)) : '';
      const urlDomain = this._getDomainFromUrl(manga && manga.url);
      const sourceLabel = manga.source || urlDomain || 'Source inconnue';
      return `
      <div class="library-item" data-id="${manga.id}">
        <img src="${(manga.cover && manga.cover.trim()) ? manga.cover : COVER_PLACEHOLDER}" data-mc-referer="${referer}" class="library-cover" alt="${manga.title}">
        <div class="library-details">
          <div>
            <div class="library-title">${manga.title}</div>
            <div class="library-meta">${sourceLabel}</div>
            <span class="library-status ${manga.status}">${this.getStatusLabel(manga.status)}</span>
          </div>
          <div class="library-actions">
            <button class="action-btn open-btn" title="Ouvrir">🔗</button>
            <button class="action-btn edit-btn" title="Modifier">✏️</button>
            <button class="action-btn delete-btn" title="Supprimer">🗑️</button>
          </div>
        </div>
      </div>
    `;
    }).join('');
    container.querySelectorAll('.library-cover').forEach(setCoverFallback);
    container.querySelectorAll('.library-item').forEach(item => {
      const id = item.dataset.id;
      const manga = this.library.find(m => m.id === id);
      
      item.querySelector('.open-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (manga.url) chrome.tabs.create({ url: manga.url });
        else this.openAddModal(manga);
      });
      
      item.querySelector('.edit-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openAddModal(manga);
      });
      
      item.querySelector('.delete-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Supprimer "${manga.title}" de la bibliothèque ?`)) {
          this.library = this.library.filter(m => m.id !== id);
          await this.saveLibrary();
          this.renderLibrary();
          this.renderDashboard();
        }
      });
    });
  }

  getStatusLabel(status) {
    const labels = {
      reading: 'En cours',
      completed: 'Terminé',
      paused: 'En pause'
    };
    return labels[status] || status;
  }

  // ===== SEARCH =====
  setupSearch() {
    const searchBtn = document.getElementById('searchBtn');
    const searchInput = document.getElementById('searchInput');
    
    const performSearch = () => {
      const query = searchInput.value.trim();
      if (query) {
        this.searchManga(query);
      }
    };
    
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') performSearch();
    });
  }

  async searchManga(query) {
    const resultsContainer = document.getElementById('searchResults');
    const loadingContainer = document.getElementById('searchLoading');
    
    // Show loading
    resultsContainer.style.display = 'none';
    loadingContainer.style.display = 'block';
    
    try {
      // Send message to background script
      const response = await chrome.runtime.sendMessage({
        type: 'SEARCH_MANGA',
        payload: query
      });
      
      loadingContainer.style.display = 'none';
      resultsContainer.style.display = 'block';
      
      if (response.results && response.results.length > 0) {
        resultsContainer.innerHTML = response.results.map(result => {
          const dataResult = JSON.stringify(result).replace(/'/g, '&#39;');
          const hasUrl = result.url && result.url.trim();
          const referer = (result.url && result.url.trim()) ? this._escapeHtml(String(result.url).trim()) : '';
          return `
          <div class="search-item" data-result='${dataResult}'>
            <img src="${(result.cover && result.cover.trim()) ? result.cover : COVER_PLACEHOLDER}" data-mc-referer="${referer}" class="search-cover" alt="${this._escapeHtml(result.title)}">
            <div class="search-details">
              <div class="search-title">${this._escapeHtml(result.title)}</div>
              <div class="search-source">📍 ${this._escapeHtml(result.source || '')}</div>
              <div class="search-chapter">📖 Chapitre ${this._escapeHtml(String(result.latestChapter || '?'))}</div>
              <div class="search-actions">
                ${hasUrl ? `<button type="button" class="btn-neon btn-search-open" title="Ouvrir sur le site">Ouvrir</button>` : ''}
                <button type="button" class="btn-ghost btn-search-save" title="Ajouter à la bibliothèque">Enregistrer</button>
              </div>
            </div>
          </div>
        `;
        }).join('');
        resultsContainer.querySelectorAll('.search-cover').forEach(setCoverFallback);
        resultsContainer.querySelectorAll('.search-item').forEach(item => {
          const result = JSON.parse(item.dataset.result);
          const openBtn = item.querySelector('.btn-search-open');
          const saveBtn = item.querySelector('.btn-search-save');
          if (openBtn) {
            openBtn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (result.url && result.url.trim()) chrome.tabs.create({ url: result.url.trim() });
            });
          }
          if (saveBtn) {
            saveBtn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              this.addToLibraryFromSearch(result);
            });
          }
          item.style.cursor = result.url && result.url.trim() ? 'pointer' : 'default';
          item.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            if (result.url && result.url.trim()) chrome.tabs.create({ url: result.url.trim() });
          });
        });
      } else {
        resultsContainer.innerHTML = `
          <div class="empty-state">
            <p>😕 Aucun résultat</p>
          </div>
        `;
      }
    } catch (error) {
      console.error('Search error:', error);
      loadingContainer.style.display = 'none';
      resultsContainer.style.display = 'block';
      resultsContainer.innerHTML = `
        <div class="empty-state">
          <p>❌ Erreur de recherche</p>
        </div>
      `;
    }
  }

  addToLibraryFromSearch(result) {
    const incomingKey = this._getWorkKey(result.title, result.url);
    const existing =
      (incomingKey && this.library.find(m => this._getWorkKey(m.title, m.url) === incomingKey)) ||
      this._findLibraryByTitle(result.title);
    const url = (result.url && result.url.trim()) || '';
    if (existing) {
      existing.lastChapter = result.latestChapter || existing.lastChapter;
      existing.cover = result.cover || existing.cover;
      existing.source = result.source || existing.source;
      if (url) existing.url = url;
      if (incomingKey) existing.workKey = incomingKey;
      const chNum = parseFloat(result.latestChapter) || 0;
      if (chNum) existing.furthestChapter = Math.max(parseFloat(existing.furthestChapter) || 0, chNum);
      this.saveLibrary();
      this.renderLibrary();
      this.renderDashboard();
      this.showToast(`"${result.title}" mis à jour (Ch. ${existing.lastChapter}).`, 'success');
      return;
    }
    const chNum = parseFloat(result.latestChapter) || 0;
    this.library.push({
      id: Date.now().toString(),
      title: result.title,
      cover: result.cover,
      source: result.source,
      status: 'reading',
      url,
      workKey: incomingKey || '',
      lastChapter: result.latestChapter,
      furthestChapter: chNum,
      recentChapters: [],
      addedAt: Date.now()
    });
    this.saveLibrary();
    this.renderLibrary();
    this.renderDashboard();
    this.showToast(`"${result.title}" ajouté à la bibliothèque !`, 'success');
  }

  // ===== HISTORY =====
  setupHistory() {
    document.getElementById('clearHistoryBtn').addEventListener('click', async () => {
      if (confirm('Effacer tout l\'historique ?')) {
        await chrome.storage.local.set({ readingHistory: [] });
        this.history = [];
        this.renderHistory();
      }
    });
  }

  renderHistory() {
    const container = document.getElementById('historyList');
    
    if (this.history.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>📜 Aucun historique</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = this.history.map((entry, index) => `
      <div class="history-item" data-index="${index}">
        <div class="history-text">
          <div class="history-title">${this._escapeHtml(entry.title)}</div>
          <div class="history-chapter">Chapitre ${this._escapeHtml(entry.chapter)}</div>
        </div>
        <div class="history-time">${this.formatTime(entry.lastRead)}</div>
      </div>
    `).join('');
    
    container.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const index = parseInt(item.dataset.index, 10);
        const entry = this.history[index];
        if (entry && entry.url) {
          chrome.tabs.create({ url: entry.url });
        }
      });
    });
  }

  _getDomainFromUrl(url) {
    if (!url || !String(url).trim()) return '';
    try {
      const u = new URL(String(url).trim());
      return u.hostname.replace(/^www\./, '');
    } catch (_) {
      return '';
    }
  }

  _escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatTime(timestamp) {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `il y a ${days}j`;
    if (hours > 0) return `il y a ${hours}h`;
    if (minutes > 0) return `il y a ${minutes}m`;
    return 'À l\'instant';
  }

  // ===== MODALS =====
  setupModals() {
    const addModal = document.getElementById('addModal');
    const siteModal = document.getElementById('siteModal');

    document.querySelectorAll('.close-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        addModal.classList.remove('active');
        siteModal.classList.remove('active');
      });
    });

    document.getElementById('cancelModalBtn').addEventListener('click', () => addModal.classList.remove('active'));
    document.getElementById('cancelSiteBtn').addEventListener('click', () => siteModal.classList.remove('active'));
    document.getElementById('saveModalBtn').addEventListener('click', () => this.saveFromModal());
    document.getElementById('saveSiteBtn').addEventListener('click', () => this.saveSiteFromModal());

    addModal.querySelector('.modal-backdrop')?.addEventListener('click', () => addModal.classList.remove('active'));
    siteModal.querySelector('.modal-backdrop')?.addEventListener('click', () => siteModal.classList.remove('active'));

    const coverFile = document.getElementById('modalCoverFile');
    const clearCoverBtn = document.getElementById('clearCoverBtn');
    if (coverFile) {
      coverFile.addEventListener('change', async () => {
        const file = coverFile.files && coverFile.files[0];
        if (!file) return;
        try {
          const dataUrl = await this._fileToResizedCoverDataUrl(file);
          this._modalCoverDataUrl = dataUrl || '';
          if (dataUrl) {
            document.getElementById('modalCover').value = '';
            this.showToast('Couverture importée.', 'success');
          } else {
            this.showToast('Image invalide.', 'error');
          }
        } catch (e) {
          console.error(e);
          this.showToast('Impossible de lire l’image.', 'error');
        }
      });
    }
    if (clearCoverBtn) {
      clearCoverBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this._modalCoverDataUrl = '';
        const coverUrlInput = document.getElementById('modalCover');
        if (coverUrlInput) coverUrlInput.value = '';
        if (coverFile) coverFile.value = '';
        this.showToast('Couverture retirée.', 'info');
      });
    }
  }

  openAddModal(manga = null) {
    const modal = document.getElementById('addModal');
    const coverRow = document.getElementById('modalCoverRow');
    const toggleBtn = document.getElementById('toggleAdvancedBtn');
    const coverFile = document.getElementById('modalCoverFile');

    if (manga) {
      document.getElementById('modalTitle').value = manga.title;
      document.getElementById('modalUrl').value = manga.url || '';
      document.getElementById('modalCover').value = manga.cover || '';
      document.getElementById('modalStatus').value = manga.status;
      modal.dataset.editId = manga.id;
      coverRow.style.display = manga.cover ? 'block' : 'none';
      toggleBtn.textContent = manga.cover ? '− Masquer couverture' : '+ Couverture (optionnel)';
      this._modalCoverDataUrl = (manga.cover && String(manga.cover).startsWith('data:image/')) ? manga.cover : '';
      if (coverFile) coverFile.value = '';
    } else {
      document.getElementById('modalTitle').value = '';
      document.getElementById('modalUrl').value = '';
      document.getElementById('modalCover').value = '';
      document.getElementById('modalStatus').value = 'reading';
      delete modal.dataset.editId;
      coverRow.style.display = 'none';
      toggleBtn.textContent = '+ Couverture (optionnel)';
      this._modalCoverDataUrl = '';
      if (coverFile) coverFile.value = '';
    }
    modal.classList.add('active');
  }

  async saveFromModal() {
    const modal = document.getElementById('addModal');
    const title = document.getElementById('modalTitle').value.trim();
    const url = document.getElementById('modalUrl').value.trim();
    let cover = document.getElementById('modalCover').value.trim();
    const status = document.getElementById('modalStatus').value;

    if (!title) {
      this.showToast('Le titre est obligatoire !', 'error');
      return;
    }

    // Priorité: image importée -> URL manuelle -> auto-fetch
    if (this._modalCoverDataUrl) {
      cover = this._modalCoverDataUrl;
    }
    if (!cover && title) {
      cover = await this.fetchCoverByTitle(title) || '';
    }

    const editId = modal.dataset.editId;

    if (editId) {
      const manga = this.library.find(m => m.id === editId);
      if (manga) {
        const other = this._findLibraryByTitle(title);
        if (other && other.id !== editId) {
          other.title = title;
          other.url = url || other.url;
          other.cover = cover || other.cover;
          other.status = status;
          this.library = this.library.filter(m => m.id !== editId);
        } else {
          manga.title = title;
          manga.url = url;
          manga.cover = cover || manga.cover;
          manga.status = status;
        }
      }
    } else {
      const existing = this._findLibraryByTitle(title);
      if (existing) {
        existing.url = url || existing.url;
        existing.cover = cover || existing.cover;
        existing.status = status;
      } else {
        this.library.push({
          id: Date.now().toString(),
          title,
          url,
          cover: cover || '',
          status,
          lastChapter: '',
          addedAt: Date.now()
        });
      }
    }

    await this.saveLibrary();
    this.renderLibrary();
    this.renderDashboard();
    modal.classList.remove('active');
  }

  _fileToResizedCoverDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type || !file.type.startsWith('image/')) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const src = String(reader.result || '');
        const img = new Image();
        img.onerror = () => resolve(null);
        img.onload = () => {
          const MAX_W = 256;
          const MAX_H = 360;
          const w = img.naturalWidth || img.width || 1;
          const h = img.naturalHeight || img.height || 1;
          const scale = Math.min(1, MAX_W / w, MAX_H / h);
          const outW = Math.max(1, Math.round(w * scale));
          const outH = Math.max(1, Math.round(h * scale));
          const canvas = document.createElement('canvas');
          canvas.width = outW;
          canvas.height = outH;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, outW, outH);
          // JPEG pour réduire la taille en storage
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          resolve(dataUrl);
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    });
  }

  // ===== SETTINGS (onglet Paramètres) =====
  setupSettings() {
    const speedEl = document.getElementById('defaultScrollSpeed');
    const speedValueEl = document.getElementById('speedValue');
    if (speedEl && speedValueEl) {
      speedEl.value = this.settings.autoScrollSpeed;
      speedValueEl.textContent = this.settings.autoScrollSpeed;
      speedEl.addEventListener('input', () => { speedValueEl.textContent = speedEl.value; });
    }
    const apiKeyEl = document.getElementById('geminiApiKey');
    const langEl = document.getElementById('translationLang');
    if (apiKeyEl) apiKeyEl.value = this.settings.geminiApiKey || '';
    if (langEl) langEl.value = this.settings.translationLang;

    document.getElementById('saveSettingsBtn')?.addEventListener('click', async () => {
      const speed = document.getElementById('defaultScrollSpeed').value;
      const apiKey = document.getElementById('geminiApiKey').value.trim();
      const lang = document.getElementById('translationLang').value;
      this.settings.autoScrollSpeed = parseInt(speed, 10);
      this.settings.geminiApiKey = apiKey;
      this.settings.translationLang = lang;
      await this.saveSettings();
      this.showToast('Paramètres enregistrés !', 'success');
    });
  }

  // ===== CUSTOM SITES (tout dans le popup, pas de nouvelle URL) =====
  setupCustomSites() {
    document.getElementById('addCustomSiteBtn').addEventListener('click', (e) => {
      e.preventDefault();
      this.openSiteModal();
    });
  }

  openSiteModal(site = null) {
    const modal = document.getElementById('siteModal');
    if (site) {
      document.getElementById('siteName').value = site.name || '';
      document.getElementById('siteDomain').value = site.domain || '';
      document.getElementById('siteTitleSelector').value = site.titleSelector || '';
      document.getElementById('siteChapterPattern').value = site.chapterPattern || 'chapter[-_]?(\\d+)';
      document.getElementById('siteContainerSelector').value = site.containerSelector || '';
      document.getElementById('siteImageSelector').value = site.imageSelector || 'img';
      document.getElementById('siteCoverSelector').value = site.coverSelector || '';
      document.getElementById('siteNextSelector').value = site.nextButtonSelector || '';
      document.getElementById('sitePrevSelector').value = site.prevButtonSelector || '';
      modal.dataset.editId = site.id;
    } else {
      document.getElementById('siteName').value = '';
      document.getElementById('siteDomain').value = '';
      document.getElementById('siteTitleSelector').value = '';
      document.getElementById('siteChapterPattern').value = 'chapter[-_]?(\\d+)';
      document.getElementById('siteContainerSelector').value = '';
      document.getElementById('siteImageSelector').value = 'img';
      document.getElementById('siteCoverSelector').value = '';
      document.getElementById('siteNextSelector').value = '';
      document.getElementById('sitePrevSelector').value = '';
      delete modal.dataset.editId;
    }
    modal.classList.add('active');
  }

  async saveSiteFromModal() {
    const modal = document.getElementById('siteModal');
    const name = document.getElementById('siteName').value.trim();
    const domain = document.getElementById('siteDomain').value.trim();
    if (!name || !domain) {
      this.showToast('Nom et domaine sont obligatoires.', 'error');
      return;
    }
    const siteData = {
      id: modal.dataset.editId || Date.now().toString(),
      name,
      domain,
      titleSelector: document.getElementById('siteTitleSelector').value.trim(),
      chapterPattern: document.getElementById('siteChapterPattern').value.trim() || 'chapter[-_]?(\\d+)',
      containerSelector: document.getElementById('siteContainerSelector').value.trim(),
      imageSelector: document.getElementById('siteImageSelector').value.trim() || 'img',
      coverSelector: document.getElementById('siteCoverSelector').value.trim(),
      nextButtonSelector: document.getElementById('siteNextSelector').value.trim(),
      prevButtonSelector: document.getElementById('sitePrevSelector').value.trim(),
      excludePatterns: '',
      minImageWidth: 300,
      minImageHeight: 300,
      createdAt: Date.now()
    };
    const index = this.customSites.findIndex(s => s.id === siteData.id);
    if (index !== -1) {
      this.customSites[index] = siteData;
    } else {
      this.customSites.push(siteData);
    }
    await chrome.storage.local.set({ customSites: this.customSites });
    modal.classList.remove('active');
    this.renderCustomSitesPreview();
  }

  async deleteCustomSite(id) {
    const site = this.customSites.find(s => s.id === id);
    if (!site || !confirm(`Supprimer "${site.name}" ?`)) return;
    this.customSites = this.customSites.filter(s => s.id !== id);
    await chrome.storage.local.set({ customSites: this.customSites });
    this.renderCustomSitesPreview();
  }

  renderCustomSitesPreview() {
    const container = document.getElementById('customSitesList');
    
    if (this.customSites.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>🛠️ Aucun site personnalisé</p>
          <small>Cliquez sur "+ Ajouter un site" pour en configurer un.</small>
        </div>
      `;
      return;
    }

    container.innerHTML = this.customSites.map(site => `
      <div class="site-card-popup" data-id="${site.id}">
        <div>
          <div class="site-card-name">${this._escapeHtml(site.name)}</div>
          <div class="site-card-domain">${this._escapeHtml(site.domain)}</div>
        </div>
        <div class="site-card-actions">
          <button type="button" class="edit-site" title="Modifier">✏️</button>
          <button type="button" class="delete-site" title="Supprimer">🗑️</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.site-card-popup').forEach(card => {
      const id = card.dataset.id;
      card.querySelector('.edit-site').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const site = this.customSites.find(s => s.id === id);
        if (site) this.openSiteModal(site);
      });
      card.querySelector('.delete-site').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.deleteCustomSite(id);
      });
    });
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) {
      // Fallback silencieux si le container n'est pas disponible
      console[type === 'error' ? 'error' : 'log'](message);
      return;
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // Forcer l'animation
    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

// Initialize
const popup = new PopupManager();
