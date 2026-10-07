# Livres numériques

Présentation retenue par David : **PMTV**, après comparaison avec la version Impeccable le 7 octobre 2026.

La page d’accueil est `index.html`. Elle liste les 41 ouvrages et brochures du catalogue retenu et ouvre leur version PMTV. Le bouton « Bibliothèque » du lecteur permet de revenir à l’accueil.

L’accueil regroupe les titres dans une liste repliable par auteur. Un clic sur le nom affiche ses livres ; seul le titre sert de lien vers le lecteur.

## Collection complète

- 27 titres de Ludwig von Mises, 9 de Gustave de Molinari et 5 des autres auteurs.
- Les brochures reprises dans des recueils sont également proposées séparément, conformément au catalogue source. Ce ne sont donc pas 41 livres indépendants.
- `collect_books.py` récupère les ouvrages ciblés avec deux requêtes simultanées au maximum et conserve l’archive originale dans `sources/collection/`. `collection.json` contient les pages récupérées et les erreurs HTTP du site.
- `build_library.py` génère les 40 nouveaux lecteurs dans `livres/`, conserve le premier ouvrage à son adresse initiale, puis actualise `index.html` et `catalogue-livres.json`.
- Tous les lecteurs utilisent les couleurs, Georgia, A− / A+, le thème commun, les parties précédente/suivante et une reprise indépendante pour chaque ouvrage.
- Les illustrations disponibles sont intégrées dans les HTML pour la lecture hors connexion. Sept illustrations d’*À Panama* sont absentes du serveur source et signalées dans ce livre.
- Les liens cassés dont la destination est identifiable dans l’archive sont réparés. Lorsqu’une ancre précise est absente du texte source, le renvoi ouvre le début de la partie concernée ; ces cas figurent dans `verification-collection.json`.
- Dépendance Python : `lxml`.
- Régénération hors connexion : `python build_library.py`.
- Contrôle de livraison : `python verify_library.py`.
- Pour ajouter un ouvrage, compléter `collection.json` avec ses métadonnées et ses pages archivées avant de régénérer. Une modification manuelle de la liste de l’accueil serait remplacée à la régénération.

Pour les prochains ouvrages, reprendre la lecture par partie, les paragraphes justifiés avec alinéas, le menu des chapitres, les boutons précédent/suivant, les thèmes clair et sombre, la taille de texte réglable, la progression et la reprise de la dernière partie. Conserver le texte et les notes de la source.

Le lecteur PMTV reprend désormais les couleurs et la typographie de la variante Impeccable : fond ivoire, texte sombre, accents verts, police Georgia, interligne 1,75 et réglages indépendants A− / A+ mémorisés. La navigation par partie et les paragraphes justifiés avec alinéas restent ceux de PMTV.

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

Le site télécharge automatiquement la bibliothèque complète via un service worker, sous HTTPS ou sur localhost. Attendre le message « 41 livres disponibles hors connexion » avant de couper la connexion. Le bouton « Resynchroniser » télécharge une nouvelle copie et ne remplace la précédente qu’après vérification complète des fichiers. Les sources archivées et les anciennes variantes de comparaison ne font pas partie de cette copie.

La progression et la position de lecture sont conservées localement, par livre et par navigateur. L’accueil affiche le pourcentage entre parenthèses : un clic ouvre un dialogue permettant de reprendre ou d’effacer cet état, sans effacer le thème ni la taille du texte. Le pourcentage suit les parties du lecteur et la position dans la partie affichée. Les livres sont classés par dernière lecture puis par titre ; les auteurs par leur lecture la plus récente puis par nom. Le bouton ⛶ active le plein écran sur les navigateurs compatibles.

Ces données restent sur l’appareil et disparaissent si le stockage du site est effacé. Les nouveaux livres sont inclus dans le manifeste lors de `python build_library.py`. Tests du cache et des mises à jour : `node --test test-offline.mjs`.
