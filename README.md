# Livres numériques

Présentation retenue par David : **PMTV**, après comparaison avec la version Impeccable le 7 octobre 2026.

La page d’accueil est `index.html`. Elle liste uniquement les livres HTML disponibles et ouvre leur version PMTV. Pour ajouter un ouvrage, créer son fichier HTML, puis ajouter un élément `li` avec son titre, son auteur et son lien dans la liste de `index.html`. Le bouton « Bibliothèque » du lecteur permet de revenir à l’accueil.

Pour les prochains ouvrages, reprendre la lecture par partie, les paragraphes justifiés avec alinéas, le menu des chapitres, les boutons précédent/suivant, les thèmes clair et sombre, la taille de texte réglable, la progression et la reprise de la dernière partie. Conserver le texte et les notes de la source.

Le lecteur PMTV reprend désormais les couleurs et la typographie de la variante Impeccable : fond ivoire, texte sombre, accents verts, police Georgia, interligne 1,75 et réglages indépendants A− / A+ mémorisés. La navigation par partie et les paragraphes justifiés avec alinéas restent ceux de PMTV.

L’accueil dispose d’un bouton clair/sombre visible et partage le thème avec les lecteurs via la préférence locale `ebooks-theme`.

## Politique économique — Ludwig von Mises

- Fichier principal : `Mises - Politique économique.html` (présentation PMTV).
- Les deux variantes et `Comparer les versions.html` sont conservés pour référence.
- Chaque HTML est autonome et lisible hors connexion ; les liens vers les autres ouvrages restent externes.
- La reprise mémorise la dernière partie, pas la position exacte dans cette partie. Le stockage des réglages dépend du navigateur.
- Sources originales conservées dans `sources/mises-politique-economique/`.
- Régénération : `python build_mises_html.py` (nécessite lxml).
- Vérifications : neuf parties présentes, texte identique entre variantes, ancres internes du livre valides ; rapport dans `verification-mises.json`.

L’EPUB est reporté à la demande de David.
