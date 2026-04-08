import GenericParser from './GenericParser.js';
import AsuraParser from './AsuraParser.js';
import ReaperParser from './ReaperParser.js';
import WebtoonParser from './WebtoonParser.js';
import MangaDexParser from './MangaDexParser.js';
import MangaScantradParser from './MangaScantradParser.js';
import CustomParser from './CustomParser.js';

export default class ParserFactory {
  /**
   * Retourne l'instance de parser la plus adaptée pour l'URL actuelle.
   * @param {string} url 
   * @param {Document} document 
   * @returns {import('./BaseParser').default}
   */
  static async getParser(url, document) {
    // 0. Vérifier d'abord les parsers personnalisés (priorité maximale)
    const customConfig = await CustomParser.getConfigForUrl(url);
    if (customConfig) {
      console.log(`[MangaCentral] Parser personnalisé détecté : ${customConfig.name}`);
      return new CustomParser(document, customConfig);
    }

    // Liste des parsers spécifiques (ordre de priorité)
    const parsers = [
      AsuraParser,         // AsuraScans
      ReaperParser,        // Reaper Scans
      MangaScantradParser, // Manga-Scantrad (VF)
      WebtoonParser,       // Webtoon officiel
      MangaDexParser,      // MangaDex
    ];

    // 1. Chercher un parser spécifique
    for (const ParserClass of parsers) {
      if (ParserClass.isCompatible(url)) {
        console.log(`[MangaCentral] Parser spécifique détecté : ${ParserClass.name}`);
        return new ParserClass(document);
      }
    }

    // 2. Sinon, retourner le générique
    console.log(`[MangaCentral] Aucun parser spécifique. Utilisation du GenericParser.`);
    return new GenericParser(document);
  }
}