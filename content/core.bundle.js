(function() {
  "use strict";
  class BaseParser {
    constructor(document2) {
      this.document = document2;
      this.name = "Unknown";
    }
    /**
     * Vérifie si ce parser est compatible avec l'URL donnée.
     * @param {string} url 
     * @returns {boolean}
     */
    static isCompatible(url) {
      return false;
    }
    /**
     * Extrait les métadonnées du manga (Titre, Chapitre, Cover).
     * @returns {Promise<{title: string, chapter: string, cover: string}>}
     */
    async getMeta() {
      throw new Error("Method 'getMeta()' must be implemented.");
    }
    /**
     * Récupère la liste des URLs des images du chapitre.
     * @returns {Promise<string[]>}
     */
    async getPages() {
      throw new Error("Method 'getPages()' must be implemented.");
    }
    /**
     * Trouve l'URL du chapitre suivant.
     * @returns {string|null}
     */
    getNextChapterUrl() {
      return null;
    }
    /**
     * Trouve l'URL du chapitre précédent.
     * @returns {string|null}
     */
    getPrevChapterUrl() {
      return null;
    }
  }
  function getChapterFromUrl(href) {
    if (!href) return null;
    const url = href.replace(/#.*$/, "");
    const path = url.replace(/^[^?]+\?/, "");
    const pathOnly = url.split("?")[0];
    const pathPatterns = [
      // Query string (priorité)
      /[?&](?:chapter|chapitre|chap)=(\d+(?:\.\d+)?)/i,
      /[?&]ch=(\d+(?:\.\d+)?)/i,
      /[?&]c=(\d+)/i,
      // Classiques : chapter-123, chapter/123, chapter123 (séparateur optionnel comme avant)
      /(?:chapter|chapitre|chap)[-_\/]?(\d+(?:\.\d+)?)/i,
      /(?:chapter|chapitre)s?\/(\d+)/i,
      /\/ch[-_]?(\d+)(?:\/|$)/i,
      /\/c(\d+)(?:\/|$)/i,
      /chap[-_](\d+)/i,
      /vol-\d+\/chap[-_]?(\d+)/i,
      /chapter-(\d+)\.html/i,
      /chapter-(\d+)(?:-|\.|$)/i,
      /chapters\/(\d+)/i,
      /episode[-_]?(\d+)/i,
      /episode\/(\d+)/i,
      /viewer\/(\d+)/i,
      /\/view\/(\d+)(?:\/|$)/i,
      /\/read\/[^/]+\/[^/]+\/\d+\/(\d+)\/?/i,
      /(?:manga|manhwa|comics?|scan-vf)\/[^/]+\/[^/]+\/(\d+)\/?/i,
      /(?:library|directory|archives|online)\/[^/]+\/[^/]+\/[^/]+\/(\d+)(?:\/|\.)/i,
      /manga-list\/[^/]+\/[^/]+\/chapter-(\d+)\.html/i,
      /(?:comic|title)\/\d+\/view\/(\d+)/i,
      /\/title\/\d+\/chapter\/(\d+)/i,
      // scan/OP1174, scan/one-piece-1174 (MangaMoins et similaires)
      /\/scan\/[^/]*?(\d+)(?:\/|$)/i,
      /(?:\/lecture|\/view|\/read)\/[^/]*?(\d+)(?:\/|$)/i,
      /(?:^|\/)(\d+)\/?$/
    ];
    for (const re of pathPatterns) {
      const m = pathOnly.match(re) || path.match(re);
      if (m && m[1]) return m[1];
    }
    return null;
  }
  class GenericParser extends BaseParser {
    constructor(document2) {
      super(document2);
      this.name = "Generic";
    }
    static isCompatible(url) {
      return true;
    }
    async getMeta() {
      var _a, _b, _c;
      let title = ((_a = this.document.querySelector('meta[property="og:title"]')) == null ? void 0 : _a.content) || ((_b = this.document.querySelector("h1")) == null ? void 0 : _b.innerText) || this.document.title;
      title = title.replace(/(Read|Scan|Manga|Manhwa|Free)\s/gi, "").trim();
      let chapter = "Inconnu";
      const urlCh = getChapterFromUrl(window.location.href);
      if (urlCh) chapter = urlCh;
      if (chapter === "Inconnu") {
        const titleMatch = this.document.title.match(/(?:chapter|chapitre|ch\.|chap)\s*(\d+)/i);
        if (titleMatch) chapter = titleMatch[1];
      }
      const cover = ((_c = this.document.querySelector('meta[property="og:image"]')) == null ? void 0 : _c.content) || "";
      return { title, chapter, cover };
    }
    async getPages() {
      const allImages = Array.from(this.document.querySelectorAll("img"));
      const candidates = allImages.filter((img) => {
        const w = img.naturalWidth || parseInt(img.getAttribute("width"), 10) || 0;
        const h = img.naturalHeight || parseInt(img.getAttribute("height"), 10) || 0;
        if (w > 300 && h > 400) return true;
        const rect = img.getBoundingClientRect();
        const hasSrc = img.src || img.dataset.src || img.dataset.url || img.getAttribute("data-src");
        if (rect.width > 300 && rect.height > 400 && hasSrc) return true;
        return false;
      });
      return candidates.map(
        (img) => img.src || img.dataset.src || img.dataset.url || img.getAttribute("data-src") || ""
      ).filter(Boolean);
    }
    getNextChapterUrl() {
      const links = Array.from(this.document.querySelectorAll("a"));
      const nextLink = links.find((a) => {
        const text = a.innerText.toLowerCase();
        return text.includes("next") || text.includes("suivant") || a.className.includes("next");
      });
      return nextLink ? nextLink.href : null;
    }
  }
  class AsuraParser extends BaseParser {
    constructor(document2) {
      super(document2);
      this.name = "Asura Scans";
    }
    static isCompatible(url) {
      return url.includes("asuracomic.net") || url.includes("asurascans");
    }
    async getMeta() {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
      let title = ((_b = (_a = this.document.querySelector(".entry-title")) == null ? void 0 : _a.innerText) == null ? void 0 : _b.trim()) || ((_d = (_c = this.document.querySelector(".allc a")) == null ? void 0 : _c.innerText) == null ? void 0 : _d.trim()) || ((_f = (_e = this.document.querySelector('meta[property="og:title"]')) == null ? void 0 : _e.content) == null ? void 0 : _f.trim()) || ((_h = (_g = this.document.querySelector("h1")) == null ? void 0 : _g.innerText) == null ? void 0 : _h.trim()) || ((_i = this.document.title) == null ? void 0 : _i.trim()) || "";
      if (title) title = title.replace(/\s*[-|]\s*Chapter\s*\d+.*$/i, "").replace(/\s*[-|]\s*Chapitre\s*\d+.*$/i, "").trim();
      if (!title && typeof window !== "undefined" && ((_j = window.location) == null ? void 0 : _j.href)) {
        const m = window.location.href.match(/\/series\/([^/]+)(?:\/|$)/i);
        if (m && m[1]) {
          const slug = m[1].replace(/-[a-f0-9]{8,}$/i, "").replace(/-/g, " ");
          title = slug.replace(/\b\w/g, (c) => c.toUpperCase()) || "Titre Inconnu";
        }
      }
      if (!title) title = "Titre Inconnu";
      let chapter = "Inconnu";
      const urlMatch = window.location.href.match(/chapter[-_\/]?(\d+(?:\.\d+)?)/i);
      if (urlMatch) chapter = urlMatch[1];
      const cover = ((_k = this.document.querySelector(".thumb img")) == null ? void 0 : _k.src) || ((_l = this.document.querySelector('meta[property="og:image"]')) == null ? void 0 : _l.content) || "";
      return { title, chapter, cover };
    }
    async getPages() {
      const readerArea = this.document.querySelector("#readerarea");
      if (!readerArea) return [];
      const images = Array.from(readerArea.querySelectorAll("img"));
      const getSrc = (img) => img.src || img.dataset.src || img.getAttribute("data-src") || img.dataset.lazySrc || "";
      return images.filter((img) => {
        const src = getSrc(img);
        if (!src || !src.startsWith("http")) return false;
        const w = img.naturalWidth || 0;
        if (w > 0 && w < 200) return false;
        return true;
      }).map(getSrc).filter(Boolean);
    }
    getNextChapterUrl() {
      const nextBtn = this.document.querySelector(".ch-next-btn");
      return nextBtn ? nextBtn.href : null;
    }
  }
  class ReaperParser extends BaseParser {
    constructor(document2) {
      super(document2);
      this.name = "Reaper Scans";
    }
    static isCompatible(url) {
      return url.includes("reaperscans.com") || url.includes("reaper-scans");
    }
    async getMeta() {
      var _a, _b, _c, _d, _e;
      const title = ((_a = this.document.querySelector(".entry-title")) == null ? void 0 : _a.innerText) || ((_b = this.document.querySelector(".post-title")) == null ? void 0 : _b.innerText) || ((_c = this.document.querySelector('meta[property="og:title"]')) == null ? void 0 : _c.content) || "Titre Inconnu";
      let chapter = "Inconnu";
      const urlMatch = window.location.href.match(/chapter[-_](\d+(?:\.\d+)?)/i);
      if (urlMatch) {
        chapter = urlMatch[1];
      } else {
        const titleMatch = title.match(/chapter\s*(\d+)/i);
        if (titleMatch) chapter = titleMatch[1];
      }
      const cover = ((_d = this.document.querySelector(".series-thumb img")) == null ? void 0 : _d.src) || ((_e = this.document.querySelector('meta[property="og:image"]')) == null ? void 0 : _e.content) || "";
      return { title, chapter, cover };
    }
    async getPages() {
      const readerSelectors = [
        "#readerarea img",
        ".reading-content img",
        ".reader-area img",
        'div[class*="reader"] img'
      ];
      let images = [];
      for (const selector of readerSelectors) {
        const found = this.document.querySelectorAll(selector);
        if (found.length > 0) {
          images = Array.from(found);
          break;
        }
      }
      return images.filter((img) => {
        const src = img.src || "";
        if (src.includes("banner") || src.includes("ad")) return false;
        return img.naturalWidth > 300 && img.naturalHeight > 300;
      }).map((img) => img.src);
    }
    getNextChapterUrl() {
      const nextBtn = this.document.querySelector(".next-chapter") || this.document.querySelector('a[rel="next"]') || this.document.querySelector(".ch-next-btn") || Array.from(this.document.querySelectorAll("a")).find(
        (a) => a.innerText.toLowerCase().includes("next chapter")
      );
      return nextBtn ? nextBtn.href : null;
    }
    getPrevChapterUrl() {
      const prevBtn = this.document.querySelector(".prev-chapter") || this.document.querySelector('a[rel="prev"]') || Array.from(this.document.querySelectorAll("a")).find(
        (a) => a.innerText.toLowerCase().includes("previous chapter")
      );
      return prevBtn ? prevBtn.href : null;
    }
  }
  class WebtoonParser extends BaseParser {
    constructor(document2) {
      super(document2);
      this.name = "Webtoon";
    }
    static isCompatible(url) {
      return url.includes("webtoons.com");
    }
    async getMeta() {
      var _a, _b, _c, _d;
      const title = ((_a = this.document.querySelector(".subj_episode")) == null ? void 0 : _a.innerText) || ((_b = this.document.querySelector('meta[property="og:title"]')) == null ? void 0 : _b.content) || "Titre Inconnu";
      let chapter = "Inconnu";
      const urlMatch = window.location.href.match(/episode_no=(\d+)/i);
      if (urlMatch) {
        chapter = urlMatch[1];
      } else {
        const titleMatch = title.match(/#(\d+)/);
        if (titleMatch) chapter = titleMatch[1];
      }
      const cover = ((_c = this.document.querySelector(".detail_header img")) == null ? void 0 : _c.src) || ((_d = this.document.querySelector('meta[property="og:image"]')) == null ? void 0 : _d.content) || "";
      return { title, chapter, cover };
    }
    async getPages() {
      const viewer = this.document.querySelector("#_imageList");
      if (!viewer) return [];
      const images = Array.from(viewer.querySelectorAll("img"));
      return images.filter((img) => {
        return img.naturalWidth > 100 && img.naturalHeight > 100;
      }).map((img) => img.src || img.dataset.url);
    }
    getNextChapterUrl() {
      const nextBtn = this.document.querySelector(".pg_next") || this.document.querySelector("a.btn_next");
      return nextBtn ? nextBtn.href : null;
    }
    getPrevChapterUrl() {
      const prevBtn = this.document.querySelector(".pg_prev") || this.document.querySelector("a.btn_prev");
      return prevBtn ? prevBtn.href : null;
    }
  }
  class MangaDexParser extends BaseParser {
    constructor(document2) {
      super(document2);
      this.name = "MangaDex";
    }
    static isCompatible(url) {
      return url.includes("mangadex.org");
    }
    async getMeta() {
      var _a, _b, _c, _d;
      const title = ((_a = this.document.querySelector(".manga-title")) == null ? void 0 : _a.innerText) || ((_b = this.document.querySelector('meta[property="og:title"]')) == null ? void 0 : _b.content) || "Titre Inconnu";
      let chapter = "Inconnu";
      const urlMatch = window.location.href.match(/chapter\/([a-f0-9-]+)/i);
      if (urlMatch) {
        const chapterNum = (_c = this.document.querySelector(".chapter-number")) == null ? void 0 : _c.innerText;
        if (chapterNum) chapter = chapterNum;
      }
      const cover = ((_d = this.document.querySelector('meta[property="og:image"]')) == null ? void 0 : _d.content) || "";
      return { title, chapter, cover };
    }
    async getPages() {
      const reader = this.document.querySelector(".reader-images") || this.document.querySelector("#reader");
      if (!reader) {
        console.warn("[MangaDex] Reader non trouvé, tentative générique...");
        return [];
      }
      const images = Array.from(reader.querySelectorAll("img"));
      return images.filter((img) => img.naturalWidth > 200).map((img) => img.src);
    }
    getNextChapterUrl() {
      const nextBtn = this.document.querySelector('a[title="Next chapter"]') || this.document.querySelector(".next-chapter");
      return nextBtn ? nextBtn.href : null;
    }
    getPrevChapterUrl() {
      const prevBtn = this.document.querySelector('a[title="Previous chapter"]') || this.document.querySelector(".prev-chapter");
      return prevBtn ? prevBtn.href : null;
    }
  }
  class MangaScantradParser extends BaseParser {
    constructor(document2) {
      super(document2);
      this.name = "Manga-Scantrad";
    }
    static isCompatible(url) {
      return url.includes("manga-scantrad.io");
    }
    async getMeta() {
      var _a, _b, _c, _d;
      const title = ((_a = this.document.querySelector('meta[property="og:title"]')) == null ? void 0 : _a.content) || ((_b = this.document.querySelector("h1")) == null ? void 0 : _b.innerText) || this.document.title;
      const cleanTitle = title.replace(/\s*[-|]\s*Chapitre\s*\d+.*$/i, "").trim();
      let chapter = "Inconnu";
      const urlMatch = window.location.href.match(/(?:chapitre[-_]?|ch[-_\/])(\d+(?:\.\d+)?)/i);
      if (urlMatch) chapter = urlMatch[1];
      const cover = ((_c = this.document.querySelector('meta[property="og:image"]')) == null ? void 0 : _c.content) || ((_d = this.document.querySelector('.manga-cover img, .cover img, [class*="cover"] img')) == null ? void 0 : _d.src) || "";
      return { title: cleanTitle || title, chapter, cover };
    }
    async getPages() {
      const container = this.document.querySelector('#readerarea, .chapter-content, .reader-content, [class*="reader"]') || this.document.body;
      const images = Array.from(container.querySelectorAll("img"));
      const candidates = images.filter((img) => {
        const w = img.naturalWidth || parseInt(img.getAttribute("width"), 10) || 0;
        const h = img.naturalHeight || parseInt(img.getAttribute("height"), 10) || 0;
        if (w > 300 && h > 400) return true;
        const rect = img.getBoundingClientRect();
        const src = img.src || img.dataset.src || img.dataset.url || img.getAttribute("data-src");
        return rect.width > 300 && rect.height > 400 && src;
      });
      return candidates.map((img) => img.src || img.dataset.src || img.dataset.url || img.getAttribute("data-src") || "").filter(Boolean);
    }
    getNextChapterUrl() {
      const next = this.document.querySelector('a[rel="next"], .nav-next a, .ch-next a, [class*="next"] a');
      return next ? next.href : null;
    }
    getPrevChapterUrl() {
      const prev = this.document.querySelector('a[rel="prev"], .nav-prev a, .ch-prev a, [class*="prev"] a');
      return prev ? prev.href : null;
    }
  }
  class CustomParser extends BaseParser {
    constructor(document2, config) {
      super(document2);
      this.config = config;
      this.name = config.name;
    }
    /**
     * Vérifie si une config custom correspond à l'URL
     */
    static async getConfigForUrl(url) {
      try {
        const { customSites } = await chrome.storage.local.get("customSites");
        if (!customSites || customSites.length === 0) return null;
        const config = customSites.find((site) => {
          if (site.urlPattern) {
            const regex = new RegExp(site.urlPattern, "i");
            return regex.test(url);
          }
          return url.includes(site.domain);
        });
        return config || null;
      } catch (error) {
        console.error("[CustomParser] Erreur chargement config:", error);
        return null;
      }
    }
    static isCompatible(url) {
      return false;
    }
    async getMeta() {
      var _a, _b, _c, _d;
      try {
        let title = "Titre Inconnu";
        const titleSelectors = ((_a = this.config.titleSelector) == null ? void 0 : _a.split(",").map((s) => s.trim())) || [];
        for (const selector of titleSelectors) {
          const element = this.document.querySelector(selector);
          if (element == null ? void 0 : element.innerText) {
            title = element.innerText.trim();
            break;
          }
        }
        if (title === "Titre Inconnu") {
          title = ((_b = this.document.querySelector('meta[property="og:title"]')) == null ? void 0 : _b.content) || this.document.title;
        }
        let chapter = "Inconnu";
        if (this.config.chapterPattern) {
          try {
            const regex = new RegExp(this.config.chapterPattern, "i");
            const match = window.location.href.match(regex);
            if (match && match[1]) {
              chapter = match[1];
            }
          } catch (e) {
            console.warn("[CustomParser] Pattern chapitre invalide:", e);
          }
        }
        const cover = this.config.coverSelector ? ((_c = this.document.querySelector(this.config.coverSelector)) == null ? void 0 : _c.src) || "" : ((_d = this.document.querySelector('meta[property="og:image"]')) == null ? void 0 : _d.content) || "";
        return { title, chapter, cover };
      } catch (error) {
        console.error("[CustomParser] Erreur getMeta:", error);
        return { title: "Erreur", chapter: "Inconnu", cover: "" };
      }
    }
    async getPages() {
      try {
        if (!this.config.containerSelector || !this.config.imageSelector) {
          console.warn("[CustomParser] Sélecteurs manquants");
          return [];
        }
        const container = this.document.querySelector(this.config.containerSelector);
        if (!container) {
          console.warn("[CustomParser] Conteneur non trouvé:", this.config.containerSelector);
          return [];
        }
        const images = Array.from(container.querySelectorAll(this.config.imageSelector));
        const minWidth = this.config.minImageWidth || 300;
        const minHeight = this.config.minImageHeight || 300;
        return images.filter((img) => {
          if (img.naturalWidth < minWidth || img.naturalHeight < minHeight) return false;
          if (this.config.excludePatterns) {
            const patterns = this.config.excludePatterns.split(",").map((p) => p.trim());
            for (const pattern of patterns) {
              if (img.src.toLowerCase().includes(pattern.toLowerCase())) return false;
            }
          }
          return true;
        }).map((img) => {
          return img.src || img.dataset.src || img.dataset.url || img.dataset.original;
        }).filter((src) => src && src.length > 0);
      } catch (error) {
        console.error("[CustomParser] Erreur getPages:", error);
        return [];
      }
    }
    getNextChapterUrl() {
      if (!this.config.nextButtonSelector) return null;
      const nextBtn = this.document.querySelector(this.config.nextButtonSelector);
      return nextBtn ? nextBtn.href : null;
    }
    getPrevChapterUrl() {
      if (!this.config.prevButtonSelector) return null;
      const prevBtn = this.document.querySelector(this.config.prevButtonSelector);
      return prevBtn ? prevBtn.href : null;
    }
  }
  class ParserFactory {
    /**
     * Retourne l'instance de parser la plus adaptée pour l'URL actuelle.
     * @param {string} url 
     * @param {Document} document 
     * @returns {import('./BaseParser').default}
     */
    static async getParser(url, document2) {
      const customConfig = await CustomParser.getConfigForUrl(url);
      if (customConfig) {
        console.log(`[MangaCentral] Parser personnalisé détecté : ${customConfig.name}`);
        return new CustomParser(document2, customConfig);
      }
      const parsers = [
        AsuraParser,
        // AsuraScans
        ReaperParser,
        // Reaper Scans
        MangaScantradParser,
        // Manga-Scantrad (VF)
        WebtoonParser,
        // Webtoon officiel
        MangaDexParser
        // MangaDex
      ];
      for (const ParserClass of parsers) {
        if (ParserClass.isCompatible(url)) {
          console.log(`[MangaCentral] Parser spécifique détecté : ${ParserClass.name}`);
          return new ParserClass(document2);
        }
      }
      console.log(`[MangaCentral] Aucun parser spécifique. Utilisation du GenericParser.`);
      return new GenericParser(document2);
    }
  }
  class AutoScroller {
    constructor() {
      this.active = false;
      this.speed = 1;
      this.animationFrame = null;
      this.lastTime = 0;
      this.accumulatedScroll = 0;
    }
    /**
     * Démarre ou arrête le défilement
     */
    toggle() {
      if (this.active) {
        this.stop();
      } else {
        this.start();
      }
      return this.active;
    }
    start() {
      if (this.active) return;
      this.active = true;
      this.lastTime = performance.now();
      this.loop();
    }
    stop() {
      this.active = false;
      if (this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }
    }
    setSpeed(newSpeed) {
      this.speed = Math.max(1, Math.min(20, newSpeed));
    }
    loop(currentTime = performance.now()) {
      if (!this.active) return;
      const deltaTime = currentTime - this.lastTime;
      this.lastTime = currentTime;
      const pixelsPerSecond = 30 * this.speed;
      const pixelsToScroll = pixelsPerSecond * deltaTime / 1e3;
      this.accumulatedScroll += pixelsToScroll;
      if (this.accumulatedScroll >= 1) {
        const pixels = Math.floor(this.accumulatedScroll);
        window.scrollBy(0, pixels);
        this.accumulatedScroll -= pixels;
      }
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight) {
        this.stop();
      } else {
        this.animationFrame = requestAnimationFrame((t) => this.loop(t));
      }
    }
  }
  class UIManager {
    constructor(parser, autoScroller) {
      this.parser = parser;
      this.autoScroller = autoScroller;
      this.shadowRoot = null;
      this.cropActive = false;
      this.selectionStart = null;
      this._dragState = null;
      this._resizeState = null;
      this._dockDragState = null;
      this._dockState = { enabled: true, side: "right", collapsed: false, top: null, freePos: null };
      this.lang = "fr";
    }
    setLang(lang) {
      const l = String(lang || "").toLowerCase();
      this.lang = l === "en" ? "en" : "fr";
    }
    applyLang() {
      var _a, _b;
      if (!this.shadowRoot) return;
      const cropHint = this.shadowRoot.querySelector(".mc-crop-hint");
      if (cropHint) cropHint.textContent = this.t("crop_hint");
      const dockHandle = this.shadowRoot.getElementById("mc-dock-handle");
      if (dockHandle) dockHandle.setAttribute("title", this.t("dock_handle"));
      const btnTop = this.shadowRoot.getElementById("btn-top");
      if (btnTop) {
        btnTop.setAttribute("title", this.t("top_title"));
        const icon = ((_a = btnTop.querySelector(".mc-btn-icon")) == null ? void 0 : _a.outerHTML) || "";
        btnTop.innerHTML = `${icon}${this.t("top")}`;
      }
      const btnBottom = this.shadowRoot.getElementById("btn-bottom");
      if (btnBottom) {
        btnBottom.setAttribute("title", this.t("bottom_title"));
        const icon = ((_b = btnBottom.querySelector(".mc-btn-icon")) == null ? void 0 : _b.outerHTML) || "";
        btnBottom.innerHTML = `${icon}${this.t("bottom")}`;
      }
      const btnScroll = this.shadowRoot.getElementById("btn-scroll");
      if (btnScroll) btnScroll.setAttribute("title", this.t("scroll_title"));
      const btnOcr = this.shadowRoot.getElementById("btn-ocr");
      if (btnOcr) btnOcr.setAttribute("title", this.t("ocr_title"));
      const btnPrevChapter = this.shadowRoot.getElementById("btn-prev-chapter");
      if (btnPrevChapter) {
        btnPrevChapter.textContent = this.t("prev_chapter");
        btnPrevChapter.setAttribute("title", this.t("prev_chapter_title"));
      }
      const btnNextChapter = this.shadowRoot.getElementById("btn-next-chapter");
      if (btnNextChapter) {
        btnNextChapter.textContent = this.t("next_chapter");
        btnNextChapter.setAttribute("title", this.t("next_chapter_title"));
      }
      const chapterInput = this.shadowRoot.getElementById("input-chapter-target");
      if (chapterInput) chapterInput.setAttribute("placeholder", this.t("chapter_input_placeholder"));
      const btnGoChapter = this.shadowRoot.getElementById("btn-go-chapter");
      if (btnGoChapter) {
        btnGoChapter.textContent = this.t("go_chapter");
        btnGoChapter.setAttribute("title", this.t("go_chapter_title"));
      }
      const chapterNavTitle = this.shadowRoot.querySelector(".mc-chapter-nav-title");
      if (chapterNavTitle) chapterNavTitle.textContent = this.t("chapter_nav_title");
      const btnToggleChapterNav = this.shadowRoot.getElementById("btn-toggle-chapter-nav");
      if (btnToggleChapterNav) {
        btnToggleChapterNav.textContent = this.t("chapter_toggle");
        btnToggleChapterNav.setAttribute("title", this.t("chapter_toggle_title"));
      }
      const uiLabel = this.shadowRoot.querySelector("#ui-tweaks .mc-ui-label");
      if (uiLabel) uiLabel.textContent = this.t("btn_size");
      const rangeBtnScale = this.shadowRoot.getElementById("range-btnscale");
      if (rangeBtnScale) rangeBtnScale.setAttribute("title", this.t("btn_size_title"));
      const transTitle = this.shadowRoot.querySelector("#translation-popup .mc-translation-header span");
      if (transTitle) transTitle.textContent = this.t("translation");
    }
    t(key, vars = {}) {
      const dict = {
        fr: {
          crop_hint: "Sélectionnez une zone à traduire (Echap pour annuler)",
          dock_handle: "Faire glisser pour déplacer / Cliquer pour cacher",
          top: "Haut",
          bottom: "Bas",
          top_title: "Haut de page",
          bottom_title: "Bas de page",
          scroll_title: "Auto-Scroll",
          ocr_title: "Scanner & Traduire",
          chapter_nav_title: "Navigation chapitre",
          prev_chapter: "Chap -",
          next_chapter: "Chap +",
          prev_chapter_title: "Aller au chapitre précédent",
          next_chapter_title: "Aller au chapitre suivant",
          chapter_input_placeholder: "Chapitre…",
          go_chapter: "Aller",
          go_chapter_title: "Aller au chapitre saisi",
          chapter_invalid: "Numéro de chapitre invalide.",
          chapter_not_found: "Ce chapitre n'existe pas sur ce site.",
          chapter_toggle: "Chap",
          chapter_toggle_title: "Afficher/masquer navigation chapitre",
          btn_size: "Taille boutons",
          btn_size_title: "Taille des boutons",
          translation: "Traduction"
        },
        en: {
          crop_hint: "Select an area to translate (Esc to cancel)",
          dock_handle: "Drag to move / Click to hide",
          top: "Top",
          bottom: "Bottom",
          top_title: "Top of page",
          bottom_title: "Bottom of page",
          scroll_title: "Auto-scroll",
          ocr_title: "Scan & translate",
          chapter_nav_title: "Chapter navigation",
          prev_chapter: "Chap -",
          next_chapter: "Chap +",
          prev_chapter_title: "Go to previous chapter",
          next_chapter_title: "Go to next chapter",
          chapter_input_placeholder: "Chapter...",
          go_chapter: "Go",
          go_chapter_title: "Go to entered chapter",
          chapter_invalid: "Invalid chapter number.",
          chapter_not_found: "This chapter does not exist on this site.",
          chapter_toggle: "Chap",
          chapter_toggle_title: "Show/hide chapter navigation",
          btn_size: "Button size",
          btn_size_title: "Button size",
          translation: "Translation"
        }
      };
      const table = dict[this.lang] || dict.fr;
      let out = table[key] || dict.fr[key] || key;
      for (const [k, v] of Object.entries(vars || {})) out = out.replaceAll(`{${k}}`, String(v));
      return out;
    }
    init(meta) {
      this.currentMeta = meta || null;
      const host = document.createElement("div");
      host.id = "manga-central-overlay-host";
      host.style.position = "fixed";
      host.style.zIndex = "2147483647";
      host.style.top = "0";
      host.style.left = "0";
      host.style.width = "0";
      host.style.height = "0";
      document.body.appendChild(host);
      this.shadowRoot = host.attachShadow({ mode: "open" });
      const styleLink = document.createElement("link");
      styleLink.rel = "stylesheet";
      styleLink.href = chrome.runtime.getURL("assets/styles/overlay.css");
      this.shadowRoot.appendChild(styleLink);
      const container = document.createElement("div");
      container.className = "mc-container";
      container.innerHTML = `
        <div id="crop-layer" class="mc-crop-layer" style="display:none;">
          <div id="crop-selection" class="mc-crop-selection"></div>
          <div class="mc-crop-hint">${this.t("crop_hint")}</div>
        </div>
        <div class="mc-floating-panel mc-docked" data-dock-side="right">
          <div id="mc-dock-handle" class="mc-dock-handle" title="${this.t("dock_handle")}"></div>
          <div class="mc-panel-header">
            <span class="mc-icon">📚</span>
            <div class="mc-info">
              <span class="mc-title" title="${meta.title}">${meta.title}</span>
              <span class="mc-chapter">Ch. ${meta.chapter}</span>
            </div>
          </div>
          <div id="mc-resize-right" class="mc-resize-right" title="Largeur"></div>
          <div id="mc-resize-bottom" class="mc-resize-bottom" title="Hauteur"></div>
          <div id="mc-resize-corner" class="mc-resize-corner" title="Redimensionner (proportionnel)"></div>
          <div class="mc-controls-wrap">
            <div class="mc-controls">
              <button type="button" id="btn-top" class="mc-btn" title="${this.t("top_title")}"><span class="mc-btn-icon">⬆</span>${this.t("top")}</button>
              <button type="button" id="btn-scroll" class="mc-btn" title="${this.t("scroll_title")}"><span class="mc-btn-icon">📜</span>Scroll</button>
              <button type="button" id="btn-ocr" class="mc-btn" title="${this.t("ocr_title")}"><span class="mc-btn-icon">🔍</span>OCR</button>
              <button type="button" id="btn-toggle-chapter-nav" class="mc-btn" title="${this.t("chapter_toggle_title")}"><span class="mc-btn-icon">📘</span>${this.t("chapter_toggle")}</button>
              <button type="button" id="btn-bottom" class="mc-btn" title="${this.t("bottom_title")}"><span class="mc-btn-icon">⬇</span>${this.t("bottom")}</button>
            </div>
          </div>
          <div class="mc-chapter-nav" id="mc-chapter-nav" hidden>
            <div class="mc-chapter-nav-title">${this.t("chapter_nav_title")}</div>
            <div class="mc-chapter-nav-grid">
              <button type="button" id="btn-prev-chapter" class="mc-chip-btn" title="${this.t("prev_chapter_title")}">${this.t("prev_chapter")}</button>
              <button type="button" id="btn-next-chapter" class="mc-chip-btn" title="${this.t("next_chapter_title")}">${this.t("next_chapter")}</button>
            </div>
            <div class="mc-chapter-jump-row">
              <input type="number" step="any" min="0" id="input-chapter-target" class="mc-chapter-input" placeholder="${this.t("chapter_input_placeholder")}">
              <button type="button" id="btn-go-chapter" class="mc-chip-btn mc-chip-btn-primary" title="${this.t("go_chapter_title")}">${this.t("go_chapter")}</button>
            </div>
          </div>
          <div class="mc-speed-control" id="speed-control" style="display:none;">
            <input type="range" min="1" max="10" value="2" id="range-speed">
          </div>
          <div class="mc-ui-tweaks" id="ui-tweaks">
            <div class="mc-ui-row">
              <span class="mc-ui-label">${this.t("btn_size")}</span>
              <input type="range" min="80" max="140" value="100" id="range-btnscale" title="${this.t("btn_size_title")}">
            </div>
          </div>
        </div>
        <div id="translation-popup" class="mc-translation-popup" style="display:none;">
          <div class="mc-translation-header"><span>${this.t("translation")}</span><button id="close-trans">×</button></div>
          <div id="translation-content" class="mc-translation-content">...</div>
        </div>
      `;
      this.shadowRoot.appendChild(container);
      this._attachListeners(meta);
      this._setupDockedPanel();
      this._setupDraggablePanel();
      this._setupResizablePanel();
      this._setupUiTweaks();
      this.applyLang();
    }
    /**
     * Met à jour l’affichage (titre / chapitre) et optionnellement le parser (pour DL, etc.)
     * Appelé quand l’utilisateur navigue vers un autre chapitre sans recharger la page.
     */
    updateMeta(meta, parser = null) {
      if (parser) this.parser = parser;
      this.currentMeta = meta || this.currentMeta;
      if (!this.shadowRoot) return;
      const titleEl = this.shadowRoot.querySelector(".mc-title");
      const chapterEl = this.shadowRoot.querySelector(".mc-chapter");
      if (titleEl) {
        titleEl.textContent = meta.title || "";
        titleEl.setAttribute("title", meta.title || "");
      }
      if (chapterEl) chapterEl.textContent = "Ch. " + (meta.chapter || "?");
    }
    _attachListeners(meta) {
      this.shadowRoot.getElementById("btn-top").addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      this.shadowRoot.getElementById("btn-bottom").addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      });
      const btnScroll = this.shadowRoot.getElementById("btn-scroll");
      const speedControl = this.shadowRoot.getElementById("speed-control");
      const rangeSpeed = this.shadowRoot.getElementById("range-speed");
      btnScroll.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isActive = this.autoScroller.toggle();
        btnScroll.classList.toggle("active", isActive);
        speedControl.style.display = isActive ? "block" : "none";
      });
      rangeSpeed.addEventListener("input", (e) => {
        this.autoScroller.setSpeed(parseInt(e.target.value));
      });
      const btnPrevChapter = this.shadowRoot.getElementById("btn-prev-chapter");
      const btnNextChapter = this.shadowRoot.getElementById("btn-next-chapter");
      const btnGoChapter = this.shadowRoot.getElementById("btn-go-chapter");
      const chapterInput = this.shadowRoot.getElementById("input-chapter-target");
      const chapterNav = this.shadowRoot.getElementById("mc-chapter-nav");
      const btnToggleChapterNav = this.shadowRoot.getElementById("btn-toggle-chapter-nav");
      const panel = this.shadowRoot.querySelector(".mc-floating-panel");
      if (chapterInput) {
        const currentChapter = this._getCurrentChapterNumber();
        if (Number.isFinite(currentChapter)) chapterInput.value = String(currentChapter);
      }
      const applyChapterNavVisibility = (visible) => {
        if (!chapterNav || !btnToggleChapterNav) return;
        chapterNav.hidden = !visible;
        btnToggleChapterNav.classList.toggle("active", !!visible);
        if (panel) panel.style.height = "";
      };
      (async () => {
        try {
          const { overlayChapterNavVisible } = await chrome.storage.local.get("overlayChapterNavVisible");
          applyChapterNavVisibility(overlayChapterNavVisible === true);
        } catch (_) {
          applyChapterNavVisibility(false);
        }
      })();
      btnToggleChapterNav == null ? void 0 : btnToggleChapterNav.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const nextVisible = !!(chapterNav == null ? void 0 : chapterNav.hidden);
        applyChapterNavVisibility(nextVisible);
        try {
          await chrome.storage.local.set({ overlayChapterNavVisible: nextVisible });
        } catch (_) {
        }
      });
      btnPrevChapter == null ? void 0 : btnPrevChapter.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this._navigateChapterByOffset(-1);
      });
      btnNextChapter == null ? void 0 : btnNextChapter.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this._navigateChapterByOffset(1);
      });
      const goToTypedChapter = async () => {
        const raw = String((chapterInput == null ? void 0 : chapterInput.value) || "").trim().replace(",", ".");
        const targetChapter = Number(raw);
        if (!Number.isFinite(targetChapter) || targetChapter < 0) {
          this.showTranslation(this.t("chapter_invalid"));
          return;
        }
        const targetUrl = this._buildChapterUrl(targetChapter);
        if (!targetUrl) {
          this.showTranslation(this.t("chapter_not_found"));
          return;
        }
        const exists = await this._canNavigateToChapter(targetUrl);
        if (!exists) {
          this.showTranslation(this.t("chapter_not_found"));
          return;
        }
        window.location.href = targetUrl;
      };
      btnGoChapter == null ? void 0 : btnGoChapter.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await goToTypedChapter();
      });
      chapterInput == null ? void 0 : chapterInput.addEventListener("keydown", async (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        e.stopPropagation();
        await goToTypedChapter();
      });
      this.shadowRoot.getElementById("btn-ocr").addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.startCropMode();
      });
      const cropLayer = this.shadowRoot.getElementById("crop-layer");
      cropLayer.addEventListener("mousedown", (e) => this._onCropStart(e));
      cropLayer.addEventListener("mousemove", (e) => this._onCropMove(e));
      cropLayer.addEventListener("mouseup", (e) => this._onCropEnd(e));
      this.shadowRoot.getElementById("close-trans").addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.shadowRoot.getElementById("translation-popup").style.display = "none";
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.cropActive) this.stopCropMode();
      });
    }
    async _setupUiTweaks() {
      if (!this.shadowRoot) return;
      const panel = this.shadowRoot.querySelector(".mc-floating-panel");
      const range = this.shadowRoot.getElementById("range-btnscale");
      if (!panel || !range) return;
      const { settings = {} } = await chrome.storage.local.get("settings");
      const saved = Number(settings.uiButtonScale);
      const percent = Number.isFinite(saved) ? Math.max(80, Math.min(140, saved)) : 100;
      range.value = String(percent);
      panel.style.setProperty("--mc-btn-scale", String(percent / 100));
      range.addEventListener("input", async (e) => {
        const v = parseInt(e.target.value, 10);
        const pct = Number.isFinite(v) ? Math.max(80, Math.min(140, v)) : 100;
        panel.style.setProperty("--mc-btn-scale", String(pct / 100));
        const { settings: cur = {} } = await chrome.storage.local.get("settings");
        await chrome.storage.local.set({ settings: { ...cur, uiButtonScale: pct } });
      });
    }
    async _setupDraggablePanel() {
      if (!this.shadowRoot) return;
      const panel = this.shadowRoot.querySelector(".mc-floating-panel");
      const header = this.shadowRoot.querySelector(".mc-panel-header");
      if (!panel || !header) return;
      header.style.cursor = "move";
      header.style.userSelect = "none";
      header.style.touchAction = "none";
      const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
      const getPanelSize = () => {
        const r = panel.getBoundingClientRect();
        return { w: r.width || 280, h: r.height || 200 };
      };
      const applyPosition = (x, y) => {
        const { w, h } = getPanelSize();
        const maxX = Math.max(0, window.innerWidth - w);
        const maxY = Math.max(0, window.innerHeight - h);
        const cx = clamp(x, 0, maxX);
        const cy = clamp(y, 0, maxY);
        panel.style.left = cx + "px";
        panel.style.top = cy + "px";
        panel.style.right = "auto";
        panel.style.bottom = "auto";
        return { x: cx, y: cy };
      };
      const setDocked = async (enabled, side = "right") => {
        this._dockState.enabled = !!enabled;
        if (!this._dockState.enabled) {
          panel.classList.remove("mc-docked");
          panel.classList.remove("mc-collapsed");
          panel.dataset.dockSide = "";
          panel.style.transform = "";
          panel.style.bottom = "auto";
          panel.style.right = "auto";
          panel.style.left = this._dockState.freePos && typeof this._dockState.freePos.x === "number" ? this._dockState.freePos.x + "px" : panel.style.left;
          panel.style.top = this._dockState.freePos && typeof this._dockState.freePos.y === "number" ? this._dockState.freePos.y + "px" : panel.style.top;
          try {
            await chrome.storage.local.set({ overlayDockState: this._dockState });
          } catch (_) {
          }
          return;
        }
        this._dockState.side = side === "left" || side === "bottom" ? side : "right";
        panel.classList.add("mc-docked");
        panel.dataset.dockSide = this._dockState.side;
        panel.classList.toggle("mc-collapsed", !!this._dockState.collapsed);
        panel.style.right = this._dockState.side === "right" ? "0" : "auto";
        panel.style.left = this._dockState.side === "left" ? "0" : this._dockState.side === "bottom" ? "20px" : "auto";
        panel.style.bottom = this._dockState.side === "bottom" ? "0" : "auto";
        if (this._dockState.side === "bottom") {
          panel.style.top = "auto";
        } else {
          panel.style.top = typeof this._dockState.top === "number" ? this._dockState.top + "px" : panel.style.top;
        }
        try {
          await chrome.storage.local.set({ overlayDockState: this._dockState });
        } catch (_) {
        }
      };
      const snapDockIfNearEdges = async () => {
        if (this._dockState.enabled) return;
        const rect = panel.getBoundingClientRect();
        const SNAP = 26;
        const nearLeft = rect.left <= SNAP;
        const nearRight = window.innerWidth - rect.right <= SNAP;
        const nearBottom = window.innerHeight - rect.bottom <= SNAP;
        if (!nearLeft && !nearRight && !nearBottom) return;
        let side = "right";
        if (nearBottom) side = "bottom";
        else if (nearLeft) side = "left";
        else if (nearRight) side = "right";
        if (side === "bottom") {
          this._dockState.top = null;
        } else {
          this._dockState.top = clamp(rect.top, 10, Math.max(10, window.innerHeight - rect.height - 10));
        }
        await setDocked(true, side);
      };
      const cycleDockMode = async () => {
        if (!this._dockState.enabled) {
          await setDocked(true, "right");
          return;
        }
        if (this._dockState.side === "right") {
          await setDocked(true, "left");
        } else if (this._dockState.side === "left") {
          await setDocked(true, "bottom");
        } else {
          this._dockState.freePos = (() => {
            const rect = panel.getBoundingClientRect();
            return {
              x: clamp(rect.left, 0, Math.max(0, window.innerWidth - rect.width)),
              y: clamp(rect.top, 0, Math.max(0, window.innerHeight - rect.height))
            };
          })();
          await setDocked(false);
        }
      };
      const loadPos = async () => {
        try {
          const { overlayPanelPos } = await chrome.storage.local.get("overlayPanelPos");
          if (overlayPanelPos && typeof overlayPanelPos.x === "number" && typeof overlayPanelPos.y === "number") {
            return overlayPanelPos;
          }
        } catch (_) {
        }
        return null;
      };
      const savePos = async (pos) => {
        try {
          await chrome.storage.local.set({ overlayPanelPos: { x: pos.x, y: pos.y } });
        } catch (_) {
        }
      };
      const init = async () => {
        const savedDock = await (async () => {
          try {
            const { overlayDockState } = await chrome.storage.local.get("overlayDockState");
            if (overlayDockState && typeof overlayDockState === "object") return overlayDockState;
          } catch (_) {
          }
          return null;
        })();
        if (savedDock) {
          this._dockState.enabled = savedDock.enabled !== false;
          this._dockState.side = savedDock.side === "left" || savedDock.side === "bottom" ? savedDock.side : "right";
          this._dockState.collapsed = !!savedDock.collapsed;
          this._dockState.top = typeof savedDock.top === "number" ? savedDock.top : null;
          this._dockState.freePos = savedDock.freePos && typeof savedDock.freePos.x === "number" && typeof savedDock.freePos.y === "number" ? savedDock.freePos : null;
        }
        if (this._dockState.enabled) {
          panel.classList.add("mc-docked");
          panel.dataset.dockSide = this._dockState.side;
          panel.classList.toggle("mc-collapsed", !!this._dockState.collapsed);
          panel.style.right = this._dockState.side === "right" ? "0" : "auto";
          panel.style.left = this._dockState.side === "left" ? "0" : this._dockState.side === "bottom" ? "20px" : "auto";
          panel.style.bottom = this._dockState.side === "bottom" ? "0" : "auto";
          if (this._dockState.side === "bottom") {
            panel.style.top = "auto";
          } else {
            const rect = panel.getBoundingClientRect();
            const h = rect.height || 240;
            const minTop = 10;
            const maxTop = Math.max(10, window.innerHeight - h - 10);
            const top = typeof this._dockState.top === "number" ? this._dockState.top : clamp(120, minTop, maxTop);
            const cTop = clamp(top, minTop, maxTop);
            panel.style.top = cTop + "px";
            this._dockState.top = cTop;
          }
          try {
            await chrome.storage.local.set({ overlayDockState: this._dockState });
          } catch (_) {
          }
        } else {
          panel.classList.remove("mc-docked");
          panel.classList.remove("mc-collapsed");
          panel.dataset.dockSide = "";
          const saved = this._dockState.freePos || await loadPos();
          const { w, h } = getPanelSize();
          const defaultX = Math.max(0, window.innerWidth - w - 20);
          const defaultY = Math.max(0, window.innerHeight - h - 20);
          const pos = applyPosition(saved ? saved.x : defaultX, saved ? saved.y : defaultY);
          this._dockState.freePos = { x: pos.x, y: pos.y };
          try {
            await chrome.storage.local.set({ overlayDockState: this._dockState });
          } catch (_) {
          }
        }
      };
      const scheduleInit = () => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            init();
          });
        });
      };
      scheduleInit();
      const onResize = async () => {
        if (!panel.style.left || !panel.style.top) return;
        const x = parseFloat(panel.style.left) || 0;
        const y = parseFloat(panel.style.top) || 0;
        const pos = applyPosition(x, y);
        await savePos(pos);
      };
      window.addEventListener("resize", onResize);
      header.addEventListener("dblclick", (e) => {
        if (this.cropActive) return;
        e.preventDefault();
        e.stopPropagation();
        cycleDockMode();
      });
      header.addEventListener("pointerdown", (e) => {
        if (e.button != null && e.button !== 0) return;
        if (this.cropActive) return;
        if (this._dockState.enabled) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = panel.getBoundingClientRect();
        this._dragState = {
          startClientX: e.clientX,
          startClientY: e.clientY,
          startLeft: rect.left,
          startTop: rect.top,
          pointerId: e.pointerId,
          moved: false
        };
        try {
          header.setPointerCapture(e.pointerId);
        } catch (_) {
        }
      });
      header.addEventListener("pointermove", (e) => {
        if (!this._dragState || this._dragState.pointerId !== e.pointerId) return;
        e.preventDefault();
        e.stopPropagation();
        const dx = e.clientX - this._dragState.startClientX;
        const dy = e.clientY - this._dragState.startClientY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this._dragState.moved = true;
        applyPosition(this._dragState.startLeft + dx, this._dragState.startTop + dy);
      });
      const endDrag = async (e) => {
        if (!this._dragState || this._dragState.pointerId !== e.pointerId) return;
        e.preventDefault();
        e.stopPropagation();
        try {
          header.releasePointerCapture(e.pointerId);
        } catch (_) {
        }
        const x = parseFloat(panel.style.left) || 0;
        const y = parseFloat(panel.style.top) || 0;
        const pos = applyPosition(x, y);
        await savePos(pos);
        this._dockState.freePos = { x: pos.x, y: pos.y };
        try {
          await chrome.storage.local.set({ overlayDockState: this._dockState });
        } catch (_) {
        }
        this._dragState = null;
        await snapDockIfNearEdges();
      };
      header.addEventListener("pointerup", endDrag);
      header.addEventListener("pointercancel", endDrag);
    }
    async _setupDockedPanel() {
      if (!this.shadowRoot) return;
      const panel = this.shadowRoot.querySelector(".mc-floating-panel");
      const handle = this.shadowRoot.getElementById("mc-dock-handle");
      if (!panel || !handle) return;
      const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
      const loadDock = async () => {
        try {
          const { overlayDockState } = await chrome.storage.local.get("overlayDockState");
          if (overlayDockState && typeof overlayDockState === "object") return overlayDockState;
        } catch (_) {
        }
        return null;
      };
      const saveDock = async () => {
        try {
          await chrome.storage.local.set({ overlayDockState: this._dockState });
        } catch (_) {
        }
      };
      const applyDockState = () => {
        panel.classList.toggle("mc-docked", !!this._dockState.enabled);
        panel.classList.toggle("mc-collapsed", !!this._dockState.collapsed);
        if (!this._dockState.enabled) {
          panel.dataset.dockSide = "";
          panel.style.transform = "";
          panel.style.right = "auto";
          panel.style.bottom = "auto";
          if (this._dockState.freePos && typeof this._dockState.freePos.x === "number" && typeof this._dockState.freePos.y === "number") {
            panel.style.left = this._dockState.freePos.x + "px";
            panel.style.top = this._dockState.freePos.y + "px";
          }
          return;
        }
        panel.dataset.dockSide = this._dockState.side === "left" || this._dockState.side === "bottom" ? this._dockState.side : "right";
        panel.style.right = this._dockState.side === "right" ? "0" : "auto";
        panel.style.left = this._dockState.side === "left" ? "0" : this._dockState.side === "bottom" ? "20px" : "auto";
        panel.style.bottom = this._dockState.side === "bottom" ? "0" : "auto";
        if (this._dockState.side === "bottom") {
          panel.style.top = "auto";
          this._dockState.top = null;
          return;
        }
        const rect = panel.getBoundingClientRect();
        const h = rect.height || 240;
        const minTop = 10;
        const maxTop = Math.max(10, window.innerHeight - h - 10);
        const top = typeof this._dockState.top === "number" ? this._dockState.top : clamp(120, minTop, maxTop);
        const cTop = clamp(top, minTop, maxTop);
        panel.style.top = cTop + "px";
        this._dockState.top = cTop;
      };
      const saved = await loadDock();
      if (saved) {
        this._dockState.enabled = saved.enabled !== false;
        this._dockState.side = saved.side === "left" || saved.side === "bottom" ? saved.side : "right";
        this._dockState.collapsed = !!saved.collapsed;
        this._dockState.top = typeof saved.top === "number" ? saved.top : null;
        this._dockState.freePos = saved.freePos && typeof saved.freePos.x === "number" && typeof saved.freePos.y === "number" ? saved.freePos : null;
      }
      applyDockState();
      await saveDock();
      const toggleCollapsed = async () => {
        this._dockState.collapsed = !this._dockState.collapsed;
        applyDockState();
        await saveDock();
      };
      const setSide = async (side) => {
        this._dockState.side = side === "left" || side === "bottom" ? side : "right";
        applyDockState();
        await saveDock();
      };
      const toggleDocked = async () => {
        this._dockState.enabled = !this._dockState.enabled;
        if (!this._dockState.enabled) {
          const rect = panel.getBoundingClientRect();
          this._dockState.freePos = {
            x: clamp(rect.left, 0, Math.max(0, window.innerWidth - rect.width)),
            y: clamp(rect.top, 0, Math.max(0, window.innerHeight - rect.height))
          };
          this._dockState.collapsed = false;
        }
        applyDockState();
        await saveDock();
      };
      handle.style.touchAction = "none";
      handle.style.userSelect = "none";
      handle.addEventListener("dblclick", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this._dockState.enabled) return;
        const order = ["right", "left", "bottom"];
        const idx = Math.max(0, order.indexOf(this._dockState.side));
        const next = order[(idx + 1) % order.length];
        setSide(next);
      });
      handle.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleDocked();
      });
      handle.addEventListener("pointerdown", (e) => {
        if (e.button != null && e.button !== 0) return;
        if (this.cropActive) return;
        if (!this._dockState.enabled) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = panel.getBoundingClientRect();
        this._dockDragState = {
          startClientX: e.clientX,
          startClientY: e.clientY,
          startTop: rect.top,
          startLeft: rect.left,
          pointerId: e.pointerId,
          moved: false
        };
        try {
          handle.setPointerCapture(e.pointerId);
        } catch (_) {
        }
      });
      handle.addEventListener("pointermove", (e) => {
        if (!this._dockDragState || this._dockDragState.pointerId !== e.pointerId) return;
        e.preventDefault();
        e.stopPropagation();
        const dx = e.clientX - this._dockDragState.startClientX;
        const dy = e.clientY - this._dockDragState.startClientY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this._dockDragState.moved = true;
        const UNDOCK = 28;
        const side = this._dockState.side;
        const shouldUndock = side === "right" && dx < -UNDOCK || side === "left" && dx > UNDOCK || side === "bottom" && dy < -UNDOCK;
        if (shouldUndock) {
          const r0 = panel.getBoundingClientRect();
          this._dockState.enabled = false;
          this._dockState.collapsed = false;
          const maxX = Math.max(0, window.innerWidth - r0.width);
          const maxY = Math.max(0, window.innerHeight - r0.height);
          const nextLeft = clamp(r0.left, 0, maxX);
          const nextTop2 = clamp(r0.top, 0, maxY);
          this._dockState.freePos = { x: nextLeft, y: nextTop2 };
          panel.classList.remove("mc-docked");
          panel.classList.remove("mc-collapsed");
          panel.dataset.dockSide = "";
          panel.style.transform = "";
          panel.style.right = "auto";
          panel.style.bottom = "auto";
          panel.style.left = nextLeft + "px";
          panel.style.top = nextTop2 + "px";
          saveDock();
          try {
            handle.releasePointerCapture(e.pointerId);
          } catch (_) {
          }
          this._dockDragState = null;
          return;
        }
        if (this._dockState.side === "bottom") return;
        const r = panel.getBoundingClientRect();
        const h = r.height || 240;
        const minTop = 10;
        const maxTop = Math.max(10, window.innerHeight - h - 10);
        const nextTop = clamp(this._dockDragState.startTop + dy, minTop, maxTop);
        panel.style.top = nextTop + "px";
        this._dockState.top = nextTop;
      });
      const end = async (e) => {
        if (!this._dockDragState || this._dockDragState.pointerId !== e.pointerId) return;
        e.preventDefault();
        e.stopPropagation();
        try {
          handle.releasePointerCapture(e.pointerId);
        } catch (_) {
        }
        const moved = !!this._dockDragState.moved;
        this._dockDragState = null;
        if (!moved) {
          await toggleCollapsed();
        } else {
          await saveDock();
        }
      };
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
      window.addEventListener("resize", async () => {
        applyDockState();
        await saveDock();
      });
    }
    async _setupResizablePanel() {
      if (!this.shadowRoot) return;
      const panel = this.shadowRoot.querySelector(".mc-floating-panel");
      const handleRight = this.shadowRoot.getElementById("mc-resize-right");
      const handleBottom = this.shadowRoot.getElementById("mc-resize-bottom");
      const handleCorner = this.shadowRoot.getElementById("mc-resize-corner");
      if (!panel || !handleRight || !handleBottom || !handleCorner) return;
      for (const h of [handleRight, handleBottom, handleCorner]) {
        h.style.touchAction = "none";
        h.style.userSelect = "none";
      }
      const MIN_W = 220;
      const MAX_W = 560;
      const MIN_H = 180;
      const MAX_H = 640;
      const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
      const getSize = () => {
        const rect = panel.getBoundingClientRect();
        return { w: rect.width || 280, h: rect.height || 240 };
      };
      const clampToViewport = () => {
        const rect = panel.getBoundingClientRect();
        const w = rect.width || 280;
        const h = rect.height || 240;
        const maxX = Math.max(0, window.innerWidth - w);
        const maxY = Math.max(0, window.innerHeight - h);
        const left = clamp(rect.left, 0, maxX);
        const top = clamp(rect.top, 0, maxY);
        panel.style.left = left + "px";
        panel.style.top = top + "px";
        panel.style.right = "auto";
        panel.style.bottom = "auto";
      };
      const applySize = (w, h) => {
        const cw = clamp(w, MIN_W, Math.min(MAX_W, window.innerWidth - 10));
        const ch = clamp(h, MIN_H, Math.min(MAX_H, window.innerHeight - 10));
        panel.style.width = cw + "px";
        panel.style.height = ch + "px";
        clampToViewport();
        return { w: cw, h: ch };
      };
      const loadSize = async () => {
        try {
          const { overlayPanelSize } = await chrome.storage.local.get("overlayPanelSize");
          if (overlayPanelSize && typeof overlayPanelSize.w === "number" && typeof overlayPanelSize.h === "number") {
            return overlayPanelSize;
          }
        } catch (_) {
        }
        return null;
      };
      const saveSize = async (size) => {
        try {
          await chrome.storage.local.set({ overlayPanelSize: { w: size.w, h: size.h } });
        } catch (_) {
        }
      };
      const init = async () => {
        const saved = await loadSize();
        if (saved && saved.w && saved.h) applySize(saved.w, saved.h);
      };
      requestAnimationFrame(() => init());
      const startResize = (mode, e) => {
        if (e.button != null && e.button !== 0) return;
        if (this.cropActive) return;
        e.preventDefault();
        e.stopPropagation();
        const s = getSize();
        this._resizeState = {
          mode,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startWidth: s.w,
          startHeight: s.h,
          ratio: s.w / s.h,
          pointerId: e.pointerId
        };
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch (_) {
        }
      };
      const moveResize = (e) => {
        if (!this._resizeState || this._resizeState.pointerId !== e.pointerId) return;
        e.preventDefault();
        e.stopPropagation();
        const dx = e.clientX - this._resizeState.startClientX;
        const dy = e.clientY - this._resizeState.startClientY;
        if (this._resizeState.mode === "w") {
          applySize(this._resizeState.startWidth + dx, this._resizeState.startHeight);
        } else if (this._resizeState.mode === "h") {
          applySize(this._resizeState.startWidth, this._resizeState.startHeight + dy);
        } else {
          const targetW = this._resizeState.startWidth + dx;
          const targetH = targetW / (this._resizeState.ratio || 1);
          applySize(targetW, targetH);
        }
      };
      const endResize = async (e) => {
        if (!this._resizeState || this._resizeState.pointerId !== e.pointerId) return;
        e.preventDefault();
        e.stopPropagation();
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch (_) {
        }
        const s = getSize();
        const finalSize = applySize(s.w, s.h);
        await saveSize(finalSize);
        this._resizeState = null;
      };
      handleRight.addEventListener("pointerdown", (e) => startResize("w", e));
      handleBottom.addEventListener("pointerdown", (e) => startResize("h", e));
      handleCorner.addEventListener("pointerdown", (e) => startResize("wh", e));
      for (const h of [handleRight, handleBottom, handleCorner]) {
        h.addEventListener("pointermove", moveResize);
        h.addEventListener("pointerup", endResize);
        h.addEventListener("pointercancel", endResize);
      }
      window.addEventListener("resize", async () => {
        const s = getSize();
        const finalSize = applySize(s.w, s.h);
        await saveSize(finalSize);
      });
    }
    // --- Crop Logic ---
    startCropMode() {
      this.cropActive = true;
      const layer = this.shadowRoot.getElementById("crop-layer");
      layer.style.display = "block";
      document.body.style.cursor = "crosshair";
      this.autoScroller.stop();
      this._boundCropEnd = (e) => this._onCropEnd(e);
      document.addEventListener("mouseup", this._boundCropEnd);
    }
    stopCropMode() {
      this.cropActive = false;
      if (this._boundCropEnd) {
        document.removeEventListener("mouseup", this._boundCropEnd);
        this._boundCropEnd = null;
      }
      const layer = this.shadowRoot.getElementById("crop-layer");
      if (layer) layer.style.display = "none";
      const selection = this.shadowRoot.getElementById("crop-selection");
      if (selection) {
        selection.style.width = "0";
        selection.style.height = "0";
      }
      document.body.style.cursor = "default";
    }
    _onCropStart(e) {
      if (!this.cropActive) return;
      this.isSelecting = true;
      this.selectionStart = { x: e.clientX, y: e.clientY };
      const selection = this.shadowRoot.getElementById("crop-selection");
      selection.style.left = e.clientX + "px";
      selection.style.top = e.clientY + "px";
      selection.style.width = "0px";
      selection.style.height = "0px";
      selection.style.display = "block";
    }
    _onCropMove(e) {
      if (!this.cropActive || !this.isSelecting) return;
      const currentX = e.clientX;
      const currentY = e.clientY;
      const width = Math.abs(currentX - this.selectionStart.x);
      const height = Math.abs(currentY - this.selectionStart.y);
      const left = Math.min(currentX, this.selectionStart.x);
      const top = Math.min(currentY, this.selectionStart.y);
      const selection = this.shadowRoot.getElementById("crop-selection");
      selection.style.width = width + "px";
      selection.style.height = height + "px";
      selection.style.left = left + "px";
      selection.style.top = top + "px";
    }
    async _onCropEnd(e) {
      var _a, _b;
      if (!this.cropActive || !this.isSelecting) return;
      this.isSelecting = false;
      const selection = this.shadowRoot.getElementById("crop-selection");
      const rect = selection.getBoundingClientRect();
      this.stopCropMode();
      if (rect.width < 10 || rect.height < 10) return;
      this.showTranslation("🔍 Capture en cours…", true);
      try {
        if (!((_a = chrome == null ? void 0 : chrome.runtime) == null ? void 0 : _a.id)) {
          this.showTranslation("L'extension a été rechargée. Rechargez la page du manga (F5) puis réessayez.");
          return;
        }
        const response = await chrome.runtime.sendMessage({ type: "CAPTURE_TAB" });
        if (!response || !response.dataUrl) {
          const errMsg = response && response.error ? response.error : "Impossible de capturer l'écran";
          throw new Error(errMsg);
        }
        this.showTranslation("✂️ Recadrage…", true);
        const croppedDataUrl = await this._cropImage(response.dataUrl, rect);
        const cacheKey = croppedDataUrl.slice(-120);
        if (!this._ocrCache) this._ocrCache = /* @__PURE__ */ new Map();
        if (this._ocrCache.has(cacheKey)) {
          this.showTranslation(this._ocrCache.get(cacheKey));
          return;
        }
        if (!((_b = chrome == null ? void 0 : chrome.runtime) == null ? void 0 : _b.id)) {
          this.showTranslation("L'extension a été rechargée. Rechargez la page du manga (F5) puis réessayez.");
          return;
        }
        this.showTranslation("🤖 Traduction…", true);
        const translationResponse = await chrome.runtime.sendMessage({
          type: "TRANSLATE_TEXT",
          payload: { image: croppedDataUrl }
        });
        const text = translationResponse && translationResponse.translation ? translationResponse.translation : "Aucune réponse du service de traduction.";
        this.showTranslation(text);
        if (this._ocrCache.size >= 30) {
          this._ocrCache.delete(this._ocrCache.keys().next().value);
        }
        this._ocrCache.set(cacheKey, text);
      } catch (err) {
        console.error(err);
        const msg = err && err.message ? err.message : String(err);
        if (msg.includes("Extension context invalidated") || msg.includes("context invalidated")) {
          this.showTranslation("L'extension a été rechargée ou mise à jour.\n\nRechargez la page du manga (F5) puis réessayez la traduction.");
        } else {
          this.showTranslation("Erreur : " + msg);
        }
      }
    }
    /**
     * Découpe une image Base64 selon les coordonnées fournies
     */
    _cropImage(base64Image, rect) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const dpr = window.devicePixelRatio || 1;
          const pad = Math.max(4, Math.round(8 * dpr));
          const rawX = Math.floor(rect.left * dpr) - pad;
          const rawY = Math.floor(rect.top * dpr) - pad;
          const rawW = Math.max(1, Math.floor(rect.width * dpr) + pad * 2);
          const rawH = Math.max(1, Math.floor(rect.height * dpr) + pad * 2);
          const srcX = Math.max(0, rawX);
          const srcY = Math.max(0, rawY);
          const srcW = Math.max(1, Math.min(rawW, img.naturalWidth - srcX));
          const srcH = Math.max(1, Math.min(rawH, img.naturalHeight - srcY));
          const MAX_DIM = 2e3;
          const targetScale = MAX_DIM / Math.max(srcW, srcH);
          const scale = Math.min(2.5, Math.max(0.5, targetScale));
          const outW = Math.max(1, Math.round(srcW * scale));
          const outH = Math.max(1, Math.round(srcH * scale));
          canvas.width = outW;
          canvas.height = outH;
          const ctx = canvas.getContext("2d");
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, outW, outH);
          if ("filter" in ctx) {
            ctx.filter = "grayscale(100%) contrast(160%)";
          }
          ctx.drawImage(
            img,
            srcX,
            srcY,
            srcW,
            srcH,
            0,
            0,
            outW,
            outH
          );
          if ("filter" in ctx) ctx.filter = "none";
          try {
            const imageData = ctx.getImageData(0, 0, outW, outH);
            const data = imageData.data;
            let sum = 0;
            const n = outW * outH;
            for (let i = 0; i < data.length; i += 4) {
              sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
            }
            const mean = sum / Math.max(1, n);
            const thresh = Math.max(60, Math.min(200, mean * 0.92));
            for (let i = 0; i < data.length; i += 4) {
              const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
              const v = lum < thresh ? 0 : 255;
              data[i] = v;
              data[i + 1] = v;
              data[i + 2] = v;
              data[i + 3] = 255;
            }
            ctx.putImageData(imageData, 0, 0);
          } catch (_) {
          }
          resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = reject;
        img.src = base64Image;
      });
    }
    showTranslation(text, isLoading = false) {
      const popup = this.shadowRoot.getElementById("translation-popup");
      const content = this.shadowRoot.getElementById("translation-content");
      popup.style.display = "block";
      content.innerText = text;
      content.style.opacity = isLoading ? 0.5 : 1;
    }
    _getCurrentChapterNumber() {
      var _a;
      const byMeta = Number(((_a = this.currentMeta) == null ? void 0 : _a.chapter) ?? NaN);
      if (Number.isFinite(byMeta)) return byMeta;
      const fromTitle = document.title.match(/(?:chapter|chapitre|ch\.?|chap)\s*[-: ]?\s*(\d+(?:\.\d+)?)/i);
      if (fromTitle && fromTitle[1]) {
        const n = Number(fromTitle[1]);
        if (Number.isFinite(n)) return n;
      }
      const fromUrl = window.location.href.match(/(?:chapter|chapitre|chap)[-_\/]?(\d+(?:\.\d+)?)/i) || window.location.href.match(/[?&](?:chapter|chapitre|chap|ch)=(\d+(?:\.\d+)?)/i) || window.location.href.match(/\/(\d+(?:\.\d+)?)\/?$/);
      if (fromUrl && fromUrl[1]) {
        const n = Number(fromUrl[1]);
        if (Number.isFinite(n)) return n;
      }
      return NaN;
    }
    _formatChapterLikeCurrent(value) {
      const str = String(value);
      return str.endsWith(".0") ? str.slice(0, -2) : str;
    }
    _buildChapterUrl(targetChapter) {
      const currentUrl = window.location.href;
      const target = this._formatChapterLikeCurrent(targetChapter);
      const replacements = [
        /(chapter|chapitre|chap)([-_\/]?)(\d+(?:\.\d+)?)/i,
        /([?&](?:chapter|chapitre|chap|ch)=)(\d+(?:\.\d+)?)/i,
        /(\/)(\d+(?:\.\d+)?)(\/?$)/i
      ];
      for (const re of replacements) {
        if (!re.test(currentUrl)) continue;
        if (re.source.startsWith("(chapter")) {
          return currentUrl.replace(re, `$1$2${target}`);
        }
        if (re.source.startsWith("([?&]")) {
          return currentUrl.replace(re, `$1${target}`);
        }
        return currentUrl.replace(re, `$1${target}$3`);
      }
      return null;
    }
    async _canNavigateToChapter(targetUrl) {
      try {
        const headResp = await fetch(targetUrl, { method: "HEAD", credentials: "include", cache: "no-store" });
        if (headResp.ok) return true;
        if (headResp.status === 404) return false;
      } catch (_) {
      }
      try {
        const getResp = await fetch(targetUrl, { method: "GET", credentials: "include", cache: "no-store" });
        if (!getResp.ok) return false;
        const text = await getResp.text();
        if (/404|not found|page introuvable|doesn't exist|does not exist/i.test(text)) return false;
        return true;
      } catch (_) {
        return false;
      }
    }
    async _navigateChapterByOffset(offset) {
      var _a, _b, _c, _d;
      const parserUrl = offset > 0 ? (_b = (_a = this.parser) == null ? void 0 : _a.getNextChapterUrl) == null ? void 0 : _b.call(_a) : (_d = (_c = this.parser) == null ? void 0 : _c.getPrevChapterUrl) == null ? void 0 : _d.call(_c);
      if (parserUrl) {
        window.location.href = parserUrl;
        return;
      }
      const current = this._getCurrentChapterNumber();
      if (!Number.isFinite(current)) {
        this.showTranslation(this.t("chapter_not_found"));
        return;
      }
      const target = Math.max(0, current + offset);
      const targetUrl = this._buildChapterUrl(target);
      if (!targetUrl) {
        this.showTranslation(this.t("chapter_not_found"));
        return;
      }
      const exists = await this._canNavigateToChapter(targetUrl);
      if (!exists) {
        this.showTranslation(this.t("chapter_not_found"));
        return;
      }
      window.location.href = targetUrl;
    }
  }
  let lastUrl = "";
  function getHostnameNoWww() {
    return (location.hostname || "").replace(/^www\./i, "").toLowerCase();
  }
  function isExtensionInactiveForPage(settings) {
    const s = settings || {};
    if (s.extensionDisabled === true) return true;
    const host = getHostnameNoWww();
    const hosts = Array.isArray(s.disabledHosts) ? s.disabledHosts : [];
    return hosts.some((h) => String(h).replace(/^www\./i, "").toLowerCase() === host);
  }
  let extensionToggleWatchInstalled = false;
  function watchExtensionToggleReload() {
    if (extensionToggleWatchInstalled) return;
    extensionToggleWatchInstalled = true;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.settings) return;
      const prev = changes.settings.oldValue && typeof changes.settings.oldValue === "object" ? changes.settings.oldValue : {};
      const next = changes.settings.newValue && typeof changes.settings.newValue === "object" ? changes.settings.newValue : {};
      const was = isExtensionInactiveForPage(prev);
      const now = isExtensionInactiveForPage(next);
      if (was !== now) location.reload();
    });
  }
  async function detectAndApply(ui) {
    try {
      const parser = await ParserFactory.getParser(window.location.href, document);
      const meta = await parser.getMeta();
      if (meta && meta.chapter !== "Inconnu") {
        meta.url = window.location.href;
        console.log("📖 [MangaCentral] Manga détecté :", meta);
        chrome.runtime.sendMessage({ type: "CHAPTER_DETECTED", payload: meta });
        return { meta, parser };
      }
    } catch (err) {
    }
    return null;
  }
  function startUrlWatch(ui) {
    const checkUrl = async () => {
      const current = window.location.href;
      if (current === lastUrl) return;
      lastUrl = current;
      const result = await detectAndApply();
      if (result && ui.shadowRoot) {
        ui.updateMeta(result.meta, result.parser);
      }
    };
    window.addEventListener("popstate", checkUrl);
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    if (origPush) {
      history.pushState = function(...args) {
        origPush.apply(this, args);
        checkUrl();
      };
    }
    if (origReplace) {
      history.replaceState = function(...args) {
        origReplace.apply(this, args);
        checkUrl();
      };
    }
    setInterval(checkUrl, 1500);
  }
  (async () => {
    if (window.hasMangaCentralRun) return;
    const { settings = {} } = await chrome.storage.local.get("settings");
    if (isExtensionInactiveForPage(settings)) {
      window.hasMangaCentralRun = true;
      watchExtensionToggleReload();
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg.type !== "GET_META") return false;
        sendResponse({ error: "extension_disabled" });
        return false;
      });
      return;
    }
    window.hasMangaCentralRun = true;
    watchExtensionToggleReload();
    console.log("🚀 [MangaCentral] Core Initialized");
    const parser = await ParserFactory.getParser(window.location.href, document);
    const autoScroller = new AutoScroller();
    const ui = new UIManager(parser, autoScroller);
    if (ui && typeof ui.setLang === "function") ui.setLang(settings.displayLang || "fr");
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.settings) return;
      const prev = changes.settings.oldValue && typeof changes.settings.oldValue === "object" ? changes.settings.oldValue : {};
      const next = changes.settings.newValue && typeof changes.settings.newValue === "object" ? changes.settings.newValue : {};
      if ((prev.displayLang || "fr") === (next.displayLang || "fr")) return;
      if (ui && typeof ui.setLang === "function") ui.setLang(next.displayLang || "fr");
      if (ui && typeof ui.applyLang === "function") ui.applyLang();
    });
    try {
      const result = await detectAndApply(ui);
      if (result) {
        ui.init(result.meta);
        lastUrl = window.location.href;
        startUrlWatch(ui);
      }
    } catch (err) {
    }
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === "GET_ALL_HREFS") {
        try {
          const hrefs = Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href") || "").filter(Boolean);
          sendResponse({ hrefs });
        } catch (_) {
          sendResponse({ hrefs: [] });
        }
        return false;
      }
      if (msg.type !== "GET_META") return false;
      (async () => {
        try {
          const p = await ParserFactory.getParser(window.location.href, document);
          const meta = await p.getMeta();
          if (meta && meta.chapter !== "Inconnu") {
            meta.url = window.location.href;
            sendResponse({ meta, url: window.location.href });
          } else {
            sendResponse({ error: "not_manga_page" });
          }
        } catch (e) {
          sendResponse({ error: "not_manga_page" });
        }
      })();
      return true;
    });
  })();
})();
