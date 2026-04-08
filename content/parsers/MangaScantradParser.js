import BaseParser from './BaseParser.js';

/**
 * MangaScantradParser - manga-scantrad.io (VF)
 * URL ex: https://manga-scantrad.io/manga/star-martial-god-technique-scan-vf/chapitre-614/
 */
export default class MangaScantradParser extends BaseParser {
  constructor(document) {
    super(document);
    this.name = "Manga-Scantrad";
  }

  static isCompatible(url) {
    return url.includes('manga-scantrad.io');
  }

  async getMeta() {
    const title =
      this.document.querySelector('meta[property="og:title"]')?.content ||
      this.document.querySelector('h1')?.innerText ||
      this.document.title;
    const cleanTitle = title.replace(/\s*[-|]\s*Chapitre\s*\d+.*$/i, '').trim();

    let chapter = "Inconnu";
    const urlMatch = window.location.href.match(/(?:chapitre[-_]?|ch[-_\/])(\d+(?:\.\d+)?)/i);
    if (urlMatch) chapter = urlMatch[1];

    const cover =
      this.document.querySelector('meta[property="og:image"]')?.content ||
      this.document.querySelector('.manga-cover img, .cover img, [class*="cover"] img')?.src ||
      "";

    return { title: cleanTitle || title, chapter, cover };
  }

  async getPages() {
    const container =
      this.document.querySelector('#readerarea, .chapter-content, .reader-content, [class*="reader"]') ||
      this.document.body;
    const images = Array.from(container.querySelectorAll('img'));

    const candidates = images.filter((img) => {
      const w = img.naturalWidth || parseInt(img.getAttribute('width'), 10) || 0;
      const h = img.naturalHeight || parseInt(img.getAttribute('height'), 10) || 0;
      if (w > 300 && h > 400) return true;
      const rect = img.getBoundingClientRect();
      const src = img.src || img.dataset.src || img.dataset.url || img.getAttribute('data-src');
      return rect.width > 300 && rect.height > 400 && src;
    });

    return candidates
      .map((img) => img.src || img.dataset.src || img.dataset.url || img.getAttribute('data-src') || '')
      .filter(Boolean);
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
