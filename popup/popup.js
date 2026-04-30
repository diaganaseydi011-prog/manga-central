// ===========================
// MangaCentral Popup Logic
// ===========================

// Placeholder couverture (data URI pour affichage garanti sans CORS)
const COVER_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='280' viewBox='0 0 200 280'%3E%3Crect fill='%231e293b' width='200' height='280'/%3E%3Ctext x='100' y='140' fill='%2394a3b8' font-size='14' text-anchor='middle' font-family='sans-serif'%3ENo cover%3C/text%3E%3C/svg%3E";

function setCoverFallback(img) {
  if (!img || img.dataset.mcCoverFixed) return;
  img.dataset.mcCoverFixed = '1';

  const desiredSrc = (img.dataset.mcSrc || '').trim();
  const referer = img.dataset.mcReferer || '';

  const tryBackgroundFetch = (url) => {
    chrome.runtime.sendMessage(
      { type: 'FETCH_IMAGE_DATAURL', payload: { url, referer } },
      (res) => {
        if (res && res.dataUrl && typeof res.dataUrl === 'string') {
          img.src = res.dataUrl;
        } else {
          img.src = COVER_PLACEHOLDER;
        }
      }
    );
  };

  // Toujours afficher le placeholder par défaut (évite le logo "image cassée")
  img.src = COVER_PLACEHOLDER;

  if (desiredSrc) {
    // Préchargement hors-DOM: si ça marche on remplace, sinon on garde "No cover"
    const pre = new Image();
    pre.onload = () => {
      img.src = desiredSrc;
    };
    pre.onerror = () => {
      tryBackgroundFetch(desiredSrc);
    };
    pre.src = desiredSrc;
  }
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
      translationLang: 'fr',
      extensionDisabled: false,
      disabledHosts: [],
      displayLang: 'fr'
    };

    // Dernier chapitre MangaDex détecté, alimenté par le background (notifications).
    this.latestChapterCache = {};
    this._latestFetchInFlight = new Map();
    this._latestUiRerenderPending = false;

    this._coverCache = new Map();
    this._coverFetchInFlight = new Map();
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

    domainSelect.innerHTML = `<option value="">${this.t('library_all_sites')}</option>` +
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
    this.setupBackupRestore();
    this.setupCustomSites();
    this.setupExtensionControls();
    await this.refreshExtensionControlBar();
    this.applyI18n();

    // Initial render
    this.renderDashboard();
    this.renderLibrary();
    this.renderHistory();
    this.renderCustomSitesPreview();
    await this.refreshLatestChaptersForUi(true);
  }

  async refreshLatestChaptersForUi(force = false) {
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'REFRESH_LATEST_CHAPTER_CACHE',
        payload: {
          force: !!force,
          maxAgeMinutes: force ? 0 : 120
        }
      });
      if (!res || res.ok === false) return;
      await this.loadData();
      this.renderDashboard();
      this.renderLibrary();
    } catch (_) {
      // silent fallback: l'UI reste utilisable meme si le refresh echoue
    }
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
      if (host === 'asurascans.com' && parts[0] === 'comics' && parts[1]) {
        const slug = parts[1].toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        return slug ? `asura:comics:${slug}` : '';
      }
      if (host === 'mangamoins.com' && parts[0] === 'scan' && parts[1]) {
        const raw = parts[1].toString();
        if (/^op\d+$/i.test(raw.replace(/\s+/g, ''))) return '';
        const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        return `mangamoins:scan:${slug}`;
      }

      const chapterWords = new Set(['chapter', 'chapitre', 'chap', 'read', 'episode', 'viewer', 'lecture', 'view']);
      const canonParts = parts.slice();
      for (let i = 0; i < 3 && canonParts.length; i++) {
        const seg = canonParts[canonParts.length - 1];
        const segLc = String(seg || '').toLowerCase();
        if (/[0-9]/.test(seg) || chapterWords.has(segLc)) {
          canonParts.pop();
          continue;
        }
        break;
      }
      if (!canonParts.length) return '';
      u.pathname = '/' + canonParts.join('/') + '/';
      u.search = '';
      u.hash = '';
      return `url:${u.origin}${u.pathname}`;
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

  _getUserReadChapterForManga(manga) {
    if (!manga) return 0;
    const fc = manga.furthestChapter;
    const lc = manga.lastChapter;
    return Math.max(
      parseFloat(String(fc != null ? fc : '').replace(',', '.')) || 0,
      parseFloat(String(lc != null ? lc : '').replace(',', '.')) || 0
    );
  }

  _getLatestAvailableChapterForManga(manga) {
    if (!manga) return null;
    const workKey = manga.workKey || this._getWorkKey(manga.title, manga.url);
    if (!workKey) return null;
    const entry =
      this.latestChapterCache && typeof this.latestChapterCache === 'object'
        ? this.latestChapterCache[workKey]
        : null;
    const latest = entry && entry.latest != null ? Number(entry.latest) : NaN;
    if (!Number.isFinite(latest)) return null;
    const read = this._getUserReadChapterForManga(manga);
    if (read > 0 && latest + 1e-9 < read) return null;
    return latest;
  }

  _formatChapterNumber(n) {
    if (n == null) return '';
    const num = Number(n);
    if (!Number.isFinite(num)) return '';
    if (Math.abs(num - Math.round(num)) < 1e-9) return String(Math.round(num));
    return String(num);
  }

  _getReadAvailableLine(manga, latestDex) {
    if (latestDex == null) return '';
    const read = this._getUserReadChapterForManga(manga);
    const readStr = read > 0 ? this._formatChapterNumber(read) : '?';
    const latestStr = this._formatChapterNumber(latestDex) || '?';
    return `Ch. ${readStr} / ${latestStr}`;
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
    const result = await chrome.storage.local.get([
      'library',
      'readingHistory',
      'settings',
      'customSites',
      'latestChapterCache'
    ]);
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
    this.latestChapterCache = result.latestChapterCache && typeof result.latestChapterCache === 'object' ? result.latestChapterCache : {};
    if (typeof this.settings.extensionDisabled !== 'boolean') this.settings.extensionDisabled = false;
    if (!Array.isArray(this.settings.disabledHosts)) this.settings.disabledHosts = [];
    if (!this.settings.displayLang) this.settings.displayLang = 'fr';
  }

  t(key, vars = {}) {
    const lang = (this.settings.displayLang || 'fr').toLowerCase();
    const dict = {
      fr: {
        toast_ext_disabled_everywhere: 'Extension désactivée partout. Rechargez les pages ouvertes pour appliquer.',
        toast_ext_enabled_everywhere: 'Extension réactivée. Rechargez les pages ouvertes pour appliquer.',
        ext_active_everywhere: 'Active partout',
        ext_disabled_everywhere: 'Désactivée partout',
        ext_not_web_page: 'Pas une page web',
        ext_disable_site: 'Désactiver ce site',
        ext_enable_site: 'Réactiver ce site',
        ext_excluded_sites: 'Sites exclus',
        ext_site_removed: '« {host} » retiré des exclusions. Rechargez l’onglet si besoin.',
        ext_site_disabled: 'MangaCentral est désactivé sur {host}. Rechargez l’onglet.',
        ext_site_enabled: 'MangaCentral est réactivé sur {host}. Rechargez l’onglet.',
        ext_disabled_hint: 'MangaCentral est désactivé sur cette page ou partout. Réactivez-le dans Paramètres → Activation puis rechargez l’onglet.',
        settings_saved: 'Paramètres enregistrés !',

        settings_activation_title: 'Activation',
        settings_activation_lead: 'Désactiver l’extension partout ou uniquement sur certains sites (rechargez la page après changement).',
        settings_extension_label: 'Extension',
        settings_current_tab: 'Onglet actuel',
        settings_title: 'Paramètres',
        settings_display_lang: 'Langue d’affichage',
        settings_autoscroll_speed: 'Vitesse autoscroll',
        settings_gemini_key: 'Clé API Gemini (traduction)',
        settings_gemini_key_placeholder: 'Clé API...',
        settings_translation_lang: 'Langue de traduction',
        settings_save: 'Enregistrer',
        settings_custom_sites: 'Sites personnalisés',
        settings_add_custom_site: '+ Ajouter un site',

        nav_dashboard: 'Tableau de bord',
        nav_library: 'Librairie',
        nav_discover: 'Découverte',
        nav_history: 'Historique',
        nav_settings: 'Paramètres',

        counter_read_chapters: 'Oeuvres suivies',
        dashboard_library_title: 'Bibliothèque',
        dashboard_empty_reading_title: 'Aucune lecture en cours',
        dashboard_empty_reading_subtitle: 'Ouvrez un chapitre pour commencer',
        dashboard_current_title: 'En cours de lecture',
        dashboard_current_empty_title: 'Aucun manga en cours',
        dashboard_current_empty_subtitle: 'Vos lectures apparaîtront ici',
        dashboard_current_from_tab: 'En cours de lecture',
        dashboard_current_from_tab_subtitle: 'Ouvrez un chapitre manga dans un onglet pour le voir ici',
        dashboard_not_in_library: 'Pas encore en bibliothèque',
        dashboard_btn_continue: 'Continuer',
        dashboard_btn_open: 'Ouvrir',
        dashboard_btn_add_library: 'Ajouter à la bibliothèque',
        dashboard_btn_tools: 'Outils',

        library_title: 'Ma Bibliothèque',
        library_add_current_btn: '📄 Page actuelle',
        library_add_current_title: 'Ouvrez un chapitre manga puis cliquez ici',
        library_add_manual_btn: '✏️ Manuellement',
        library_search_placeholder: 'Rechercher dans la bibliothèque...',
        library_sort_title_asc: 'Titre (A → Z)',
        library_sort_title_desc: 'Titre (Z → A)',
        library_sort_lastread_desc: 'Dernière lecture',
        library_sort_added_desc: 'Ajout récent',
        library_all_sites: 'Tous les sites',
        library_filter_all: 'Tous',
        library_filter_reading: 'En cours',
        library_filter_completed: 'Terminés',
        library_filter_paused: 'En pause',
        library_empty_title: 'Bibliothèque vide',
        library_empty_subtitle: 'Ajoutez vos mangas favoris',
        library_empty_filtered: '📚 Aucun manga dans cette catégorie',
        library_empty_generic: '📚 Aucun manga',
        library_source_unknown: 'Source inconnue',
        library_action_open: 'Ouvrir',
        library_action_edit: 'Modifier',
        library_action_delete: 'Supprimer',
        status_reading: 'En cours',
        status_completed: 'Terminé',
        status_paused: 'En pause',

        search_placeholder: 'Rechercher un manga...',
        search_loading: 'Recherche...',
        search_empty_prompt: 'Entrez un titre pour rechercher',
        search_no_results: '😕 Aucun résultat',
        search_error: '❌ Erreur de recherche',
        search_open_site: 'Ouvrir sur le site',
        search_open: 'Ouvrir',
        search_save_library: 'Ajouter à la bibliothèque',
        search_save: 'Enregistrer',
        chapter_label: 'Chapitre',

        history_title: 'Historique',
        history_clear: 'Effacer',
        history_empty: '📜 Aucun historique',
        chapter_short: 'Ch.',
        chapter_latest_available_simple: 'Dernier : Ch. {latest}',
        chapter_latest_available_read: 'Dernier : Ch. {latest} (tu lis Ch. {read})',
        chapter_latest_available_delta: 'Nouveaux : +{delta}',
        ago_days: 'il y a {n}j',
        ago_hours: 'il y a {n}h',
        ago_minutes: 'il y a {n}m',
        ago_now: 'À l\'instant',
        backup_export_btn: 'Exporter mes donnees',
        backup_import_btn: 'Importer une sauvegarde',
        backup_export_success: 'Sauvegarde exportee.',
        backup_import_invalid: 'Fichier de sauvegarde invalide.',
        backup_import_confirm: 'Importer cette sauvegarde et remplacer vos donnees actuelles ?',
        backup_import_success: 'Sauvegarde importee.',
        custom_sites_empty_title: '🛠️ Aucun site personnalisé',
        custom_sites_empty_subtitle: 'Cliquez sur "+ Ajouter un site" pour en configurer un.',
        custom_sites_test_hint: 'Le bouton "Tester" apparaitra sur chaque site ajoute.',
        custom_sites_test_current_page: 'Tester la page actuelle',
        custom_sites_edit: 'Modifier',
        custom_sites_delete: 'Supprimer',
        custom_sites_test: 'Tester',
        parser_diag_title: 'Diagnostic page actuelle',
        parser_diag_ok: 'La page semble compatible manga.',
        parser_diag_warn: 'Compatibilite partielle, un parser custom peut etre necessaire.',
        parser_diag_fail: 'La page ne ressemble pas a une page chapitre detectable.',
        parser_test_no_tab: 'Aucun onglet actif.',
        parser_test_not_web: 'Ouvrez une page web (http/https) pour tester.',
        parser_test_running: 'Test du parser en cours...',
        parser_test_failed: 'Impossible d’executer le test parser.',
        parser_test_domain_mismatch: 'Attention: le site configure ({site}) ne correspond pas au domaine courant ({tab}).',
        parser_test_result_title: 'Resultat test parser',
        parser_test_ok: 'Parser fonctionnel',
        parser_test_issue: 'Parser a verifier',

        settings_anilist_token: 'Jeton AniList (Optionnel)',
        settings_anilist_token_placeholder: 'Jeton d\'accès personnel...',
        settings_sync_anilist: 'Forcer la synchro AniList',
        settings_anilist_not_connected: 'Non connecté',
        settings_anilist_connected: 'Connecté',
        settings_anilist_login: 'Se connecter avec AniList',
        settings_anilist_logout: 'Déconnexion AniList',
        toast_sync_started: 'Synchro AniList lancée...',
        toast_sync_done: 'Synchro AniList terminée !'
      },
      en: {
        toast_ext_disabled_everywhere: 'Extension disabled everywhere. Reload open pages to apply.',
        toast_ext_enabled_everywhere: 'Extension enabled. Reload open pages to apply.',
        ext_active_everywhere: 'Enabled everywhere',
        ext_disabled_everywhere: 'Disabled everywhere',
        ext_not_web_page: 'Not a web page',
        ext_disable_site: 'Disable this site',
        ext_enable_site: 'Enable this site',
        ext_excluded_sites: 'Excluded sites',
        ext_site_removed: '“{host}” removed from exclusions. Reload the tab if needed.',
        ext_site_disabled: 'MangaCentral is disabled on {host}. Reload the tab.',
        ext_site_enabled: 'MangaCentral is enabled on {host}. Reload the tab.',
        ext_disabled_hint: 'MangaCentral is disabled on this page or everywhere. Re-enable it in Settings → Activation, then reload the tab.',
        settings_saved: 'Settings saved!',

        settings_activation_title: 'Activation',
        settings_activation_lead: 'Disable the extension everywhere or only on specific sites (reload the page after changing).',
        settings_extension_label: 'Extension',
        settings_current_tab: 'Current tab',
        settings_title: 'Settings',
        settings_display_lang: 'Display language',
        settings_autoscroll_speed: 'Autoscroll speed',
        settings_gemini_key: 'Gemini API key (translation)',
        settings_gemini_key_placeholder: 'API key...',
        settings_translation_lang: 'Translation language',
        settings_save: 'Save',
        settings_custom_sites: 'Custom sites',
        settings_add_custom_site: '+ Add a site',

        nav_dashboard: 'Dashboard',
        nav_library: 'Library',
        nav_discover: 'Discover',
        nav_history: 'History',
        nav_settings: 'Settings',

        counter_read_chapters: 'Tracked titles',
        dashboard_library_title: 'Library',
        dashboard_empty_reading_title: 'No reading in progress',
        dashboard_empty_reading_subtitle: 'Open a chapter to get started',
        dashboard_current_title: 'Currently reading',
        dashboard_current_empty_title: 'No manga in progress',
        dashboard_current_empty_subtitle: 'Your readings will appear here',
        dashboard_current_from_tab: 'Currently reading',
        dashboard_current_from_tab_subtitle: 'Open a manga chapter in a tab to display it here',
        dashboard_not_in_library: 'Not in library yet',
        dashboard_btn_continue: 'Continue',
        dashboard_btn_open: 'Open',
        dashboard_btn_add_library: 'Add to library',
        dashboard_btn_tools: 'Tools',

        library_title: 'My Library',
        library_add_current_btn: '📄 Current page',
        library_add_current_title: 'Open a manga chapter then click here',
        library_add_manual_btn: '✏️ Manually',
        library_search_placeholder: 'Search in library...',
        library_sort_title_asc: 'Title (A → Z)',
        library_sort_title_desc: 'Title (Z → A)',
        library_sort_lastread_desc: 'Last read',
        library_sort_added_desc: 'Recently added',
        library_all_sites: 'All sites',
        library_filter_all: 'All',
        library_filter_reading: 'Reading',
        library_filter_completed: 'Completed',
        library_filter_paused: 'Paused',
        library_empty_title: 'Library is empty',
        library_empty_subtitle: 'Add your favorite mangas',
        library_empty_filtered: '📚 No manga in this category',
        library_empty_generic: '📚 No manga',
        library_source_unknown: 'Unknown source',
        library_action_open: 'Open',
        library_action_edit: 'Edit',
        library_action_delete: 'Delete',
        status_reading: 'Reading',
        status_completed: 'Completed',
        status_paused: 'Paused',

        search_placeholder: 'Search a manga...',
        search_loading: 'Searching...',
        search_empty_prompt: 'Type a title to search',
        search_no_results: '😕 No results',
        search_error: '❌ Search error',
        search_open_site: 'Open on site',
        search_open: 'Open',
        search_save_library: 'Add to library',
        search_save: 'Save',
        chapter_label: 'Chapter',

        history_title: 'History',
        history_clear: 'Clear',
        history_empty: '📜 No history',
        chapter_short: 'Ch.',
        chapter_latest_available_simple: 'Latest: Ch. {latest}',
        chapter_latest_available_read: 'Latest: Ch. {latest} (you read Ch. {read})',
        chapter_latest_available_delta: 'New: +{delta}',
        ago_days: '{n}d ago',
        ago_hours: '{n}h ago',
        ago_minutes: '{n}m ago',
        ago_now: 'Just now',
        backup_export_btn: 'Export my data',
        backup_import_btn: 'Import backup',
        backup_export_success: 'Backup exported.',
        backup_import_invalid: 'Invalid backup file.',
        backup_import_confirm: 'Import this backup and replace your current data?',
        backup_import_success: 'Backup imported.',
        custom_sites_empty_title: '🛠️ No custom sites',
        custom_sites_empty_subtitle: 'Click "+ Add a site" to configure one.',
        custom_sites_test_hint: 'A "Test" button appears on each saved site.',
        custom_sites_test_current_page: 'Test current page',
        custom_sites_edit: 'Edit',
        custom_sites_delete: 'Delete',
        custom_sites_test: 'Test',
        parser_diag_title: 'Current page diagnostic',
        parser_diag_ok: 'This page looks manga-compatible.',
        parser_diag_warn: 'Partial compatibility, a custom parser may be needed.',
        parser_diag_fail: 'This page does not look like a detectable chapter page.',
        parser_test_no_tab: 'No active tab.',
        parser_test_not_web: 'Open a web page (http/https) to test.',
        parser_test_running: 'Running parser test...',
        parser_test_failed: 'Unable to run parser test.',
        parser_test_domain_mismatch: 'Warning: configured site ({site}) does not match current domain ({tab}).',
        parser_test_result_title: 'Parser test result',
        parser_test_ok: 'Parser looks good',
        parser_test_issue: 'Parser needs review',

        settings_anilist_token: 'AniList Token (Optional)',
        settings_anilist_token_placeholder: 'Personal access token...',
        settings_sync_anilist: 'Force AniList sync',
        settings_anilist_not_connected: 'Not connected',
        settings_anilist_connected: 'Connected',
        settings_anilist_login: 'Login with AniList',
        settings_anilist_logout: 'Logout from AniList',
        toast_sync_started: 'AniList sync started...',
        toast_sync_done: 'AniList sync finished!'
      }
    };
    const table = dict[lang] || dict.fr;
    let out = table[key] || dict.fr[key] || key;
    for (const [k, v] of Object.entries(vars || {})) {
      out = out.replaceAll(`{${k}}`, String(v));
    }
    return out;
  }

  applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      el.textContent = this.t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (!key) return;
      el.setAttribute('placeholder', this.t(key));
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      if (!key) return;
      el.setAttribute('title', this.t(key));
    });
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
    if (tabName === 'settings') this.refreshExtensionControlBar();
    if (tabName === 'library' || tabName === 'dashboard') this.refreshLatestChaptersForUi(false);
  }

  // ===== DASHBOARD (2 colonnes + bloc "En cours") =====
  async renderDashboard() {
    const container = document.getElementById('readingList');
    const countEl = document.getElementById('readingCount');
    const currentBlock = document.getElementById('currentReadingBlock');

    const reading = this.library.filter(m => m.status === 'reading');
    const totalWorks = (this.library || []).length;
    countEl.textContent = totalWorks >= 0 ? totalWorks : reading.length;

    const currentTab = await this.getCurrentTabReading();

    if (currentTab) {
      const { manga: featured, virtual } = currentTab;
      const featuredMainCh = featured.lastChapter != null ? String(featured.lastChapter) : '';
      const recentFeatured = this._normalizeRecentChapters(featured)
        .filter((r) => String(r.ch) !== featuredMainCh)
        .slice(0, 3);
      const featuredUserRead = this._getUserReadChapterForManga(featured);
      const featuredLatestDex = this._getLatestAvailableChapterForManga(featured);
      const featuredLatestLine = this._getReadAvailableLine(featured, featuredLatestDex);
      const featuredReferer = (featured && featured.url) ? String(featured.url) : '';
      currentBlock.innerHTML = `
        <div class="current-reading-content">
          <img src="${COVER_PLACEHOLDER}" data-mc-src="${(featured.cover && featured.cover.trim()) ? this._escapeHtml(featured.cover) : ''}" data-mc-referer="${this._escapeHtml(featuredReferer)}" class="current-reading-cover" alt="${this._escapeHtml(featured.title)}">
          <div class="current-reading-title">${this._escapeHtml(featured.title)}</div>
          ${virtual ? `<div class="current-reading-badge">${this.t('dashboard_not_in_library')}</div>` : ''}
          <div class="current-reading-chapter">${this.t('chapter_short')} ${featured.lastChapter || '?'}</div>
          ${featuredLatestLine ? `<div class="current-reading-available">${this._escapeHtml(featuredLatestLine)}</div>` : ''}
          ${recentFeatured.length ? `<div class="current-reading-recent">${recentFeatured.map(r => r.url ? `<a href="${this._escapeHtml(r.url)}" class="current-reading-recent-chap" data-url="${this._escapeHtml(r.url)}">${this.t('chapter_short')} ${this._escapeHtml(r.ch)}</a>` : `<span class="current-reading-recent-chap">${this.t('chapter_short')} ${this._escapeHtml(r.ch)}</span>`).join('')}</div>` : ''}
          <div class="current-reading-actions">
            <button type="button" class="btn-neon btn-continue">${featured.url ? this.t('dashboard_btn_continue') : this.t('dashboard_btn_open')}</button>
            ${virtual ? `<button type="button" class="btn-neon btn-add-current">${this.t('dashboard_btn_add_library')}</button>` : `<button type="button" class="btn-neon btn-open-tools">${this.t('dashboard_btn_tools')}</button>`}
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
        const cacheKey = this._searchTitleForCover(featured.title).toLowerCase();
        const cachedCover = this._coverCache.has(cacheKey) ? this._coverCache.get(cacheKey) : undefined;
        const img = document.getElementById('currentReadingBlock')?.querySelector('.current-reading-cover');
        if (cachedCover) {
          featured.cover = cachedCover;
          if (img) {
            img.dataset.mcSrc = cachedCover;
            setCoverFallback(img);
          }
        } else if (!this._coverFetchInFlight.has(cacheKey)) {
          const p = this.fetchCoverByTitle(featured.title)
            .then((coverUrl) => {
              if (!coverUrl) return null;
              featured.cover = coverUrl;
              const imgNow = document.getElementById('currentReadingBlock')?.querySelector('.current-reading-cover');
              if (imgNow) {
                imgNow.dataset.mcSrc = coverUrl;
                setCoverFallback(imgNow);
              }
              return coverUrl;
            })
            .finally(() => {
              this._coverFetchInFlight.delete(cacheKey);
            });
          this._coverFetchInFlight.set(cacheKey, p);
        }
      }
    } else {
      currentBlock.innerHTML = `
        <div class="current-reading-placeholder">
          <div class="placeholder-icon">📚</div>
          <p>${this.t('dashboard_current_from_tab')}</p>
          <small>${this.t('dashboard_current_from_tab_subtitle')}</small>
        </div>
      `;
    }

    if (reading.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>${this.t('dashboard_empty_reading_title')}</p>
          <small>${this.t('dashboard_empty_reading_subtitle')}</small>
        </div>
      `;
    } else {
      const readingOrdered = currentTab && !currentTab.virtual && reading.some(m => m.id === currentTab.manga.id)
        ? [currentTab.manga, ...reading.filter(m => m.id !== currentTab.manga.id)]
        : reading;

    container.innerHTML = readingOrdered.map(manga => {
      const recent = this._normalizeRecentChapters(manga).slice(0, 3);
      const mainChapter = manga.furthestChapter != null && manga.furthestChapter !== '' ? manga.furthestChapter : manga.lastChapter;
      const mainChapterStr = mainChapter != null ? String(mainChapter) : '';
      const userRead = this._getUserReadChapterForManga(manga);
      const latestDex = this._getLatestAvailableChapterForManga(manga);
      const latestLine = this._getReadAvailableLine(manga, latestDex);
      const referer = manga && manga.url ? this._escapeHtml(String(manga.url)) : '';
      return `
      <div class="manga-card" data-id="${manga.id}">
        <img src="${COVER_PLACEHOLDER}" data-mc-src="${(manga.cover && manga.cover.trim()) ? this._escapeHtml(manga.cover) : ''}" data-mc-referer="${referer}" class="manga-cover" alt="${manga.title}">
        <div class="manga-info">
          <h3>${this._escapeHtml(manga.title)}</h3>
          ${latestLine ? `<p class="manga-available">${this._escapeHtml(latestLine)}</p>` : `<p class="manga-latest">${this.t('chapter_short')} ${mainChapter || '?'}</p>`}
          ${recent.length ? `<div class="manga-recent-chapters">${recent.filter(r => String(r.ch) !== mainChapterStr).map(r => r.url ? `<a href="${this._escapeHtml(r.url)}" class="manga-recent-chap" data-url="${this._escapeHtml(r.url)}">${this.t('chapter_short')} ${this._escapeHtml(r.ch)}</a>` : `<span class="manga-recent-chap">${this.t('chapter_short')} ${this._escapeHtml(r.ch)}</span>`).join('')}</div>` : ''}
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

    for (const manga of readingOrdered) {
      if (!manga || (manga.cover && String(manga.cover).trim())) continue;
      if (manga._mcCoverRequested) continue;
      manga._mcCoverRequested = true;

      const cacheKey = this._searchTitleForCover(manga.title).toLowerCase();
      const cachedCover = this._coverCache.has(cacheKey) ? this._coverCache.get(cacheKey) : undefined;
      if (cachedCover) {
        manga.cover = cachedCover;
        const img = container.querySelector(`.manga-card[data-id="${CSS.escape(manga.id)}"] .manga-cover`);
        if (img) {
          img.dataset.mcSrc = cachedCover;
          setCoverFallback(img);
        }
        continue;
      }

      if (this._coverFetchInFlight.has(cacheKey)) continue;
      const p = this.fetchCoverByTitle(manga.title)
        .then((coverUrl) => {
          if (!coverUrl) return null;
          manga.cover = coverUrl;
          const img = container.querySelector(`.manga-card[data-id="${CSS.escape(manga.id)}"] .manga-cover`);
          if (img) {
            img.dataset.mcSrc = coverUrl;
            setCoverFallback(img);
          }
          return coverUrl;
        })
        .finally(() => {
          this._coverFetchInFlight.delete(cacheKey);
        });
      this._coverFetchInFlight.set(cacheKey, p);
    }
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
        else if (response.error === 'extension_disabled') {
          this.showToast(this.t('ext_disabled_hint'), 'error');
        } else this.showToast('Cette page n’est pas reconnue comme un chapitre manga.\n\nOuvrez un chapitre (l’URL doit contenir un numéro, ex. chapitre-614 ou chapter-123) puis réessayez.', 'error');
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
          <p>${filterStatus !== 'all' ? this.t('library_empty_filtered') : this.t('library_empty_generic')}</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = filtered.map(manga => {
      const referer = manga && manga.url ? this._escapeHtml(String(manga.url)) : '';
      const urlDomain = this._getDomainFromUrl(manga && manga.url);
      const sourceLabel = manga.source || urlDomain || this.t('library_source_unknown');
      const userRead = this._getUserReadChapterForManga(manga);
      const latestDex = this._getLatestAvailableChapterForManga(manga);
      const latestLine = this._getReadAvailableLine(manga, latestDex);
      return `
      <div class="library-item" data-id="${manga.id}">
        <img src="${COVER_PLACEHOLDER}" data-mc-src="${(manga.cover && manga.cover.trim()) ? this._escapeHtml(manga.cover) : ''}" data-mc-referer="${referer}" class="library-cover" alt="${manga.title}">
        <div class="library-details">
          <div>
            <div class="library-title">${manga.title}</div>
            <div class="library-meta">${sourceLabel}</div>
            <span class="library-status ${manga.status}">${this.getStatusLabel(manga.status)}</span>
            ${latestLine ? `<div class="library-progress">${this._escapeHtml(latestLine)}</div>` : ''}
          </div>
          <div class="library-actions">
            <button class="action-btn open-btn" title="${this.t('library_action_open')}">🔗</button>
            <button class="action-btn edit-btn" title="${this.t('library_action_edit')}">✏️</button>
            <button class="action-btn delete-btn" title="${this.t('library_action_delete')}">🗑️</button>
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

    // Si le cache ne contient pas encore les "chapitres disponibles",
    // on les récupère à la demande pour les quelques oeuvres visibles.
    this._ensureLatestChaptersForVisible(filtered.slice(0, 10));
  }

  async _ensureLatestChaptersForVisible(mangaList) {
    if (!Array.isArray(mangaList) || mangaList.length === 0) return;
    if (this._latestFetchInFlight.size > 12) return; // avoid flooding

    const pending = [];
    const now = Date.now();
    const retryCooldownMs = 5 * 60 * 1000;

    for (const manga of mangaList) {
      if (!manga) continue;
      const popupWorkKey = manga.workKey || this._getWorkKey(manga.title, manga.url);
      if (!popupWorkKey) continue;

      const cached = this.latestChapterCache && this.latestChapterCache[popupWorkKey];
      if (cached && Number.isFinite(Number(cached.latest))) continue;
      if (cached && cached.errorAt && (now - Number(cached.errorAt)) < retryCooldownMs) continue;
      if (this._latestFetchInFlight.has(popupWorkKey)) continue;

      const p = chrome.runtime.sendMessage({
        type: 'GET_LATEST_CHAPTER_FOR_MANGADEX',
        payload: { title: manga.title, url: manga.url }
      })
        .then((res) => {
          if (!res || !res.ok || !Number.isFinite(Number(res.latest))) {
            this.latestChapterCache[popupWorkKey] = { latest: null, updatedAt: now, errorAt: now };
            return;
          }
          this.latestChapterCache[popupWorkKey] = { latest: Number(res.latest), updatedAt: now };
        })
        .catch(() => {})
        .finally(() => {
          this._latestFetchInFlight.delete(popupWorkKey);
        });

      this._latestFetchInFlight.set(popupWorkKey, p);
      pending.push(p);
    }

    if (!pending.length) return;

    if (!this._latestUiRerenderPending) {
      this._latestUiRerenderPending = true;
      Promise.allSettled(pending).finally(() => {
        this._latestUiRerenderPending = false;
        // Rafraichit pour afficher les valeurs "Ch. lu / Ch. dispo".
        this.renderDashboard();
        this.renderLibrary();
      });
    }
  }

  getStatusLabel(status) {
    const labels = {
      reading: this.t('status_reading'),
      completed: this.t('status_completed'),
      paused: this.t('status_paused')
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
            <img src="${COVER_PLACEHOLDER}" data-mc-src="${(result.cover && result.cover.trim()) ? this._escapeHtml(result.cover) : ''}" data-mc-referer="${referer}" class="search-cover" alt="${this._escapeHtml(result.title)}">
            <div class="search-details">
              <div class="search-title">${this._escapeHtml(result.title)}</div>
              <div class="search-source">📍 ${this._escapeHtml(result.source || '')}</div>
              <div class="search-chapter">📖 ${this.t('chapter_label')} ${this._escapeHtml(String(result.latestChapter || '?'))}</div>
              <div class="search-actions">
                ${hasUrl ? `<button type="button" class="btn-neon btn-search-open" title="${this.t('search_open_site')}">${this.t('search_open')}</button>` : ''}
                <button type="button" class="btn-ghost btn-search-save" title="${this.t('search_save_library')}">${this.t('search_save')}</button>
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
            <p>${this.t('search_no_results')}</p>
          </div>
        `;
      }
    } catch (error) {
      console.error('Search error:', error);
      loadingContainer.style.display = 'none';
      resultsContainer.style.display = 'block';
      resultsContainer.innerHTML = `
        <div class="empty-state">
          <p>${this.t('search_error')}</p>
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
          <p>${this.t('history_empty')}</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = this.history.map((entry, index) => `
      <div class="history-item" data-index="${index}">
        <div class="history-text">
          <div class="history-title">${this._escapeHtml(entry.title)}</div>
          <div class="history-chapter">${this.t('chapter_label')} ${this._escapeHtml(entry.chapter)}</div>
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
    
    if (days > 0) return this.t('ago_days', { n: days });
    if (hours > 0) return this.t('ago_hours', { n: hours });
    if (minutes > 0) return this.t('ago_minutes', { n: minutes });
    return this.t('ago_now');
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

  _normalizeHostKey(host) {
    return String(host || '').replace(/^www\./i, '').toLowerCase();
  }

  async refreshExtensionControlBar() {
    const enabledCb = document.getElementById('globalExtensionEnabled');
    const hint = document.getElementById('globalExtensionHint');
    const hostEl = document.getElementById('currentSiteHost');
    const siteBtn = document.getElementById('toggleCurrentSiteBtn');
    const chips = document.getElementById('disabledHostsChips');

    if (enabledCb) enabledCb.checked = !this.settings.extensionDisabled;
    if (hint) {
      hint.textContent = this.settings.extensionDisabled ? this.t('ext_disabled_everywhere') : this.t('ext_active_everywhere');
    }

    let tabHost = '';
    let tabOk = false;
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs && tabs[0];
      const url = tab && tab.url ? String(tab.url) : '';
      if (/^https?:\/\//i.test(url)) {
        tabHost = new URL(url).hostname.replace(/^www\./i, '');
        tabOk = true;
      }
    } catch (_) {
      /* ignore */
    }

    if (hostEl) hostEl.textContent = tabOk ? tabHost : '—';
    if (siteBtn) {
      if (!tabOk) {
        siteBtn.disabled = true;
        siteBtn.textContent = this.t('ext_not_web_page');
        delete siteBtn.dataset.host;
      } else {
        siteBtn.disabled = false;
        siteBtn.dataset.host = tabHost;
        const hosts = this.settings.disabledHosts || [];
        const nh = this._normalizeHostKey(tabHost);
        const siteOff = hosts.some((h) => this._normalizeHostKey(h) === nh);
        siteBtn.textContent = siteOff ? this.t('ext_enable_site') : this.t('ext_disable_site');
      }
    }

    const hostList = (this.settings.disabledHosts || []).filter(Boolean);
    if (chips) {
      if (hostList.length === 0) {
        chips.hidden = true;
        chips.innerHTML = '';
      } else {
        chips.hidden = false;
        chips.innerHTML =
          `<span class="disabled-hosts-title">${this.t('ext_excluded_sites')}</span>` +
          hostList
            .map((h) => {
              const safe = this._escapeHtml(h);
              return `<span class="host-chip" data-host="${safe}"><span class="host-chip-text">${safe}</span><button type="button" class="host-chip-remove" aria-label="Retirer ${safe}">×</button></span>`;
            })
            .join('');
        chips.querySelectorAll('.host-chip-remove').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const chip = btn.closest('.host-chip');
            const raw = chip && chip.getAttribute('data-host');
            if (!raw) return;
            this.settings.disabledHosts = (this.settings.disabledHosts || []).filter((x) => String(x) !== raw);
            await this.saveSettings();
            await this.refreshExtensionControlBar();
            this.showToast(this.t('ext_site_removed', { host: raw }), 'success');
          });
        });
      }
    }
  }

  setupExtensionControls() {
    const enabledCb = document.getElementById('globalExtensionEnabled');
    const siteBtn = document.getElementById('toggleCurrentSiteBtn');
    if (enabledCb) {
      enabledCb.addEventListener('change', async () => {
        this.settings.extensionDisabled = !enabledCb.checked;
        await this.saveSettings();
        this.showToast(
          this.settings.extensionDisabled
            ? this.t('toast_ext_disabled_everywhere')
            : this.t('toast_ext_enabled_everywhere'),
          'info'
        );
        await this.refreshExtensionControlBar();
      });
    }
    if (siteBtn) {
      siteBtn.addEventListener('click', async () => {
        const h = siteBtn.dataset.host;
        if (!h || siteBtn.disabled) return;
        const nh = this._normalizeHostKey(h);
        const hosts = Array.isArray(this.settings.disabledHosts) ? [...this.settings.disabledHosts] : [];
        const idx = hosts.findIndex((x) => this._normalizeHostKey(x) === nh);
        if (idx === -1) {
          hosts.push(h);
          this.showToast(this.t('ext_site_disabled', { host: h }), 'info');
        } else {
          hosts.splice(idx, 1);
          this.showToast(this.t('ext_site_enabled', { host: h }), 'info');
        }
        this.settings.disabledHosts = hosts;
        await this.saveSettings();
        await this.refreshExtensionControlBar();
      });
    }
  }

  // ===== SETTINGS (onglet Paramètres) =====
  setupSettings() {
    const displayLangEl = document.getElementById('displayLang');
    const speedEl = document.getElementById('defaultScrollSpeed');
    const speedValueEl = document.getElementById('speedValue');
    if (displayLangEl) displayLangEl.value = this.settings.displayLang || 'fr';
    if (speedEl && speedValueEl) {
      speedEl.value = this.settings.autoScrollSpeed;
      speedValueEl.textContent = this.settings.autoScrollSpeed;
      speedEl.addEventListener('input', () => { speedValueEl.textContent = speedEl.value; });
    }
    const apiKeyEl = document.getElementById('geminiApiKey');
    const langEl = document.getElementById('translationLang');
    if (apiKeyEl) apiKeyEl.value = this.settings.geminiApiKey || '';
    if (langEl) langEl.value = this.settings.translationLang;

    // Notification elements removed

    if (displayLangEl) {
      displayLangEl.addEventListener('change', async () => {
        this.settings.displayLang = (displayLangEl.value === 'en') ? 'en' : 'fr';
        await this.saveSettings();
        this.applyI18n();
        this.renderDashboard();
        this.renderLibrary();
        this.renderHistory();
        this.renderCustomSitesPreview();
        await this.refreshExtensionControlBar();
      });
    }

    document.getElementById('saveSettingsBtn')?.addEventListener('click', async () => {
      const displayLang = displayLangEl ? String(displayLangEl.value || 'fr') : (this.settings.displayLang || 'fr');
      const speed = document.getElementById('defaultScrollSpeed').value;
      const apiKey = document.getElementById('geminiApiKey').value.trim();
      const lang = document.getElementById('translationLang').value;
      this.settings.displayLang = (displayLang === 'en') ? 'en' : 'fr';
      this.settings.autoScrollSpeed = parseInt(speed, 10);
      this.settings.geminiApiKey = apiKey;
      this.settings.translationLang = lang;
      await this.saveSettings();
      this.applyI18n();
      this.renderDashboard();
      this.renderLibrary();
      this.renderHistory();
      this.renderCustomSitesPreview();
      await this.refreshExtensionControlBar();
      this.showToast(this.t('settings_saved'), 'success');
    });

    document.getElementById('syncAnilistBtn')?.addEventListener('click', () => {
      this.showToast(this.t('toast_sync_started'), 'info');
      chrome.runtime.sendMessage({ type: 'SYNC_ANILIST' }, (res) => {
        if (res && res.ok) {
          this.showToast(this.t('toast_sync_done'), 'success');
        } else {
          this.showToast(this.t('search_error'), 'error');
        }
      });
    });

    const loginAnilistBtn = document.getElementById('loginAnilistBtn');
    const logoutAnilistBtn = document.getElementById('logoutAnilistBtn');
    const anilistStatusText = document.getElementById('anilistStatusText');

    const updateAnilistUI = () => {
      if (this.settings.anilistToken) {
        anilistStatusText.setAttribute('data-i18n', 'settings_anilist_connected');
        anilistStatusText.textContent = this.t('settings_anilist_connected');
        anilistStatusText.style.color = '#50fa7b';
        loginAnilistBtn.style.display = 'none';
        logoutAnilistBtn.style.display = 'block';
      } else {
        anilistStatusText.setAttribute('data-i18n', 'settings_anilist_not_connected');
        anilistStatusText.textContent = this.t('settings_anilist_not_connected');
        anilistStatusText.style.color = '#8b949e';
        loginAnilistBtn.style.display = 'block';
        logoutAnilistBtn.style.display = 'none';
      }
    };

    if (loginAnilistBtn) {
      updateAnilistUI();
      
      loginAnilistBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'LOGIN_ANILIST' }, async (res) => {
          if (res && res.ok) {
            await this.loadData();
            updateAnilistUI();
            this.showToast(this.t('settings_saved'), 'success');
          } else {
            this.showToast(this.t('search_error'), 'error');
          }
        });
      });

      logoutAnilistBtn.addEventListener('click', async () => {
        this.settings.anilistToken = '';
        await this.saveSettings();
        updateAnilistUI();
      });
    }
  }

  // ===== CUSTOM SITES (tout dans le popup, pas de nouvelle URL) =====
  setupBackupRestore() {
    const exportBtn = document.getElementById('exportDataBtn');
    const importBtn = document.getElementById('importDataBtn');
    const importInput = document.getElementById('importDataInput');

    exportBtn?.addEventListener('click', async () => {
      const payload = await chrome.storage.local.get([
        'library', 'readingHistory', 'settings', 'customSites',
        'chapterNotifyBaseline', 'notifyClickUrls', 'chapterEvents',
        'latestChapterCache'
      ]);
      const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        data: {
          library: payload.library || [],
          readingHistory: payload.readingHistory || [],
          settings: payload.settings || {},
          customSites: payload.customSites || [],
          chapterNotifyBaseline: payload.chapterNotifyBaseline || {},
          notifyClickUrls: payload.notifyClickUrls || {},
          chapterEvents: payload.chapterEvents || [],
          latestChapterCache: payload.latestChapterCache || {}
        }
      };
      const fileName = `mangacentral-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      this.showToast(this.t('backup_export_success'), 'success');
    });

    importBtn?.addEventListener('click', () => importInput?.click());
    importInput?.addEventListener('change', async () => {
      const file = importInput.files && importInput.files[0];
      if (!file) return;
      try {
        const raw = await file.text();
        const json = JSON.parse(raw);
        const data = json && typeof json === 'object' ? (json.data || json) : null;
        const library = Array.isArray(data && data.library) ? data.library : null;
        const readingHistory = Array.isArray(data && data.readingHistory) ? data.readingHistory : null;
        const customSites = Array.isArray(data && data.customSites) ? data.customSites : null;
        const settings = data && typeof data.settings === 'object' && data.settings ? data.settings : null;
        if (!library || !readingHistory || !customSites || !settings) {
          this.showToast(this.t('backup_import_invalid'), 'error');
          importInput.value = '';
          return;
        }
        if (!confirm(this.t('backup_import_confirm'))) {
          importInput.value = '';
          return;
        }
        const extra = {};
        const d = data && typeof data === 'object' ? data : {};
        if (d.chapterNotifyBaseline && typeof d.chapterNotifyBaseline === 'object') extra.chapterNotifyBaseline = d.chapterNotifyBaseline;
        if (d.notifyClickUrls && typeof d.notifyClickUrls === 'object') extra.notifyClickUrls = d.notifyClickUrls;
        if (Array.isArray(d.chapterEvents)) extra.chapterEvents = d.chapterEvents;
        if (d.latestChapterCache && typeof d.latestChapterCache === 'object') extra.latestChapterCache = d.latestChapterCache;
        await chrome.storage.local.set({ library, readingHistory, customSites, settings, ...extra });
        await this.loadData();
        this.applyI18n();
        this.renderDashboard();
        this.renderLibrary();
        this.renderHistory();
        this.renderCustomSitesPreview();
        await this.refreshExtensionControlBar();
        this.showToast(this.t('backup_import_success'), 'success');
      } catch (_) {
        this.showToast(this.t('backup_import_invalid'), 'error');
      } finally {
        importInput.value = '';
      }
    });
  }

  setupCustomSites() {
    document.getElementById('addCustomSiteBtn').addEventListener('click', (e) => {
      e.preventDefault();
      this.openSiteModal();
    });
    document.getElementById('testCurrentPageBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.testCurrentPageParserDiagnostic();
    });
  }

  async testCurrentPageParserDiagnostic() {
    let tab = null;
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tab = tabs && tabs[0] ? tabs[0] : null;
    } catch (_) {
      tab = null;
    }
    if (!tab) {
      this.showToast(this.t('parser_test_no_tab'), 'error');
      return;
    }
    const url = String(tab.url || '');
    if (!/^https?:\/\//i.test(url)) {
      this.showToast(this.t('parser_test_not_web'), 'error');
      return;
    }

    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: () => {
          const out = {
            url: location.href,
            host: location.hostname.replace(/^www\./i, ''),
            title: document.title || '',
            hasH1: !!document.querySelector('h1'),
            hasOgTitle: !!document.querySelector('meta[property="og:title"]'),
            hasOgImage: !!document.querySelector('meta[property="og:image"]'),
            chapter: null,
            largeImages: 0
          };

          const urlPatterns = [
            /[?&](?:chapter|chapitre|chap)=(\d+(?:\.\d+)?)/i,
            /[?&]ch=(\d+(?:\.\d+)?)/i,
            /(?:chapter|chapitre|chap)[-_\/]?(\d+(?:\.\d+)?)/i,
            /\/ch[-_]?(\d+)(?:\/|$)/i,
            /chapter-(\d+)(?:-|\.|$)/i,
            /episode[-_]?(\d+)/i,
            /\/scan\/[^/]*?(\d+)(?:\/|$)/i,
            /(?:^|\/)(\d+)\/?$/
          ];
          for (const re of urlPatterns) {
            const m = location.href.match(re);
            if (m && m[1]) {
              out.chapter = String(m[1]);
              break;
            }
          }
          if (!out.chapter) {
            const mt = (document.title || '').match(/(?:chapter|chapitre|ch\.|chap)\s*(\d+)/i);
            if (mt && mt[1]) out.chapter = String(mt[1]);
          }

          const imgs = Array.from(document.querySelectorAll('img'));
          out.largeImages = imgs.filter((img) => {
            const w = img.naturalWidth || img.width || 0;
            const h = img.naturalHeight || img.height || 0;
            const src = img.src || img.dataset?.src || '';
            return !!src && (w > 300 && h > 400);
          }).length;

          return out;
        }
      });

      if (!result) {
        this.showToast(this.t('parser_test_failed'), 'error');
        return;
      }

      const score =
        (result.chapter ? 1 : 0) +
        (result.hasH1 || result.hasOgTitle ? 1 : 0) +
        (result.largeImages > 0 ? 1 : 0);
      const state = score >= 3 ? 'ok' : (score === 2 ? 'warn' : 'fail');
      const summary =
        state === 'ok' ? this.t('parser_diag_ok') :
        state === 'warn' ? this.t('parser_diag_warn') :
        this.t('parser_diag_fail');

      alert(
`${this.t('parser_diag_title')}
${summary}

URL: ${result.url}
Host: ${result.host}
Chapter detected: ${result.chapter || 'N/A'}
Title source hint: ${(result.hasH1 || result.hasOgTitle) ? 'OK' : 'NOK'}
OG image: ${result.hasOgImage ? 'OK' : 'NOK'}
Large images detected: ${result.largeImages}`
      );
      this.showToast(summary, state === 'fail' ? 'error' : (state === 'warn' ? 'info' : 'success'));
    } catch (_) {
      this.showToast(this.t('parser_test_failed'), 'error');
    }
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

  async testCustomSiteParser(site) {
    if (!site) return;
    let tab = null;
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tab = tabs && tabs[0] ? tabs[0] : null;
    } catch (_) {
      tab = null;
    }
    if (!tab) {
      this.showToast(this.t('parser_test_no_tab'), 'error');
      return;
    }
    const url = String(tab.url || '');
    if (!/^https?:\/\//i.test(url)) {
      this.showToast(this.t('parser_test_not_web'), 'error');
      return;
    }

    let tabDomain = '';
    try { tabDomain = new URL(url).hostname.replace(/^www\./i, ''); } catch (_) {}
    const siteDomain = String(site.domain || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
    if (siteDomain && tabDomain && siteDomain !== tabDomain) {
      this.showToast(this.t('parser_test_domain_mismatch', { site: siteDomain, tab: tabDomain }), 'info');
    } else {
      this.showToast(this.t('parser_test_running'), 'info');
    }

    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: (config) => {
          const out = {
            url: location.href,
            title: '',
            chapter: 'Inconnu',
            cover: '',
            titleFound: false,
            chapterFound: false,
            containerFound: false,
            imagesCount: 0,
            nextFound: false,
            prevFound: false,
            errors: []
          };

          try {
            const titleSelectors = String(config.titleSelector || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            for (const selector of titleSelectors) {
              const el = document.querySelector(selector);
              const txt = el && el.innerText ? String(el.innerText).trim() : '';
              if (txt) {
                out.title = txt;
                out.titleFound = true;
                break;
              }
            }
            if (!out.title) {
              out.title = document.querySelector('meta[property="og:title"]')?.content || document.title || '';
              out.titleFound = !!out.title;
            }
          } catch (e) {
            out.errors.push('title');
          }

          try {
            if (config.chapterPattern) {
              const regex = new RegExp(config.chapterPattern, 'i');
              const m = location.href.match(regex);
              if (m && m[1]) {
                out.chapter = String(m[1]);
                out.chapterFound = true;
              }
            }
          } catch (e) {
            out.errors.push('chapterPattern');
          }

          try {
            out.cover = config.coverSelector
              ? (document.querySelector(config.coverSelector)?.src || '')
              : (document.querySelector('meta[property="og:image"]')?.content || '');
          } catch (e) {
            out.errors.push('coverSelector');
          }

          try {
            const container = config.containerSelector ? document.querySelector(config.containerSelector) : null;
            out.containerFound = !!container;
            if (container && config.imageSelector) {
              const imgs = Array.from(container.querySelectorAll(config.imageSelector));
              out.imagesCount = imgs.filter((img) => {
                const src = img.src || img.dataset.src || img.dataset.url || img.dataset.original || '';
                return !!src;
              }).length;
            }
          } catch (e) {
            out.errors.push('images');
          }

          try {
            const nextBtn = config.nextButtonSelector ? document.querySelector(config.nextButtonSelector) : null;
            const prevBtn = config.prevButtonSelector ? document.querySelector(config.prevButtonSelector) : null;
            out.nextFound = !!(nextBtn && nextBtn.href);
            out.prevFound = !!(prevBtn && prevBtn.href);
          } catch (e) {
            out.errors.push('nav');
          }

          return out;
        },
        args: [site]
      });

      if (!result) {
        this.showToast(this.t('parser_test_failed'), 'error');
        return;
      }

      const okScore =
        (result.titleFound ? 1 : 0) +
        (result.chapterFound ? 1 : 0) +
        (result.containerFound ? 1 : 0) +
        (result.imagesCount > 0 ? 1 : 0);
      const status = okScore >= 3 ? this.t('parser_test_ok') : this.t('parser_test_issue');
      const report =
`${this.t('parser_test_result_title')} - ${site.name}
${status}

URL: ${result.url || '-'}
Title: ${result.title || '-'} (${result.titleFound ? 'OK' : 'NOK'})
Chapter: ${result.chapter || '-'} (${result.chapterFound ? 'OK' : 'NOK'})
Container: ${result.containerFound ? 'OK' : 'NOK'}
Images detected: ${result.imagesCount || 0}
Next button: ${result.nextFound ? 'OK' : 'NOK'}
Prev button: ${result.prevFound ? 'OK' : 'NOK'}
Errors: ${(result.errors && result.errors.length) ? result.errors.join(', ') : '-'}`;

      alert(report);
      this.showToast(status, okScore >= 3 ? 'success' : 'info');
    } catch (_) {
      this.showToast(this.t('parser_test_failed'), 'error');
    }
  }

  renderCustomSitesPreview() {
    const container = document.getElementById('customSitesList');
    
    if (this.customSites.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>${this.t('custom_sites_empty_title')}</p>
          <small>${this.t('custom_sites_empty_subtitle')}</small>
          <small>${this.t('custom_sites_test_hint')}</small>
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
          <button type="button" class="test-site" title="${this.t('custom_sites_test')}">${this.t('custom_sites_test')}</button>
          <button type="button" class="edit-site" title="${this.t('custom_sites_edit')}">✏️</button>
          <button type="button" class="delete-site" title="${this.t('custom_sites_delete')}">🗑️</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.site-card-popup').forEach(card => {
      const id = card.dataset.id;
      card.querySelector('.test-site').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const site = this.customSites.find(s => s.id === id);
        if (site) this.testCustomSiteParser(site);
      });
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
