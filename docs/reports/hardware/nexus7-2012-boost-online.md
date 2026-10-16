# Nexus 7 2012 (grouper) : recommandations en ligne pour accélérer LineageOS 14.1

Recherche web du 2026-10-16. Appareil : grouper, Lineage 14.1 non officiel 20210704, Android 7.1.2, noyau 3.1.10, F2FS /data, 1 Go RAM, Tegra 3 T30L.

## Limites de la recherche (à lire d'abord)

- XDA (xdaforums.com / forum.xda-developers.com) renvoie HTTP 403 à WebFetch : les fils AndDiSa et aaopt n'ont pas pu être lus, seulement leurs titres et extraits de recherche. Reddit et 4pda n'ont rien donné.
- Presque rien de spécifique "Nexus 7 2012 + Nougat" n'existe pour build.prop, LMK, zram, GPU. La majorité des conseils trouvés datent de 4.x/5.x (2012-2015) et ne sont pas validés sur Nougat.
- Tout ce qui n'a pas de source ci-dessous est marqué [non vérifié].

## Constat sur les ROM et noyaux

| Sujet | Constat | Source |
|---|---|---|
| ROM AndDiSa (AOSP 7.x, F2FS/EXT4, WiFi+3G) | Toujours maintenue : fil intitulé build 2026/09/05, OTA 20260927 avec correctifs sécurité sept. 2026 (variante microG). Android 7.1.2 seulement | https://xdaforums.com/t/rom-nzh54d-2026-09-05-asus-nexus-7-2012-wifi-3g-f2fs-ext4-android-7-x-aosp.3467514/ |
| Noyau AndDiSa | Dépôt `AndDiSa/android_kernel_asus_grouper`, branche `ads-7.1.0-stable`, "AOSP-7.x Grouper Kernel (3.1.10)", fork de kerneltoast. Dates de commits et options non lues | https://github.com/AndDiSa/android_kernel_asus_grouper |
| Manifest AOSP AndDiSa | Sources du build | https://github.com/AndDiSa/platform_manifest-Grouper-AOSP |
| Lineage 14.1 (aaopt) | Utilise le noyau AndDiSa et ses arbres device ; un changelog mentionne un tweak perf d'AndDiSa et le gouverneur `intelliactive` (batterie, perf quasi inchangée) | https://xdaforums.com/t/rom-7-1-2_r24-unofficial-grouper-lineageos-14-1-for-nexus-7-2012.3530261/ |
| F2FS sur Lineage 14.1 grouper | Des utilisateurs confirment /data et /cache en f2fs, montage avec `discard` | https://xdaforums.com/t/rom-7-1-2-grouper-unofficial-lineageos-14-1-2021-03-13.4112431/page-2 |
| Lineage 15.1 (Android 8.1) | Build non officiel 2020-05-22 pour grouper existe (ud4), guide d'install ; aucun avis de performance trouvé. /e/OS Oreo 8.1 grouper existe : accélération vidéo matérielle HS et caméra cassée (selon la page de recherche) | https://dandar3.blogspot.com/2020/06/android-81-oreo-on-nexus-7-2012-wifi.html ; https://xdaforums.com/t/rom-unofficial-8-1-0-grouper-e-os-oreo-for-nexus-7-2012.4693882/ |
| Lineage 16/17/18 (Android 9/10/11) pour grouper | Aucun résultat. Les mentions "17.1/18.1" trouvées concernent le Nexus 7 2013 (flo/razor), pas grouper. Android 10 pour grouper : [non vérifié], probablement inexistant (noyau 3.1 trop vieux) | https://en.wikipedia.org/wiki/Nexus_7_(2012) |
| Alternative noyau 3.4 | `Klozz/Grouper-3.4` (base linux-tegra-nv-3.4) ; usage avec Nougat [non vérifié] | https://github.com/Klozz/Grouper-3.4 |
| Noyaux historiques (4.x) | Bricked-Kernel (hotplug custom), Franco, faux, m-kernel, Trinity : GPU OC possible sur certains. Pas de port Nougat confirmé | https://xdaforums.com/t/kernel-bricked-kernel-grouper-tilapia.1920628/ |
| postmarketOS | Existe un support mainline pour grouper (linux récent) ; GPU Tegra 3 via pilote libre, pas de GLES2 propriétaire | https://wiki.postmarketos.org/wiki/Google_Nexus_7_2012_(asus-grouper) |

## Tableau des tweaks

Légende risque : F faible, M moyen, E élevé. Réversibilité : O oui simple, R réversible via flash/restauration.

| Tweak | Commande / prop exacte | Gain attendu | Risque | Revers. | Source |
|---|---|---|---|---|---|
| F2FS pour /data et /cache (déjà fait) | Formatage F2FS via TWRP | Gain annoncé 15-280 % en E/S (chiffre du guide, non mesuré par nous) | F | R | https://xdaforums.com/t/guide-tutorial-howto-google-nexus-7-2012-stock-to-android-7-1.4236959/page-4 |
| Animations 0.5x (déjà fait) | `settings put global window_animation_scale 0.5` (+ transition, animator) | Ressenti | F | O | même guide |
| Rendu GPU forcé (guide Nougat) | Options développeur "Forcer le rendu GPU" / `debug.hwui.renderer` | Incertain : souvent neutre ou négatif sur Tegra 3 [non vérifié] | F | O | même guide ("trying forced GPU rendering") |
| Retirer/éviter les Gapps | Core Gapps seulement ou microG ; Google apps désactivées (déjà fait) | Un fil rapporte la disparition du lag avec Gapps minimales sur plusieurs ROM | F | O | https://xdaforums.com/t/2012-nexus-7-so-slow-its-almost-unusable.3007369/ |
| fstrim périodique | `fstrim -v /data` (Magisk/cron) | Redonne de la vitesse écriture sur eMMC ancien. Ici FITRIM -> EINVAL sur F2FS : ne marche pas. Alternative : montage `discard` (déjà actif selon fil Lineage) | F | O | fil "2012 Nexus 7 so slow" (LagFix = fstrim) ; https://xdaforums.com/t/rom-7-1-2-grouper-unofficial-lineageos-14-1-2021-03-13.4112431/page-2 |
| LMK minfree (pages de 4 Ko) | `echo "N1,N2,N3,N4,N5,N6" > /sys/module/lowmemorykiller/parameters/minfree` | Plus d'apps gardées vs. plus de RAM libre. Valeurs de référence trouvées : 8192,10240,12288 (script freeram, ère KitKat). Valeur recommandée pour 1 Go Nougat : [non vérifié] | M (tue trop ou trop peu) | O (reboot) | https://xdaforums.com/t/what-are-your-tablets-low-memory-killer-settings-maybe-lag-related.2342162/ ; doc noyau https://github.com/jfmcbrayer/grouper-kernel/blob/master/drivers/staging/android/lowmemorykiller.c |
| zram | Déjà 256 Mo lz4 swappiness 100. Un fil Nougat grouper mentionne un bug de calcul de mémoire libre avec zram, corrigé dans un build ultérieur de la ROM : vérifier que votre build l'a | Évite OOM/thrash | M | O | https://xdaforums.com/t/rom-nzh54d-2026-09-05-asus-nexus-7-2012-wifi-3g-f2fs-ext4-android-7-x-aosp.3467514/page-88 (extrait de recherche) |
| Swap sur fichier vs zram | Aucune source pour grouper. Swap fichier sur eMMC 16 Go = usure et lenteur ; zram préférable [non vérifié] | - | M | O | - |
| ParrotMod | Mod complet (minfree, zram, GPU, E/S) | Très reconnu sur 4.3-6.0 mais l'auteur écrit "ne marche pas sur Nougat" et ne le corrigera pas | E sur Nougat | R | https://github.com/bunzymr/ParrotMod_Grouper |
| Nvidia PRISM off / GPU sans OC | Inclus dans ParrotMod seulement | - | - | - | idem |
| GPU OC 416 -> 446 -> 520 MHz | Via noyau custom + Trickster MOD : "GPU Max Frequency 446 -> 520" ; un utilisateur rapporte 520 stable, +3-4 fps ; noyau AndDiSa 3.1.10 : support GPU OC [non vérifié] | +3-4 fps rapportés (ère 4.x) | M-E (chaleur, T30L plus bas en tension) | R | https://techglimpse.com/how-to-speed-nexus-tablet-steps/ ; https://xdaforums.com/t/q-nexus-7-gpu-overclocking.2084967/ |
| CPU OC | Noyaux historiques 1.6 à 2.0 GHz (2.0 instable, 1.8 "assez stable") ; ici T30L plafonné ~1.2-1.3 GHz, OC sur noyau Nougat [non vérifié] | Modeste | E (chaleur, batterie) | R | https://androidcommunity.com/nexus-7-quad-core-overclocked-to-2-0-ghz-shatters-benchmarks-20120825/ |
| Gouverneur `intelliactive` | `echo intelliactive > /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor` (si présent dans le noyau) | Batterie, perf proche | F | O | fil aaopt Lineage 14.1 (voir ci-dessus) |
| build.prop : `ro.config.low_ram=true`, heap dalvik, hwui, `debug.*`, `ro.HOME_APP_ADJ` | Aucune source Nougat/grouper trouvée. Les listes web sont de l'ère Galaxy Nexus / Gingerbread (`windowsmgr.max_events_per_sec`, `debug.performance.tuning`) | Inconnu | M (low_ram change la config UI/ART et peut dégrader) | O (restaurer build.prop) | https://www.rankred.com/android-build-prop-tweaks/ (générique) [non vérifié pour N7] |
| Densité / résolution | `wm density <n>` / `wm size 800x500` (réversible `wm density reset`) | Moins de pixels = plus de fps GPU (fillrate Tegra 3 limité). Aucune source grouper | F | O | [non vérifié] |
| Magisk modules zram/LMK/fstrim | Aucun module trouvé et confirmé pour Android 7 armv7 + noyau 3.1. Magisk récent (>= 24) a des soucis sur Android 7 : prendre une version compatible [non vérifié] | - | M | O | - |
| Recalibration batterie | Aucune source pertinente trouvée (le fil trouvé parle d'une batterie morte remplacée par une externe). Conseil générique "décharger/charger à 100 %" [non vérifié] ; recalibrer ne change pas la perf | - | F | O | https://dietrichschroff.blogspot.com/2020/04/my-nexus-7-2012-is-online-again-with.html |

## A appliquer (par ordre de rapport gain/risque)

1. Garder F2FS + Gapps minimales (ou microG) : seul vrai consensus trouvé, déjà fait.
2. Vérifier que le build contient le correctif zram/calcul de mémoire libre ; sinon passer à la dernière ROM AndDiSa (OTA 2026-09) qui est maintenue, et lit F2FS/EXT4. Compromis : changer de ROM = reflash complet. Pour une appli GLES2 native, la ROM AOSP pure de AndDiSa a moins de services que Lineage, donc plus de RAM libre [non vérifié].
3. Mesurer d'abord (une seule variable à la fois) : `dumpsys meminfo`, `cat /proc/pressure` n'existe pas en 3.1, utiliser `free`/`vmstat` ; ajuster minfree par pas, en testant l'appli réelle. Point de départ à essayer : 8192,10240,12288 pages seulement si l'appli reste tuée trop tard [non vérifié sur Nougat].
4. Densité/résolution réduite pour l'appli GLES2 (`wm size`/`wm density`) : le fillrate est le goulot probable ; test réversible en une commande.
5. Gouverneur `intelliactive` ou `interactive` avec `performance` pendant l'appli, si le noyau l'expose (lire `scaling_available_governors`).
6. GPU 446/520 MHz uniquement si un noyau compatible Nougat l'expose (lire `/sys/kernel/tegra_gpu/` ou le dépôt AndDiSa, [non vérifié]) ; surveiller la température.

## A éviter

- ParrotMod : déclaré incompatible Nougat par son auteur ; il écrase minfree/E/S et pourrait casser le système.
- Apps "supercharger", kernel tuners qui touchent scheduler/read-ahead/RAM en plus de vos réglages : conflits (même avertissement ParrotMod).
- `ro.config.low_ram=true` et autres props copiées de listes génériques : aucune preuve de gain, risque de comportement ART/UI dégradé.
- Swap sur fichier eMMC : usure d'un Kingston 16 Go déjà ancien, plus lent que zram.
- Overclock CPU > 1.3 GHz : chaleur, throttling, pas de source Nougat.
- Compter sur fstrim : FITRIM EINVAL sur ce noyau F2FS ; un noyau plus récent (3.4 de Klozz) pourrait l'avoir mais n'est pas validé avec Nougat.
- Chercher Android 9/10 pour grouper : aucun build trouvé ; Oreo (Lineage 15.1 / /e/OS) existe mais caméra/vidéo HW cassées selon /e/OS et le noyau 3.1 limite le gain.
- Désactiver thermal (déjà jugé inutile) et Xposed (réduit les gains selon ParrotMod).

## Pistes pour aller plus loin (accès XDA nécessaire)

- Lire à la main le fil AndDiSa (pages 88 et 237 : bug zram, changelog noyau) et la branche `ads-7.1.0-stable` : `git log`, `arch/arm/mach-tegra/tegra3_clocks.c` (fréquences GPU), `fs/f2fs` (FITRIM).
- Comparer le `tegra3_clocks.c` de https://github.com/tianruig/sultan-kernel-grouper-metallice pour les pas GPU.
