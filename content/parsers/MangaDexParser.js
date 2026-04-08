import BaseParser from './BaseParser.js';

/**
 * MangaDexParser - Parser pour MangaDex
 * Site: mangadex.org
 */
export default class MangaDexParser extends BaseParser {
  constructor(document) {
    super(document);
    this.name = "MangaDex";
  }

  static isCompatible(url) {
    return url.includes('mangadex.org');
  }

  async getMeta() {
    // MangaDex a une structure très spécifique
    const title = this.document.querySelector('.manga-title')?.innerText || 
                  this.document.querySelector('meta[property="og:title"]')?.content ||
                  'Titre Inconnu';

    // Le chapitre est dans l'URL sous forme /chapter/{id}
    let chapter = "Inconnu";
    const urlMatch = window.location.href.match(/chapter\/([a-f0-9-]+)/i);
    if (urlMatch) {
      // MangaDex utilise des UUIDs, on cherche plutôt le numéro
      const chapterNum = this.document.querySelector('.chapter-number')?.innerText;
      if (chapterNum) chapter = chapterNum;
    }

    const cover = this.document.querySelector('meta[property="og:image"]')?.content || "";

    return { title, chapter, cover };
  }

  async getPages() {
    // MangaDex charge dynamiquement les images via API
    // On cherche les images déjà chargées dans le reader
    const reader = this.document.querySelector('.reader-images') || 
                   this.document.querySelector('#reader');
    
    if (!reader) {
      console.warn('[MangaDex] Reader non trouvé, tentative générique...');
      return [];
    }

    const images = Array.from(reader.querySelectorAll('img'));
    
    return images
      .filter(img => img.naturalWidth > 200)
      .map(img => img.src);
  }

  getNextChapterUrl() {
    const nextBtn = this.document.querySelector('a[title="Next chapter"]') ||
                    this.document.querySelector('.next-chapter');
    return nextBtn ? nextBtn.href : null;
  }

  getPrevChapterUrl() {
    const prevBtn = this.document.querySelector('a[title="Previous chapter"]') ||
                    this.document.querySelector('.prev-chapter');
    return prevBtn ? prevBtn.href : null;
  }
}
