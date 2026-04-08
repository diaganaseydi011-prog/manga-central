import BaseParser from './BaseParser.js';

/**
 * WebtoonParser - Parser pour Webtoon (officiel)
 * Site: webtoons.com
 */
export default class WebtoonParser extends BaseParser {
  constructor(document) {
    super(document);
    this.name = "Webtoon";
  }

  static isCompatible(url) {
    return url.includes('webtoons.com');
  }

  async getMeta() {
    // Sur Webtoon, le titre est dans le header ou meta
    const title = this.document.querySelector('.subj_episode')?.innerText || 
                  this.document.querySelector('meta[property="og:title"]')?.content ||
                  'Titre Inconnu';

    // Le numéro d'épisode est souvent dans l'URL ou le titre
    let chapter = "Inconnu";
    const urlMatch = window.location.href.match(/episode_no=(\d+)/i);
    if (urlMatch) {
      chapter = urlMatch[1];
    } else {
      const titleMatch = title.match(/#(\d+)/);
      if (titleMatch) chapter = titleMatch[1];
    }

    // Couverture
    const cover = this.document.querySelector('.detail_header img')?.src || 
                  this.document.querySelector('meta[property="og:image"]')?.content || 
                  "";

    return { title, chapter, cover };
  }

  async getPages() {
    // Webtoon utilise un viewer avec des images dans un conteneur spécifique
    const viewer = this.document.querySelector('#_imageList');
    if (!viewer) return [];

    const images = Array.from(viewer.querySelectorAll('img'));
    
    return images
      .filter(img => {
        // Webtoon a parfois des images de chargement
        return img.naturalWidth > 100 && img.naturalHeight > 100;
      })
      .map(img => img.src || img.dataset.url); // Certaines images lazy-load
  }

  getNextChapterUrl() {
    const nextBtn = this.document.querySelector('.pg_next') ||
                    this.document.querySelector('a.btn_next');
    return nextBtn ? nextBtn.href : null;
  }

  getPrevChapterUrl() {
    const prevBtn = this.document.querySelector('.pg_prev') ||
                    this.document.querySelector('a.btn_prev');
    return prevBtn ? prevBtn.href : null;
  }
}
