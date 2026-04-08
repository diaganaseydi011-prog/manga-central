/**
 * BaseParser - Classe parente pour tous les extracteurs de site.
 * Chaque site spécifique devra étendre cette classe.
 */
export default class BaseParser {
  constructor(document) {
    this.document = document;
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
    return null; // Par défaut, pas de chapitre suivant
  }

  /**
   * Trouve l'URL du chapitre précédent.
   * @returns {string|null}
   */
  getPrevChapterUrl() {
    return null;
  }
}