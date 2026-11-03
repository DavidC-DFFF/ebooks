# Livres numériques

Présentation retenue par David : **PMTV**, après comparaison avec la version Impeccable le 7 octobre 2026.

La page d’accueil est `index.html`. Elle liste les 45 ouvrages et brochures du catalogue retenu et ouvre leur version PMTV. Le bouton « Bibliothèque » du lecteur permet de revenir à l’accueil.

L’accueil regroupe les titres dans une liste repliable par auteur. Un clic sur le nom affiche ses livres ; seul le titre sert de lien vers le lecteur.

## Collection complète

- 27 titres de Ludwig von Mises, 9 de Gustave de Molinari et 5 des autres auteurs.
- Deux EPUB de Karl Marx sont importés depuis `sources_marx/` : *Le Capital — Livre I* et *Le Capital — Édition populaire* (résumés et extraits de Julien Borchardt, texte français de J.-P. Samson). Leurs métadonnées figurent dans `epub-books.json` ; `import_epubs.py` conserve le texte du spine, les notes, les images et les tableaux. Les fichiers EPUB originaux restent locaux et ne sont pas versionnés.
- *La Route de la servitude* de Friedrich Hayek est importé depuis l’EPUB de `sources_autre/` dans sa propre rubrique.
- La traduction de travail de Joan Robinson est classée dans la rubrique Karl Marx, tout en conservant Joan Robinson comme autrice. `markdown-books.json` distingue ainsi l’autrice du groupe de classement.
- Les brochures reprises dans des recueils sont également proposées séparément, conformément au catalogue source. Ce ne sont donc pas 41 livres indépendants.
- `collect_books.py` récupère les ouvrages ciblés avec deux requêtes simultanées au maximum et conserve l’archive originale dans `sources/collection/`. `collection.json` contient les pages récupérées et les erreurs HTTP du site.
- `build_library.py` génère les 40 nouveaux lecteurs dans `livres/`, conserve le premier ouvrage à son adresse initiale, puis actualise `index.html` et `catalogue-livres.json`.
- Tous les lecteurs utilisent les couleurs, Georgia, A− / A+, le thème commun, les parties précédente/suivante et une reprise indépendante pour chaque ouvrage.
- Les illustrations disponibles sont intégrées dans les HTML pour la lecture hors connexion. Sept illustrations d’*À Panama* sont absentes du serveur source et signalées dans ce livre.
- Les liens cassés dont la destination est identifiable dans l’archive sont réparés. Lorsqu’une ancre précise est absente du texte source, le renvoi ouvre le début de la partie concernée ; ces cas figurent dans `verification-collection.json`.
- Dépendance Python : `lxml`.
- L’import Markdown utilise aussi `Markdown` (`python -m pip install --target .vendor -r requirements.txt`).
- Régénération hors connexion : `python build_library.py`.
- Contrôle de livraison : `python verify_library.py`.
- Pour ajouter un ouvrage, compléter `collection.json` avec ses métadonnées et ses pages archivées avant de régénérer. Une modification manuelle de la liste de l’accueil serait remplacée à la régénération.

Pour les prochains ouvrages, reprendre la lecture par partie, les paragraphes justifiés avec alinéas, le menu des chapitres, les boutons précédent/suivant, les thèmes clair et sombre, la taille de texte réglable, la progression et la reprise de la dernière partie. Conserver le texte et les notes de la source.

Le lecteur PMTV reprend désormais les couleurs et la typographie de la variante Impeccable : fond ivoire, texte sombre, accents verts, police Georgia, interligne 1,75 et réglages indépendants A− / A+ mémorisés. La navigation par partie et les paragraphes justifiés avec alinéas restent ceux de PMTV.

Sur les fenêtres d’au moins 1100 × 540 pixels, le texte se présente en deux colonnes à hauteur d’écran, y compris en plein écran. Les boutons précédent/suivant parcourent les doubles pages, puis les chapitres ; la molette et les flèches du clavier permettent aussi de tourner les pages dans un chapitre. La progression et la reprise suivent cette pagination. Les fenêtres plus étroites conservent le défilement vertical. `reader-layout.css` et `reader-layout.js` sont intégrés dans chaque HTML autonome à la génération.

En ligne, les pages et le code sont vérifiés auprès du serveur pour éviter qu’une ancienne copie hors connexion masque une mise à jour du lecteur. En cas d’échec réseau ou de ressource indisponible, la copie complète reste utilisée. Le bouton « Resynchroniser » renouvelle cette copie pour disposer aussi des dernières versions hors connexion.

L’accueil dispose d’un bouton clair/sombre visible et partage le thème avec les lecteurs via la préférence locale `ebooks-theme`.

## Politique économique — Ludwig von Mises

- Fichier principal : `Mises - Politique économique.html` (présentation PMTV).
- Les deux variantes et `Comparer les versions.html` sont conservés pour référence.
- Chaque HTML est autonome et lisible hors connexion ; les liens vers les autres ouvrages restent externes.
- La reprise mémorise le dernier passage lu dans la partie. Le stockage des réglages dépend du navigateur.
- Sources originales conservées dans `sources/mises-politique-economique/`.
- Régénération : `python build_mises_html.py` (nécessite lxml).
- Vérifications : neuf parties présentes, texte identique entre variantes, ancres internes du livre valides ; rapport dans `verification-mises.json`.

L’EPUB est reporté à la demande de David.

## Lecture et bibliothèque hors connexion

Le site télécharge automatiquement la bibliothèque complète via un service worker, sous HTTPS ou sur localhost. Attendre le message indiquant que tous les livres sont disponibles hors connexion avant de couper la connexion. Le bouton « Resynchroniser » télécharge une nouvelle copie et ne remplace la précédente qu’après vérification complète des fichiers. Les sources archivées et les anciennes variantes de comparaison ne font pas partie de cette copie.

La progression et la position de lecture sont conservées localement, par livre et par navigateur. L’accueil affiche le pourcentage entre parenthèses : un clic ouvre un dialogue permettant de reprendre ou d’effacer cet état, sans effacer le thème ni la taille du texte. Le pourcentage suit les parties du lecteur et la position dans la partie affichée. Les livres sont classés par dernière lecture puis par titre ; les auteurs par leur lecture la plus récente puis par nom. Le bouton ⛶ active le plein écran sur les navigateurs compatibles.

Ces données restent sur l’appareil et disparaissent si le stockage du site est effacé. Les nouveaux livres sont inclus dans le manifeste lors de `python build_library.py`. Tests du cache et des mises à jour : `node --test test-offline.mjs`.

La synchronisation Cloudflare Workers + D1 est déployée et documentée dans `backend/README.md`. Elle fusionne les progressions et les remises à zéro entre appareils, avec connexion par identifiant et mot de passe. Son URL publique est configurée dans `sync-config.js`. Créer un compte depuis l’accueil, puis utiliser le même compte sur chaque appareil. Les secrets et fichiers privés sont exclus de Git et de la copie hors connexion. Après une mise à jour, le bouton de resynchronisation de l’accueil renouvelle la copie locale du site.

## Progression par chapitre

La barre comporte un segment par partie du sommaire, proportionnel au nombre de mots de cette partie (notes comprises). Le gris représente ce qui n’a jamais été lu ; le vert clair représente les passages lus jusqu’à la position actuelle ; le vert foncé conserve les passages déjà lus situés après cette position. Un retour en arrière déplace la frontière clair/foncé sans perdre l’avancée maximale. Les chapitres sautés restent gris. Un contour repère le chapitre affiché. Le sommaire indique la légende, le pourcentage de chaque chapitre et le total pondéré de l’ouvrage.

L’avancée maximale atteinte dans chaque chapitre est mémorisée : revenir en arrière ne diminue pas la progression et sauter à un autre chapitre ne valide pas les précédents. La remise à zéro depuis l’accueil efface aussi cet état. Les anciennes positions restent utilisables, mais les anciens pourcentages ne permettent pas de reconstituer rétroactivement l’historique chapitre par chapitre. Vérification du calcul : `node --test test-progress.mjs`.

Cette évolution a été validée par David le 11 octobre 2026.

## Joan Robinson : traduction de travail

`sources_marx/Joan Robinson - Essai sur l’économie marxienne.md` contient la traduction automatique française de tous les chapitres, préfaces, annexe, références et index du PDF fourni. Le texte OCR anglais est conservé dans le même dossier. Chaque page traduite comporte un lien vers son fac-similé.

`prepare_robinson_translation.py` extrait et traduit le texte avec Google Traduction ; les résultats sont conservés dans `tmp/pdfs/robinson/translation-cache/` pour permettre la reprise. Ce répertoire temporaire est ignoré par Git. `review_robinson_translation.py` applique les corrections de `robinson-corrections.json`, notamment les définitions, les fractions et le tableau de production. Le rapport `sources_marx/robinson-traduction-verification.json` précise la couverture et les incertitudes restantes. Cette traduction n’a pas fait l’objet d’une relecture éditoriale exhaustive. Elle est intégrée au catalogue HTML sous Karl Marx à la demande de David, avec sa notice de traduction de travail. Le fac-similé `assets/robinson-facsimile.pdf` est inclus dans la copie hors connexion pour permettre les vérifications depuis le lecteur.
