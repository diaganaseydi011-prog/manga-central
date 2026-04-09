## MangaCentral — Assistant de lecture (extension Chrome)

MangaCentral est une extension **Manifest V3** pour Chrome / navigateurs Chromium qui aide au suivi de lecture
de mangas / manhwas / webtoons et ajoute un petit panneau flottant sur les pages de lecture.

L’objectif : organiser ce que vous lisez déjà (bibliothèque, historique, raccourcis de navigation, OCR + traduction
optionnelle), sans héberger de contenu ni proposer de téléchargement de chapitres.

---

### Fonctionnalités principales

- **Bibliothèque** : ajoutez vos titres avec URL, couverture, statut et dernier chapitre lu.
- **Historique** : mémorise localement les chapitres visités sur les sites compatibles.
- **Recherche** : utilise MangaDex, Jikan et AniList pour retrouver des œuvres (métadonnées publiques).
- **Panneau flottant** sur la page de lecture :
  - navigation haut / bas de page ;
  - défilement automatique réglable ;
  - outil de sélection de zone (OCR + traduction via Google Gemini, si vous avez configuré une clé).
- **Données locales** : historique, bibliothèque, paramètres et éventuelle clé Gemini sont stockés dans `chrome.storage.local`
  sur votre appareil.

Plus de détails (FR) : [`README_FR.md`](README_FR.md)  
Politique de confidentialité : [`docs/privacy-policy.html`](docs/privacy-policy.html)  
Page d’assistance / accueil : `https://diaganaseydi011-prog.github.io/manga-central/`

---

### Pour les développeurs

Build du script de contenu :

```bash
npm install
npm run build:content
```

Cela génère `content/core.bundle.js` à partir de `content/core.js` et des modules liés.
