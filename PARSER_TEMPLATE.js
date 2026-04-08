import BaseParser from './content/parsers/BaseParser.js';

/**
 * ⚠️ TEMPLATE DE PARSER - À PERSONNALISER
 * 
 * INSTRUCTIONS :
 * 1. Copie ce fichier dans content/parsers/
 * 2. Renomme-le : MonSiteParser.js (remplace "MonSite" par le nom de ton site)
 * 3. Remplace tous les "TODO" par tes valeurs
 * 4. Teste sur un chapitre de ton site
 * 5. Ajoute le parser dans ParserFactory.js
 * 
 * BESOIN D'AIDE ? Ouvre tools/parser-generator.html dans ton navigateur
 */

export default class MonSiteParser extends BaseParser {
  constructor(document) {
    super(document);
    this.name = "MonSite"; // TODO: Nom affiché (ex: "MangaPlus", "Scan VF")
  }

  /**
   * ÉTAPE 1 : Détection du site
   * Remplace par le domaine ou une partie de l'URL de ton site
   */
  static isCompatible(url) {
    return url.includes('monsite.com'); // TODO: Remplace par ton domaine
  }

  /**
   * ÉTAPE 2 : Extraction des métadonnées
   * Ouvre un chapitre sur ton site et utilise l'inspecteur (F12)
   */
  async getMeta() {
    // TODO: Trouve le sélecteur CSS du titre
    // Clique droit sur le titre → Inspecter → Note la classe/id
    // Exemples: '.manga-title', 'h1.entry-title', '#title'
    const title = this.document.querySelector('.manga-title')?.innerText || 
                  this.document.querySelector('meta[property="og:title"]')?.content ||
                  'Titre Inconnu';

    // TODO: Extraction du numéro de chapitre
    // Regarde l'URL de ton chapitre, cherche le pattern
    // Exemples d'URL:
    //   - https://site.com/manga/titre/chapter-123  → /chapter[-_](\d+)/
    //   - https://site.com/read/titre/123          → /\/(\d+)\/?$/
    //   - https://site.com/episode/123             → /episode[-_](\d+)/
    let chapter = "Inconnu";
    const urlMatch = window.location.href.match(/chapter[-_](\d+)/i); // TODO: Adapte la regex
    if (urlMatch) {
      chapter = urlMatch[1];
    } else {
      // Alternative: cherche dans le titre de la page
      const titleMatch = this.document.title.match(/chapter\s*(\d+)/i);
      if (titleMatch) chapter = titleMatch[1];
    }

    // Image de couverture (souvent dans les meta tags)
    const cover = this.document.querySelector('meta[property="og:image"]')?.content || "";

    return { title, chapter, cover };
  }

  /**
   * ÉTAPE 3 : Extraction des images du chapitre
   * C'est la partie la plus importante !
   */
  async getPages() {
    // TODO: Trouve le conteneur qui contient TOUTES les images
    // Clique droit sur une image → Inspecter → Remonte jusqu'au conteneur parent
    // Exemples: '#readerarea', '#reader', '.reading-content', '.chapter-content'
    const readerArea = this.document.querySelector('#readerarea'); // TODO: Remplace
    
    if (!readerArea) {
      console.warn('[MonSite] Conteneur d\'images non trouvé');
      return [];
    }

    // TODO: Trouve le sélecteur des images
    // Souvent c'est juste 'img', mais parfois il faut être plus précis
    // Exemples: 'img', 'img.manga-page', 'img.chapter-img'
    const images = Array.from(readerArea.querySelectorAll('img')); // TODO: Adapte si nécessaire

    // Filtrage pour éviter les pubs et petites icônes
    return images
      .filter(img => {
        // Ignore les images trop petites (pubs, icônes)
        if (img.naturalWidth < 300 || img.naturalHeight < 300) return false;
        
        // TODO: Ajoute d'autres filtres si nécessaire
        // Exemple: ignore les images avec "banner" dans l'URL
        // if (img.src.includes('banner') || img.src.includes('ad')) return false;
        
        return true;
      })
      .map(img => {
        // Support pour lazy loading (images qui chargent au scroll)
        return img.src || img.dataset.src || img.dataset.url;
      });
  }

  /**
   * ÉTAPE 4 (Optionnel) : Lien vers chapitre suivant
   */
  getNextChapterUrl() {
    // TODO: Trouve le bouton/lien "Chapitre suivant"
    // Exemples: '.next-chapter', 'a.ch-next-btn', 'a[rel="next"]'
    const nextBtn = this.document.querySelector('.next-chapter'); // TODO: Remplace
    return nextBtn ? nextBtn.href : null;
  }

  /**
   * ÉTAPE 5 (Optionnel) : Lien vers chapitre précédent
   */
  getPrevChapterUrl() {
    // TODO: Trouve le bouton/lien "Chapitre précédent"
    const prevBtn = this.document.querySelector('.prev-chapter'); // TODO: Remplace
    return prevBtn ? prevBtn.href : null;
  }
}

// ============================================
// GUIDE RAPIDE : TROUVER LES SÉLECTEURS CSS
// ============================================
//
// 1. Ouvre un chapitre sur ton site
// 2. Appuie sur F12 (Outils de développement)
// 3. Onglet "Elements" (ou "Inspecteur")
// 4. Clique sur l'icône 🎯 (Sélectionner un élément)
// 5. Clique sur le titre, une image, etc.
// 6. Dans le code HTML qui apparaît :
//    - Si tu vois <div id="reader"> → sélecteur: #reader
//    - Si tu vois <div class="manga-title"> → sélecteur: .manga-title
//    - Si tu vois <h1 class="entry-title"> → sélecteur: h1.entry-title
//
// ============================================
// TESTER TON PARSER
// ============================================
//
// 1. Sauvegarde ce fichier dans: content/parsers/MonSiteParser.js
//
// 2. Ouvre: content/parsers/ParserFactory.js
//
// 3. Ajoute en haut:
//    import MonSiteParser from './MonSiteParser.js';
//
// 4. Ajoute dans le tableau:
//    const parsers = [
//      AsuraParser,
//      MonSiteParser, // ← ICI
//      // ...
//    ];
//
// 5. Recharge l'extension (chrome://extensions/ → ♻️)
//
// 6. Va sur un chapitre de ton site
//
// 7. Ouvre la console (F12) et cherche:
//    [MangaCentral] Parser spécifique détecté : MonSite
//
// 8. Vérifie que :
//    - Le panneau flottant apparaît
//    - Le titre est correct
//    - Le numéro de chapitre est bon
//    - Le téléchargement ZIP fonctionne
//
// ============================================
// DEBUGGING
// ============================================
//
// Si ça ne fonctionne pas, ajoute des logs temporaires :
//
// async getMeta() {
//   console.log('🔍 Recherche du titre...');
//   const title = this.document.querySelector('.titre');
//   console.log('✅ Titre trouvé:', title?.innerText);
//   // ...
// }
//
// async getPages() {
//   const container = this.document.querySelector('#reader');
//   console.log('📦 Conteneur:', container);
//   const images = container?.querySelectorAll('img');
//   console.log('🖼️ Nombre d\'images:', images?.length);
//   // ...
// }
//
// ============================================

/*
 * EXEMPLES DE PATTERNS REGEX POUR CHAPITRES
 * 
 * URL: https://site.com/manga/titre/chapter-123
 * Pattern: /chapter[-_](\d+)/i
 * 
 * URL: https://site.com/read/titre/123
 * Pattern: /\/(\d+)\/?$/
 * 
 * URL: https://site.com/episode-45
 * Pattern: /episode[-_](\d+)/i
 * 
 * URL: https://site.com/viewer/1234567
 * Pattern: /viewer\/(\d+)/
 * 
 * Chapitres avec décimales (1.5, 2.5):
 * Pattern: /chapter[-_](\d+(?:\.\d+)?)/i
 */
