# Manettes et coopération — BO1 Znoam

Intégration du fork `invictus841/bo1-zombies-decompiled`, branche `feature/browser-coop`,
commit `861e39bc083b4b986f68ad700c2e93f588736641`, dans le site `bo1.znoam.eu`.
Le client est chargé directement par le site : aucune extension Chrome à installer.

## Fonctions reprises

- Manettes PS4, PS5 et Xbox reconnues par l’API Gamepad du navigateur, en solo ou à deux.
- Déplacement analogique, visée réglable, tir, rechargement/interactions, sprint, grenades et menus.
- Salon à deux joueurs, lien d’invitation et code de salon, suivi de la carte de l’hôte.
- Pause partagée, libération du joueur déconnecté et reconnexion.
- Repositionnement du deuxième joueur près de l’hôte à l’apparition ; bouton pour le rejoindre.

Le protocole, les anneaux réseau et le correctif WASM viennent du fork indiqué ci-dessus.
Son auteur rapporte une partie testée sur deux ordinateurs par Internet. Cette adaptation
n’a pas encore été validée par une partie complète ni sur un véritable iPhone.

## Installation sur le site existant

Fusionner `site/` avec la racine du site Hostinger (le dossier qui contient déjà `bo1z/`).
Ne pas supprimer les ressources du jeu. Les fichiers versionnés empêchent de mélanger
les anciens scripts de démarrage avec les nouveaux. Actualiser le cache des pages/scripts.

L’application iOS existante charge `bo1z/kino-mobile-20261011.html` : elle récupérera
cette intégration après le transfert. Aucune recompilation de l’IPA n’est nécessaire.

Choisir une carte, puis ouvrir **Manette · Coopération** en haut de l’écran. Sur téléphone,
le panneau est réduit au départ et devient discret pendant la partie. Brancher/connecter
la manette et appuyer sur un de ses boutons. Sur téléphone, choisir **Activer la manette**,
puis recharger la page avant de lancer le jeu. Le choix est mémorisé. Appuyer d’abord sur **Jouer** à l’écran pour
activer le son. Carré/X recharge ; maintenir le bouton permet d’interagir, acheter ou réanimer.

### Sensibilité de la manette

Le menu **Options → Sensibilité de la manette** propose dix niveaux. La vitesse du stick
droit augmente de 50 % à chaque niveau par rapport à la première intégration, tout en
conservant la zone morte et le ralentissement pendant la visée. Le niveau par défaut est
5/10. Un niveau déjà choisi est conservé ; son changement s’applique immédiatement et
reste enregistré pour les prochaines visites et les autres cartes. Les boutons **Visée −/+**
du panneau utilisent le même réglage. La valeur du curseur souris/tactile n’est pas modifiée.

Pour mettre à jour une installation existante, remplacer seulement
`bo1z/coop.validated-20261011-1.js`, puis actualiser la page avec **Ctrl+F5** sur PC.
Le module conserve son nom d’entrée pour fonctionner avec les pages déjà installées ;
sa version interne est `znoam-20261011-2`. Le fichier `coop-config.js` et le relais
Cloudflare déjà configurés ne sont pas à remplacer ni à redéployer.

## Activer la coopération en ligne

Le relais de l’auteur accepte son domaine uniquement. Cette adaptation fournit un relais
indépendant configuré pour `https://bo1.znoam.eu` ; elle ne se connecte pas à celui de l’auteur.

1. Depuis ce dossier, avec Node 22 ou supérieur : `npm ci`.
2. S’authentifier sur son compte Cloudflare : `npx wrangler login`.
3. Déployer : `npm run deploy:relay`.
4. Copier l’URL HTTPS retournée dans `site/bo1z/coop-config.js` :

   ```js
   export const relay = 'https://bo1-znoam-coop.votre-compte.workers.dev';
   ```

5. Transférer ce fichier sous `bo1z/coop-config.js`, puis actualiser les deux navigateurs.
6. Ouvrir la même carte et cliquer **Créer un salon**, puis **Copier l’invitation**.
   L’autre joueur ouvre le lien, accepte le relais indiqué si nécessaire, puis lance le jeu.

Sans URL configurée, la création de salon est désactivée et les manettes restent disponibles.
Le panneau permet aussi de choisir explicitement un relais ; le lien d’invitation transporte
son adresse. Un relais reçu dans une invitation n’est jamais adopté silencieusement.

Le fichier `relay/wrangler.jsonc` contient également les origines locales du test navigateur.
Un relais peut être testé localement avec `npm run dev:relay`. Deux joueurs utilisent le
même relais. Garder l’onglet hôte ouvert ; le fonctionnement en arrière-plan sur iPhone
n’est pas garanti. Un joueur arrivant en cours de manche attend la suivante pour apparaître.

## Conservation du démarrage mobile

Le démarrage de la version `mobile-start-20261011-1` est conservé : attente des ressources,
WebGL2 sur iPhone, absence d’intro de chargement sur mobile, qualité économique et huit workers
préparés. Une invitation ou un changement de carte conserve les réglages locaux de rendu,
qualité, tactile et télémétrie. Une limite d’images/s existante n’est pas augmentée par le mode hôte.

Le moteur WASM et sa mémoire partagée d’origine ne sont pas recompilés. Cette intégration
n’est pas une correction démontrée des arrêts de Safari autour de 75–100 % du chargement.
Le 11 octobre 2026, l’utilisateur confirme que la version IPA n’a pas résolu le problème iPhone.
En solo tactile, la manette est donc désactivée par défaut : aucun téléchargement, correctif
ni compilation WASM supplémentaire n’est déclenché par cette intégration. L’activation
explicite d’une manette ou l’entrée dans un salon active la préparation nécessaire.

## Vérifications

```sh
npm ci
npm run check
# En pointant vers le moteur déjà servi par votre site :
BO1Z_ENGINE_WASM=/chemin/KisakBlack-web.wasm BO1Z_MEMORY_ENGINE_WASM=/chemin/ios/build/memory/patched.wasm npm test
# Chrome/Chromium installé localement :
CHROME_PATH=/chemin/chrome BO1Z_ENGINE_WASM=/chemin/KisakBlack-web.wasm npm run test:browser
```

Les tests contrôlent les commandes manette, les paquets, le relais réel local, les origines
autorisées, les moteurs inconnus, la conservation des réglages et le démarrage mobile.
Le test navigateur contrôle le panneau, deux workers réseau et l’initialisation du vrai
moteur avec son runtime Emscripten. Il ne télécharge pas les cartes et ne simule pas une partie.

Le moteur accepté est identifié par SHA-256 :
`61192df377020627f52fa7e9fd28047bd53662aa46e5e3cd6e7fad0c5c35cc98`.
Une autre version n’est pas modifiée : les nouvelles fonctions sont désactivées, le solo
reste utilisable. Le chargement d’une session coopérative incompatible échoue explicitement.

La version du moteur issue du correctif mémoire de l’IPA 0.2 est également reconnue :
`36024c2655e29a3eb97b64c20e3b9270cd610943c70c18ed470bcd8789a6ff01`.
Un test vérifie que les trois fonctions d’allocation modifiées par l’IPA, les données et
l’interface WASM sont conservées après l’ajout de la coopération. Pour reproduire cette
vérification depuis le dépôt complet, générer d’abord la fixture avec
`python3 ios/scripts/build_memory_patch.py --engine /chemin/KisakBlack-web.wasm`.
Le test de compatibilité est ignoré si `BO1Z_MEMORY_ENGINE_WASM` n’est pas fourni.
Le contrôle de version du salon accepte également le couple navigateur classique / IPA 0.2 :
ces deux empreintes précises partagent le même protocole réseau, malgré leur stratégie mémoire différente.

## Développement et retour arrière

`extension/src/` contient les sources historiques adaptées ; `shared/` le protocole,
`relay/` le serveur et `site/` les fichiers prêts à transférer. `npm run build` reconstruit
le module du site. `coop-config.js` reste séparé pour être modifiable sans reconstruction.
Les fonctions du moteur sont préparées via `Module.instantiateWasm`, sans modifier
`WebAssembly.instantiate`, `WebAssembly.instantiateStreaming` ni `Object.prototype`.

Pour revenir à la version précédente, fusionner `rollback/` avec la racine du site.
Les ressources en cache et les fichiers versionnés ajoutés peuvent rester en place.

Sources et attribution :
- Port navigateur : MisaDev4 / https://vel.gg/bo1z/.
- Fork repris : https://github.com/invictus841/bo1-zombies-decompiled/tree/861e39bc083b4b986f68ad700c2e93f588736641/browser-coop.
- Le split-screen Windows, DualSense HID natif et autres prototypes étudiés ne sont pas
  intégrés à cette version web : leurs contraintes et leur validation diffèrent.
