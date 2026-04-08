import BaseParser from './BaseParser.js';

/**
 * ReaperParser - Parser pour Reaper Scans
 * Site: reaperscans.com
 */
export default class ReaperParser extends BaseParser {
  constructor(document) {
    super(document);
    this.name = "Reaper Scans";
  }

  static isCompatible(url) {
    return url.includes('reaperscans.com') || url.includes('reaper-scans');
  }

  async getMeta() {
    // Titre : Recherche dans plusieurs emplacements possibles
    const title = this.document.querySelector('.entry-title')?.innerText || 
                  this.document.querySelector('.post-title')?.innerText ||
                  this.document.querySelector('meta[property="og:title"]')?.content ||
                  'Titre Inconnu';
                  
    // Extraction du chapitre depuis l'URL
    let chapter = "Inconnu";
    const urlMatch = window.location.href.match(/chapter[-_](\d+(?:\.\d+)?)/i);
    if (urlMatch) {
      chapter = urlMatch[1];
    } else {
      // Alternative : cherche dans le titre
      const titleMatch = title.match(/chapter\s*(\d+)/i);
      if (titleMatch) chapter = titleMatch[1];
    }

    // Image de couverture
    const cover = this.document.querySelector('.series-thumb img')?.src || 
                  this.document.querySelector('meta[property="og:image"]')?.content || 
                  "";

    return { title, chapter, cover };
  }

  async getPages() {
    // Reaper utilise souvent un conteneur avec id ou classe spécifique
    const readerSelectors = [
      '#readerarea img',
      '.reading-content img',
      '.reader-area img',
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

    // Filtrage pour éviter les pubs
    return images
      .filter(img => {
        // Vérifier que l'image n'est pas une pub
        const src = img.src || '';
        if (src.includes('banner') || src.includes('ad')) return false;
        
        // Vérifier taille minimale
        return img.naturalWidth > 300 && img.naturalHeight > 300;
      })
      .map(img => img.src);
  }

  getNextChapterUrl() {
    // Cherche le bouton "Next" avec plusieurs sélecteurs possibles
    const nextBtn = this.document.querySelector('.next-chapter') ||
                    this.document.querySelector('a[rel="next"]') ||
                    this.document.querySelector('.ch-next-btn') ||
                    Array.from(this.document.querySelectorAll('a')).find(a => 
                      a.innerText.toLowerCase().includes('next chapter')
                    );
    
    return nextBtn ? nextBtn.href : null;
  }

  getPrevChapterUrl() {
    const prevBtn = this.document.querySelector('.prev-chapter') ||
                    this.document.querySelector('a[rel="prev"]') ||
                    Array.from(this.document.querySelectorAll('a')).find(a => 
                      a.innerText.toLowerCase().includes('previous chapter')
                    );
    
    return prevBtn ? prevBtn.href : null;
  }
}
