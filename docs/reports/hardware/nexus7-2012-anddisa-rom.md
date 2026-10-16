# Nexus 7 2012 (grouper) : passer sur la ROM AOSP 7.x d'AndDiSa ?

Date : 2026-10-16. Rien n'a été fait sur la tablette. Méthode : fil XDA (via web.archive.org, pages 1, 273, 274, snapshot du 2026-10-03), API GitHub, en-têtes HTTP du serveur de téléchargement.

## 1. La ROM

- Base : AOSP 7.1.2 NZH54D, build userdebug (`eng.ds`, test-keys), maintenue par AndDiSa (Heidelberg) pour grouper (wifi) et tilapia (3G). Noyau Linux 3.1.10 (Makefile de la branche `ads-7.1.0-stable`).
- Variantes : `aosp_grouper-7.1.2-ota-<date>.eng.ds.zip` (sans Google) et `-mg-ota-` (patch microG). Google Apps à part (BiTGApps CORE arm 7.1.2 recommandé ; l'ancien paquet OpenGApps pico est cité dans les astuces). F2FS/ext4 : le titre du fil annonce les deux ; la page ne détaille pas comment choisir [non vérifié].
- Dernier build : 2026-09-27, correctifs de sécurité Android de septembre 2026 (OP du fil, MAJ 2026-09-29). Builds précédents sur le serveur : 20250606, 20251210, 20260610. MD5 grouper : `1dbbb4696b5cf90185bdb2b38c453eeb` ; grouper microG : `9a36e3af431faa4d83512d27769e25d7`.
- Hébergement : https://downloads.anddisa.de/Nexus-7/ (Caddy, HTTP 200 sur le zip 20260927) ; miroir AndroidFileHost (flid=117850). Tailles : non relevées (Content-Length non lu) [non vérifié].
- Mise à jour : pas d'updater intégré ; OTA = zip à flasher sous TWRP (aucun mécanisme in-app trouvé) [non vérifié que l'absence est totale].
- Activité : cadence d'un build tous les 3 à 6 mois en 2025-2026, un seul mainteneur. Dépôt noyau poussé le 2026-07-08. Il avait annoncé arrêter en 2019, puis a repris.

## 2. Noyau comparé à un Lineage 14.1 de 2021

Dépôt : https://github.com/AndDiSa/android_kernel_asus_grouper, branche `ads-7.1.0-stable` (fork de kerneltoast).

- Commits récents : presque uniquement des rétroports CVE (2025-02, 2025-04, 2026-06-08 à 2026-07-08, dernier = GhostLock CVE-2026-43499). Après le 2021-07-04 : sanity checks f2fs (2021-08-21), le reste est de la sécurité. Aucun commit f2fs de fonctionnalité, zram, ni GPU depuis 2021.
- zram/LMK : lz4 par défaut, zsmalloc promu hors staging (2017), correctifs LMK « swap cache compté deux fois » (2018-01) et « neglect swap cached pages » (2017-08) déjà présents. Un « LMK: Optimize lowmem_shrink » a été revert en 2018-07. Tout cela précède juillet 2021 : même niveau que votre Lineage s'il utilise ce noyau [non vérifié : je n'ai pas identifié le dépôt du tag `nougat-gd41f4206`].
- f2fs : l'ioctl FITRIM existe (`f2fs_ioc_fitrim` -> `f2fs_trim_fs`, `fs/f2fs/file.c` ligne ~1097). Aucun backport f2fs récent. `f2fs_trim_fs` renvoie EINVAL si `minlen > taille de segment` ou `len < taille de bloc` ; avec `minlen = max(minlen, discard_granularity)`, un granularity du eMMC supérieur à 2 Mo expliquerait votre EINVAL [hypothèse, non vérifiée]. Rien ne laisse penser que cette ROM le change : FITRIM ne sera probablement pas réparé.
- Gouverneurs : interactive, intelliactive, ondemand, conservative, performance, powersave, userspace ; intelli_plug et CPU input boost. I/O : cfq (défaut), row, zen. Même jeu que Lineage (config `tegra3_android_defconfig`).
- Overclock : l'auteur répond (2025-10-01) que le noyau supporte déjà 1200 MHz sur les 4 coeurs, et déconseille plus (instabilité, conso, effet non perceptible). Pas d'option GPU 446/520 MHz trouvée dans le fil ni dans les commits (recherche « GPU/overclock » : rien de pertinent). Votre 1,3 GHz / GPU 416 MHz est déjà le plafond stock.
- Gain mesuré/rapporté en performance ou batterie : aucun benchmark publié trouvé.

## 3. Problèmes connus et vitesse perçue

- Non certifié Google (fingerprint userdebug) : Play Integrity échoue, et de nombreuses applications exigent SDK > 25 (Minecraft, GTA absents). Sans effet pour un APK sideloadé API 25.
- Partition /system presque pleine : GApps classiques peuvent mal s'installer ; l'auteur conseille un paquet GApps minimal et d'effacer /system avant l'OTA. Navigateur, Musique, Calendrier, LegacyCamera retirés (2019).
- Bootloop au 1er démarrage si dalvik vidé : corrigé en 2019 par un dex-preopt de l'image de boot.
- Charge lente depuis un câble branché au boot (limité à 500 mA) : débrancher/rebrancher après le démarrage.
- Camera, Bluetooth, GPS, vidéo, sleep of death : aucun rapport récent trouvé dans les pages 273-274 [non vérifié sur les ~270 autres pages]. Le grouper n'a pas de GPS réel utilisable hors wifi (matériel).
- Vitesse vs Lineage 14.1 : un utilisateur (2025-10) dit « running great » après être venu de Resurrection Remix 7.1.2 ; un autre note que microG est « le plus rapide » ; un autre gagne en RAM/perf en passant par le mode avion. Anecdotique, aucune comparaison chiffrée avec Lineage.

## 4. Root, recovery, installation

- Recovery : TWRP 3.7.0-9 (https://dl.twrp.me/grouper/twrp-3.7.0_9-0-grouper.img). Erreur 7 après TWRP 3.5.2-9 : wipe boot/system/cache/dalvik (sans toucher data).
- Magisk : v31.0 recommandé, flashable sous TWRP (renommer l'apk en .zip). Magisk 24.x ne passait pas par TWRP ; méthode de repli : extraire boot.img de l'OTA, le patcher dans l'app, `fastboot flash boot`. Ne pas installer Magisk au premier démarrage : démarrer sans root, puis l'installer.
- Procédure initiale (OP) : TWRP -> factory reset (obligatoire quand on ne vient pas déjà d'un AOSP 7.x) -> OTA -> redémarrer en recovery -> BiTGApps (optionnel) -> Magisk.
- Venant de Lineage 14.1 : wipe nécessaire d'après l'OP. Conserver /data n'est pas documenté ; /data F2FS d'un autre build + changement de SELinux/ROM : risque de bootloop [non vérifié]. Prévoir de tout perdre ; /sdcard (stockage émulé dans /data/media) l'est aussi sous « Format Data ». Copier à part avant.
- Choix f2fs/ext4 de la variante : [non vérifié], voir le post 2 / le fil avant de flasher.

## 5. Verdict pour notre cas

- Gain attendu pour une appli GLES2 native : nul à marginal. Même noyau 3.1.10, mêmes gouverneurs, mêmes fréquences (CPU 1,2-1,3 GHz, GPU 416 MHz), même userspace Android 7.1.2 (API 25). Pas de nouveau pilote GPU (blob Tegra identique). La fluidité générale pourrait venir du dépouillement (sans Google, microG) : vous avez déjà désactivé les apps Google.
- Ce qui ne changera pas : FITRIM probablement toujours en EINVAL, zram identique.
- Seul vrai gain : correctifs de sécurité (2026-09 contre 2021-06), sans intérêt pour une tablette de test hors ligne. Contre : userdebug/test-keys, /system plein, Magisk à réinstaller, bootloop possible.
- Risque : moyen (wipe total, bootloop de première install, brick improbable car bootloader et TWRP restent). Effort : 1 à 2 h. Réversibilité : bonne si sauvegarde TWRP complète (system, data, boot) faite avant ; la sauvegarde actuelle de boot et recovery seule ne suffit pas à revenir à Lineage.
- Recommandation : ne pas migrer. Mieux vaut régler Lineage (governor, `vm.swappiness`, tuning zram, mesure sur l'engine) ; migrer seulement si Lineage montre un défaut bloquant que cette ROM corrige, ce que rien ne prouve.

Si on y va quand même :
1. TWRP : sauvegarde complète system+data+boot vers un PC (`adb pull /sdcard/TWRP`), copier /sdcard aussi.
2. Télécharger l'OTA (variante `-mg-` ou sans), vérifier le MD5, plus BiTGApps CORE 7.1.2 et Magisk-v31.0.apk renommé .zip.
3. `fastboot flash recovery twrp-3.7.0_9-0-grouper.img`.
4. TWRP : Wipe > Format Data, wipe system/cache/dalvik. Flash OTA, redémarrer en recovery, (GApps), démarrer une fois sans root.
5. Retour en recovery, flasher Magisk (ou patcher boot.img + `fastboot flash boot`). Vérifier `adb shell su`.
6. Retour arrière : restaurer la sauvegarde TWRP.

## Sources

- https://xdaforums.com/t/rom-nzh54d-2026-09-05-asus-nexus-7-2012-wifi-3g-f2fs-ext4-android-7-x-aosp.3467514/ (lu via web.archive.org)
- https://downloads.anddisa.de/Nexus-7/
- https://github.com/AndDiSa/android_kernel_asus_grouper (branches `ads-7.1.0-stable`, `cm-14.1-ads`)
- https://github.com/AndDiSa/platform_manifest-Grouper-AOSP
- https://dl.twrp.me/grouper/twrp-3.7.0_9-0-grouper.img
- https://github.com/topjohnwu/Magisk/releases/tag/v31.0
