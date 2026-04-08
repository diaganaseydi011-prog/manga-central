import BaseParser from './BaseParser.js';

/**
 * AsuraParser - Exemple d'implémentation pour un site réel (AsuraScans).
 * Utilise des sélecteurs CSS spécifiques à leur thème.
 */
export default class AsuraParser extends BaseParser {
  constructor(document) {
    super(document);
    this.name = "Asura Scans";
  }

  static isCompatible(url) {
    return url.includes('asuracomic.net') || url.includes('asurascans');
  }

  async getMeta() {
    // Titre : sélecteurs Asura puis og:title / h1 / document.title, enfin slug d'URL
    let title = this.document.querySelector('.entry-title')?.innerText?.trim() ||
                this.document.querySelector('.allc a')?.innerText?.trim() ||
                this.document.querySelector('meta[property="og:title"]')?.content?.trim() ||
                this.document.querySelector('h1')?.innerText?.trim() ||
                this.document.title?.trim() || '';
    if (title) title = title.replace(/\s*[-|]\s*Chapter\s*\d+.*$/i, '').replace(/\s*[-|]\s*Chapitre\s*\d+.*$/i, '').trim();
    if (!title && typeof window !== 'undefined' && window.location?.href) {
      const m = window.location.href.match(/\/series\/([^/]+)(?:\/|$)/i);
      if (m && m[1]) {
        const slug = m[1].replace(/-[a-f0-9]{8,}$/i, '').replace(/-/g, ' ');
        title = slug.replace(/\b\w/g, (c) => c.toUpperCase()) || 'Titre Inconnu';
      }
    }
    if (!title) title = 'Titre Inconnu';

    // Extraction du chapitre depuis l'URL (chapter-178, chapter/244, chapter178, etc.)
    let chapter = "Inconnu";
    const urlMatch = window.location.href.match(/chapter[-_\/]?(\d+(?:\.\d+)?)/i);
    if (urlMatch) chapter = urlMatch[1];

    // Image de couverture (souvent dans les métadonnées ou le header)
    const cover = this.document.querySelector('.thumb img')?.src || 
                  this.document.querySelector('meta[property="og:image"]')?.content || "";

    return { title, chapter, cover };
  }

  async getPages() {
    // Asura : images dans #readerarea, src direct (ex: gg.asuracomic.net/.../01-optimized.webp)
    const readerArea = this.document.querySelector('#readerarea');
    if (!readerArea) return [];

    const images = Array.from(readerArea.querySelectorAll('img'));
    const getSrc = (img) =>
      img.src || img.dataset.src || img.getAttribute('data-src') || img.dataset.lazySrc || '';

    return images
      .filter(img => {
        const src = getSrc(img);
        if (!src || !src.startsWith('http')) return false;
        const w = img.naturalWidth || 0;
        if (w > 0 && w < 200) return false; // Exclure petites images (pubs) déjà chargées
        return true; // Garder si pas encore chargé (w=0) ou image assez grande
      })
      .map(getSrc)
      .filter(Boolean);
  }

  getNextChapterUrl() {
    const nextBtn = this.document.querySelector('.ch-next-btn');
    return nextBtn ? nextBtn.href : null;
  }
}