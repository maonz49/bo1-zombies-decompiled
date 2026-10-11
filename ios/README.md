# BO1 Mobile — IPA expérimentale

Cette application iOS ouvre la version WebAssembly de BO1 hébergée sur `bo1.znoam.eu` dans WKWebView. **Ce n'est pas un portage natif ARM64 du moteur BO1 et ce n'est pas un correctif prouvé du crash Safari.** WKWebView emploie aussi WebKit et ses limites de mémoire restent applicables. Le moteur Windows/DirectX à la racine n'est pas compilé dans cette application.

Le lancement utilise `kino-mobile-20261011.html`, `quality=eco`, `touch=1`, `renderer=webgl2`, `telemetry=0` et `packOrigin=0`. Cette page doit rester hébergée avec COOP/COEP. La version publiée le 11 octobre 2026 supprime l'intro sur mobile et séquence les téléchargements avant le moteur. **La version 0.2 embarque le correctif mémoire décrit dans [memory/README.md](memory/README.md)** et l'applique au moteur téléchargé après vérification SHA-256. Les données du jeu restent sur le serveur. **Internet est requis** et le premier lancement télécharge les données dans le stockage WebKit propre à l'application.

L'interface native conserve les dernières lignes du journal et les capacités web disponibles. Si le processus WebKit s'arrête, elle propose un nouveau lancement manuel et le partage du diagnostic, sans rechargement automatique en boucle. Un arrêt du processus ne prouve pas à lui seul un manque de mémoire. Si iOS tue aussi l'application entière, le dernier rapport sauvegardé reste accessible au lancement suivant, mais les dernières lignes en attente peuvent être perdues. Aucun rapport n'est envoyé automatiquement.

## Compiler

Sur un Mac avec Xcode et son SDK iPhoneOS :

```sh
python3 ios/scripts/build_memory_patch.py
node --test ios/tests/diagnostics.test.cjs ios/tests/memory.test.cjs
bash ios/scripts/build.sh iphoneos
```

Résultat : `ios/build/iphoneos/BO1-Mobile.ipa`. Le workflow GitHub Actions de la branche `codex/ios-ipa` compile également l'IPA sur un runner `xcode-27`, vérifie son exécutable Mach-O ARM64 et lance seulement l'écran d'accueil dans le simulateur. Ce test ne valide ni le téléchargement du jeu ni une partie sur iPhone physique.

## Installer

L'IPA porte une signature ad hoc de compilation, **pas une signature Apple personnelle permettant une installation directe**. Elle doit être re-signée par SideStore, AltStore ou Sideloadly avec le compte Apple et le profil de l'utilisateur. Aucun certificat, identifiant Apple ou profil personnel n'est inclus. Le fonctionnement de ces outils et les limites du compte Apple sont indépendants de ce projet.

L'application s'installe à partir d'iOS 18, mais le moteur actuel nécessite notamment JSPI ; iOS 27 l'introduit dans WebKit. Le lancement vérifie les capacités réellement présentes plutôt que la seule version affichée par le navigateur. Si JSPI ou la mémoire partagée sont absents, il s'arrête avec une explication. Le moteur conserve son espace mémoire WebAssembly fixe d'environ 2 Gio : une IPA ne réduit pas cette réservation.

## Portage natif

Pour supprimer la dépendance à WebKit, il faut un autre chantier : porter le moteur Win32/x86/DirectX vers ARM64/iOS, ou disposer d'un moteur iOS natif compatible avec les données. Le projet tiers `devnoname120/boz-ios` répare l'ancienne édition mobile officielle ; il nécessite une IPA originale précise et représente une autre édition du jeu. Il n'est pas incorporé ici.
