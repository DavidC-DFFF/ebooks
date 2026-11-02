# Comptes et synchronisation des lectures

Le site reste sur GitHub Pages. Cloudflare Workers et D1 gèrent les comptes, les sessions et les lectures. La base D1 `ebooks-reading` est créée ; le Worker reste à déployer. L’URL de production dans `sync-config.js` est encore vide.

## Parcours utilisateur

Un bouton « Se connecter », puis « Mon compte » après connexion, ouvre une fenêtre intégrée à la bibliothèque. Elle propose « Se connecter » et « Créer un compte », avec identifiant, mot de passe, confirmation à l’inscription et « Rester connecté ». Aucun fichier ni paramètre technique n’est demandé à l’utilisateur. `setup.html` redirige vers l’accueil pour les anciens liens.

L’inscription crée un compte puis une session. Chaque utilisateur possède une ligne de progression privée. L’API déduit toujours l’utilisateur de la session authentifiée ; aucun identifiant d’utilisateur fourni dans une requête de lecture n’est utilisé. L’option « Ajouter les lectures de cet appareil à mon compte » importe les lectures faites sans connexion. Les données locales sont séparées par compte. Une déconnexion efface leur affichage courant sans supprimer la sauvegarde propre au compte.

## Sécurité et sessions

Le serveur reçoit le mot de passe uniquement pour l’inscription et la connexion, sous HTTPS en production. Il ne conserve ni ne journalise le mot de passe. Il stocke une empreinte PBKDF2-HMAC-SHA-256 à 100 000 itérations avec un sel aléatoire par compte et un pepper HMAC conservé séparément comme secret Cloudflare `AUTH_PEPPER`. Ce nombre d’itérations respecte le plafond du Web Crypto de Workers ; toute augmentation ou changement d’algorithme doit être validé sur le service réel et son budget CPU gratuit.

Les sessions sont des jetons aléatoires de 256 bits. Seule leur empreinte SHA-256 est stockée dans D1. Elles expirent après 30 jours avec « Rester connecté », ou 12 heures sans cette option. Le navigateur conserve le jeton dans localStorage ou sessionStorage, jamais le mot de passe. La déconnexion en ligne révoque la session côté serveur ; hors connexion elle efface l’accès de l’appareil, avec expiration normale de la session serveur.

Les tentatives sont limitées par adresse réseau et identifiant sur une fenêtre de dix minutes. Les inscriptions sont plafonnées à 100 comptes par défaut (`MAX_ACCOUNTS`). Les réponses de connexion ne divulguent pas si un identifiant existe. CORS limite les origines du lecteur et n’est pas utilisé comme authentification. Les réponses sont `no-store`, les requêtes de lecture sont limitées à 512 Kio, les journaux sont désactivés. Aucun courriel n’est demandé : la récupération de mot de passe par courriel n’est pas implémentée.

## Développement et tests

`node backend/dev.mjs` démarre l’accueil et la même API sur `http://localhost:8771`. La base SQLite et son pepper de test sont conservés dans un dossier propre à ce projet dans le répertoire temporaire Windows, hors de toute racine web et hors de Git. Le serveur écoute uniquement sur l’interface locale et ne sert que les fichiers publics du manifeste. Il adapte l’URL de l’API et les empreintes du cache pour permettre les vérifications hors connexion.

`node --test test-sync.mjs test-progress.mjs test-offline.mjs` vérifie la fusion, les comptes, l’isolation entre utilisateurs, l’expiration, la révocation, les limites et les conflits concurrents avec le vrai moteur SQLite local. Ces tests ne remplacent pas les tests du Worker déployé sur Cloudflare. Les comptes locaux sont des comptes de validation, distincts de la production.

## Mise en ligne

1. Autoriser Wrangler sur le compte Cloudflare ou utiliser le tableau de bord.
2. Depuis `backend`, appliquer `npx wrangler d1 execute ebooks-reading --remote --file=schema.sql`. Le schéma ajoute les tables sans supprimer les données existantes.
3. Créer un pepper aléatoire de 32 octets ou plus et le conserver comme secret `AUTH_PEPPER`, hors de Git et des journaux. Préserver ce secret : le changer rend les mots de passe existants invérifiables.
4. Déployer `accounts.mjs` avec la liaison D1 `DB` définie dans `wrangler.jsonc`. Vérifier les opérations d’inscription et de connexion sur Workers Free, notamment leur consommation CPU.
5. Reporter uniquement l’URL HTTPS publique dans `sync-config.js`, régénérer les lecteurs avec `python build_library.py`, vérifier, puis publier. Aucune clé privée dans le lecteur.
6. Vérifier deux appareils, un retour en arrière, le hors connexion et une remise à zéro. Resynchroniser la bibliothèque pour remplacer l’ancienne copie locale.

## Fusion des lectures

Chaque livre possède une génération de remise à zéro, un curseur horodaté et les maxima par chapitre. Une nouvelle génération l’emporte sur les anciennes données d’un appareil revenant hors connexion. Dans une même génération, les maxima sont fusionnés et le curseur récent est conservé ; les égalités sont départagées par appareil. Les horloges des appareils influencent l’ordre des curseurs, sans diminuer les maxima.

Une révision SQL conditionnelle protège les écritures concurrentes. Une révision périmée renvoie 409 avec l’état actuel à refusionner. Les échanges ont lieu au retour du réseau, au retour dans la page, environ chaque minute et après les interactions de lecture. Un état distant actualise la progression sans déplacer la page en cours. Effacer le stockage du navigateur supprime les sessions et les lectures qui n’ont pas encore été envoyées.
