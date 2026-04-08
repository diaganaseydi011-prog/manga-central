// Définitions de types pour assurer la cohérence entre les modules

export interface MangaChapter {
  id: string; // URL ou hash unique
  mangaTitle: string;
  chapterNumber: number | string;
  url: string;
  coverImage?: string;
  images: string[]; // Liste des URLs des images du chapitre
}

export interface ReadingStatus {
  lastReadTimestamp: number;
  scrollPosition: number; // Pourcentage ou pixels
  isCompleted: boolean;
}

// Interface générique pour les Parsers de site
export interface SiteParser {
  name: string;
  domain: string;
  
  // Vérifie si ce parser s'applique à l'URL actuelle
  canHandle(url: string): boolean;
  
  // Extrait les informations de base
  getMangaMeta(): Promise<{ title: string; chapter: string; cover?: string }>;
  
  // Extrait la liste des images pour le téléchargement
  getPages(): Promise<string[]>;
  
  // Trouve le lien vers le chapitre suivant
  getNextChapterUrl(): string | null;
}