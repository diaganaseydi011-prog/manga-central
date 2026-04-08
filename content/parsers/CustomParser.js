import BaseParser from './BaseParser.js';

/**
 * CustomParser - Parser dynamique pour sites ajoutés par l'utilisateur
 * Charge les configurations depuis chrome.storage
 */
export default class CustomParser extends BaseParser {
  constructor(document, config) {
    super(document);
    this.config = config;
    this.name = config.name;
  }

  /**
   * Vérifie si une config custom correspond à l'URL
   */
  static async getConfigForUrl(url) {
    try {
      const { customSites } = await chrome.storage.local.get('customSites');
      if (!customSites || customSites.length === 0) return null;

      // Trouve le premier site qui match
      const config = customSites.find(site => {
        if (site.urlPattern) {
          // Support regex pattern
          const regex = new RegExp(site.urlPattern, 'i');
          return regex.test(url);
        }
        return url.includes(site.domain);
      });

      return config || null;
    } catch (error) {
      console.error('[CustomParser] Erreur chargement config:', error);
      return null;
    }
  }

  static isCompatible(url) {
    // Cette méthode n'est pas utilisée car on charge dynamiquement
    return false;
  }

  async getMeta() {
    try {
      // Titre - essaie plusieurs sélecteurs
      let title = 'Titre Inconnu';
      const titleSelectors = this.config.titleSelector?.split(',').map(s => s.trim()) || [];
      
      for (const selector of titleSelectors) {
        const element = this.document.querySelector(selector);
        if (element?.innerText) {
          title = element.innerText.trim();
          break;
        }
      }

      // Fallback sur meta og:title
      if (title === 'Titre Inconnu') {
        title = this.document.querySelector('meta[property="og:title"]')?.content || 
                this.document.title;
      }

      // Chapitre - utilise le pattern regex
      let chapter = "Inconnu";
      if (this.config.chapterPattern) {
        try {
          const regex = new RegExp(this.config.chapterPattern, 'i');
          const match = window.location.href.match(regex);
          if (match && match[1]) {
            chapter = match[1];
          }
        } catch (e) {
          console.warn('[CustomParser] Pattern chapitre invalide:', e);
        }
      }

      // Cover
      const cover = this.config.coverSelector 
        ? this.document.querySelector(this.config.coverSelector)?.src || ""
        : this.document.querySelector('meta[property="og:image"]')?.content || "";

      return { title, chapter, cover };
    } catch (error) {
      console.error('[CustomParser] Erreur getMeta:', error);
      return { title: 'Erreur', chapter: 'Inconnu', cover: '' };
    }
  }

  async getPages() {
    try {
      if (!this.config.containerSelector || !this.config.imageSelector) {
        console.warn('[CustomParser] Sélecteurs manquants');
        return [];
      }

      // Conteneur
      const container = this.document.querySelector(this.config.containerSelector);
      if (!container) {
        console.warn('[CustomParser] Conteneur non trouvé:', this.config.containerSelector);
        return [];
      }

      // Images
      const images = Array.from(container.querySelectorAll(this.config.imageSelector));

      // Filtrage
      const minWidth = this.config.minImageWidth || 300;
      const minHeight = this.config.minImageHeight || 300;

      return images
        .filter(img => {
          // Taille minimum
          if (img.naturalWidth < minWidth || img.naturalHeight < minHeight) return false;

          // Filtres personnalisés
          if (this.config.excludePatterns) {
            const patterns = this.config.excludePatterns.split(',').map(p => p.trim());
            for (const pattern of patterns) {
              if (img.src.toLowerCase().includes(pattern.toLowerCase())) return false;
            }
          }

          return true;
        })
        .map(img => {
          // Support lazy loading
          return img.src || img.dataset.src || img.dataset.url || img.dataset.original;
        })
        .filter(src => src && src.length > 0); // Enlève les URLs vides
    } catch (error) {
      console.error('[CustomParser] Erreur getPages:', error);
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
