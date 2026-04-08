# 📚 MangaCentral - Extension Chrome

> **Centralisez, suivez et améliorez votre expérience de lecture de mangas/manhwas**

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 🎯 Qu'est-ce que MangaCentral ?

**MangaCentral** est une extension Chrome complète qui transforme votre expérience de lecture de mangas en ligne :

✅ **Détection automatique** des chapitres et suivi de progression  
✅ **Autoscroll fluide** avec vitesse personnalisable  
✅ **Traduction assistée** (capture d’écran + API Gemini, clé optionnelle)  
✅ **Bibliothèque centralisée** avec gestion CRUD complète  
✅ **Support multi-sites** : AsuraScans, Reaper, Webtoon, MangaDex, etc.

---

## 🚀 Démarrage Rapide

### Installation

```bash
npm install
npm run build:content   # génère content/core.bundle.js
```

Puis Chrome → `chrome://extensions` → Mode développeur → **Charger l’extension non empaquetée** (ce dossier).

---

## ✨ Fonctionnalités

### 📊 Dashboard Complet
- **4 onglets** : Dashboard, Bibliothèque, Recherche, Historique
- Interface moderne en dark mode
- Gestion complète de votre collection

### 🎮 Outils sur la Page
- **⬆️ Navigation** : Haut/Bas de page instantané
- **📜 Autoscroll** : Défilement automatique fluide (60+ FPS)
- **🔍 Traduction** : Sélection de zone, capture et appel Gemini (clé API optionnelle)

### 🌐 Sites Supportés
| Site | Statut |
|------|--------|
| AsuraScans | ✅ Optimisé |
| Reaper Scans | ✅ Optimisé |
| Webtoon | ✅ Optimisé |
| MangaDex | ✅ Optimisé |
| Autres | ✅ Parser générique |

---

## 📸 Captures d'Écran

### Popup (Dashboard)
```
┌─────────────────────────────────┐
│  📚 MangaCentral        ⚙️      │
├─────────────────────────────────┤
│ [📊 Dashboard] [📖] [🔍] [📜]  │
├─────────────────────────────────┤
│                                 │
│  En cours de lecture       [3]  │
│                                 │
│  ┌──────┐  ┌──────┐  ┌──────┐  │
│  │ Solo │  │ Nano │  │ ORV  │  │
│  │ Lv.  │  │ Mach.│  │      │  │
│  │ 178  │  │  95  │  │  150 │  │
│  └──────┘  └──────┘  └──────┘  │
│                                 │
└─────────────────────────────────┘
```

### Overlay sur Page de Manga
```
Page de manga
├── [Contenu du chapitre]
│
└── [Panneau flottant (bas-droite)]
    ┌─────────────────────┐
    │ 📚 Solo Leveling    │
    │    Ch. 178          │
    ├─────────────────────┤
    │ [⬆️][📜][🔍][⬇️]│
    │                     │
    │ [━━━━━○━━━] Vitesse │
    └─────────────────────┘
```

---

## 🛠️ Architecture

### Stack Technique
- **Manifest V3** (Service Worker)
- **JavaScript ES6+** (Classes, Modules, async/await)
- **Shadow DOM** (Isolation CSS)
- **Chrome APIs** (storage, tabs, scripting)

### Structure Modulaire
```
MangaCentral/
├── manifest.json          # Configuration
├── background.js          # Service Worker
├── popup/                 # Interface Dashboard
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── content/               # Scripts injectés
│   ├── core.js           # Point d'entrée
│   ├── ui.js             # Interface overlay
│   ├── autoscroll.js     # Défilement auto
│   └── parsers/          # Extracteurs par site
│       ├── BaseParser.js
│       ├── AsuraParser.js
│       ├── ReaperParser.js
│       └── ...
├── vite.content.config.ts # Build → core.bundle.js
└── assets/                # Ressources
    ├── icons/
    └── styles/
```

**Docs projet :** `docs/privacy-policy.html`, `docs/chrome-store-notes.txt` · **README racine :** [README.md](README.md)

---

## 🤝 Contribuer

Les contributions sont les bienvenues ! Voici comment aider :

1. **Ajouter un Parser** : Créez un nouveau parser pour votre site préféré
2. **Signaler un Bug** : Ouvrez une issue avec détails
3. **Améliorer la Doc** : Proposez des clarifications
4. **Partager** : Faites connaître le projet !

---

## 🔧 Technologies

![JavaScript](https://img.shields.io/badge/-JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Chrome](https://img.shields.io/badge/-Chrome-4285F4?style=flat-square&logo=google-chrome&logoColor=white)
![CSS3](https://img.shields.io/badge/-CSS3-1572B6?style=flat-square&logo=css3)

- **MangaDex, Jikan, AniList** — métadonnées / recherche  
- **Google Gemini** — traduction (clé fournie par l’utilisateur)

---

## 📊 Statistiques (indicatif)

| Métrique | Valeur |
|----------|--------|
| **Parsers** | plusieurs sites + générique |
| **Documentation** | README + dossier `docs/` |

---

## 🎯 Roadmap

### ✅ Complété (v1.0)
- [x] Architecture modulaire avec parsers
- [x] Dashboard complet (4 onglets)
- [x] Autoscroll fluide
- [x] Interface overlay isolée
- [x] Support 5+ sites

### 🚧 Court Terme (v1.1)
- [ ] Améliorations UX / parsers
- [ ] Recherche et suggestions

### 🔮 Moyen Terme (v2.0)
- [ ] Notifications nouveaux chapitres
- [ ] Synchronisation multi-appareils
- [ ] Mode lecture verticale
- [ ] Thème clair/sombre
- [ ] Raccourcis clavier

### 🌟 Long Terme (v3.0+)
- [ ] Backend centralisé
- [ ] Application mobile
- [ ] Support Firefox/Safari
- [ ] IA recommandations

---

## 🐛 Dépannage

### Problème : Le panneau flottant n'apparaît pas
**Solution :** Ouvrez la console (F12) et cherchez `[MangaCentral]`

### Problème : Extension ne se charge pas
**Solution :** Vérifiez que `manifest.json` est à la racine et que `npm run build:content` a été exécuté.

---

## 📄 Licence

Ce projet est sous licence **MIT** - voir le fichier [LICENSE](LICENSE) pour plus de détails.

---

## 🙏 Remerciements

- **Chrome Extensions Team** pour l’API
- **Google Gemini** (API utilisateur) pour la traduction assistée
- **Communauté manga** pour le feedback

---

## 📞 Contact

- **Issues** : [GitHub Issues](https://github.com/VOTRE_USERNAME/mangacentral/issues)
- **Discussions** : [GitHub Discussions](https://github.com/VOTRE_USERNAME/mangacentral/discussions)

---

## ⭐ Soutenez le Projet

Si vous aimez MangaCentral :
- ⭐ **Star** le projet sur GitHub
- 🐛 **Signalez** les bugs
- 🤝 **Contribuez** avec du code
- 📢 **Partagez** avec vos amis

---

<div align="center">

**Fait avec ❤️ pour les lecteurs de mangas du monde entier**

[README (EN)](README.md) · dossier `docs/`

</div>
