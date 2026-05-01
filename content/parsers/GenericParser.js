import BaseParser from './BaseParser.js';

/**
 * Extrait un numéro de chapitre depuis une URL (toutes variantes courantes).
 * @param {string} href
 * @returns {string|null} Numéro de chapitre ou null
 */
export function getChapterFromUrl(href) {
  if (!href) return null;
  const url = href.replace(/#.*$/, '');
  const path = url.replace(/^[^?]+\?/, '');
  const pathOnly = url.split('?')[0];

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
    /(?:^|\/)(\d+)\/?$/,
  ];

  for (const re of pathPatterns) {
    const m = pathOnly.match(re) || path.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

/**
 * GenericParser - Tente de deviner le contenu sur n'importe quel site de manga
 * en se basant sur la structure HTML standard et les métadonnées.
 */
export default class GenericParser extends BaseParser {
  constructor(document) {
    super(document);
    this.name = "Generic";
  }

  static isCompatible(url) {
    return true; // Fallback universel
  }

  async getMeta() {
    let title = this.document.querySelector('meta[property="og:title"]')?.content 
                || this.document.querySelector('h1')?.innerText 
                || this.document.title;
    
    // Couper au premier séparateur entouré d'espaces (ex: "Titre - Site Web")
    title = (title || '').toString().split(/\s+[-|:–—]\s+/)[0];
    title = title.replace(/(Read|Scan|Manga|Manhwa|Free)\s/gi, '').trim();

    let chapter = "Inconnu";
    const urlCh = getChapterFromUrl(window.location.href);
    if (urlCh) chapter = urlCh;
    if (chapter === "Inconnu") {
      const titleMatch = this.document.title.match(/(?:chapter|chapitre|ch\.|chap)\s*(\d+)/i);
      if (titleMatch) chapter = titleMatch[1];
    }

    // 3. Cover : Cherche og:image
    const cover = this.document.querySelector('meta[property="og:image"]')?.content || "";

    return { title, chapter, cover };
  }

  async getPages() {
    // Stratégie heuristique : grandes images (manga) + support lazy-load (data-src, etc.)
    const allImages = Array.from(this.document.querySelectorAll('img'));

    const candidates = allImages.filter((img) => {
      const w = img.naturalWidth || parseInt(img.getAttribute('width'), 10) || 0;
      const h = img.naturalHeight || parseInt(img.getAttribute('height'), 10) || 0;
      if (w > 300 && h > 400) return true;
      // Images lazy-load (naturalWidth/Height pas encore chargés) : utiliser la taille affichée
      const rect = img.getBoundingClientRect();
      const hasSrc = img.src || img.dataset.src || img.dataset.url || img.getAttribute('data-src');
      if (rect.width > 300 && rect.height > 400 && hasSrc) return true;
      return false;
    });

    return candidates.map(
      (img) => img.src || img.dataset.src || img.dataset.url || img.getAttribute('data-src') || ''
    ).filter(Boolean);
  }

  getNextChapterUrl() {
    // Cherche des liens contenant "Next" ou une flèche
    const links = Array.from(this.document.querySelectorAll('a'));
    const nextLink = links.find(a => {
      const text = a.innerText.toLowerCase();
      return text.includes('next') || text.includes('suivant') || a.className.includes('next');
    });
    return nextLink ? nextLink.href : null;
  }
}