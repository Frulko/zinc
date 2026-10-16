# Nexus 7 (2012) "grouper" / "tilapia" : diagnostic et performance pour Zinc

Recherche web du 2026-10-16. Cible : tablette rootée, Tegra 3 T30L (4x Cortex-A9 + compagnon, NEON), 1 Go de RAM, eMMC 8/16/32 Go, GPU ULP GeForce (OpenGL ES 2.0 seulement).

Convention de fiabilité : **[source]** = confirmé par une page citée ; **[connaissance]** = savoir général non revérifié pendant cette recherche (à valider sur l'appareil) ; **[non trouvé]** = recherche sans résultat.

## Mesures sur l'appareil branché (2026-10-16, adb root)

| Point | Mesure |
|---|---|
| ROM | LineageOS 14.1 non officielle 20210704 (Android 7.1.2, API 25), noyau 3.1.10 « nougat », bootloader 4.23, GApps installées |
| CPU | Tegra 3 T30L, 4x Cortex-A9 r2p9, NEON + VFPv3, 51 MHz à 1,3 GHz, gouverneur `intelliactive`, cœurs coupés à la demande (cpuquiet) |
| GPU | NVIDIA Tegra 3, OpenGL ES 2.0 14.01003, EGL 1.4 ; extensions utiles : S3TC/DXT, ETC1, LATC, half-float, NPOT mipmap, `EXT_texture_array`, `NV_draw_buffers`, `NV_shader_framebuffer_fetch`, anisotrope |
| RAM | 994 Mo, zram 256 Mo dont 124 Mo occupés, ~44 Mo libres ; les services Google prennent ~190 Mo de PSS (gms.persistent 61, vending 47, gms 39, gms.unstable 30) |
| eMMC | `MMC16G`, manfid 0x70 (Kingston), fabriquée 08/2012, eMMC 4.41 ; /data et /cache en F2FS montés `discard` (TRIM en ligne), /data 21 % plein, /system 92 % plein |
| Lecture brute séquentielle | 24 Mo/s (`dd` sur mmcblk0) ; 16 Mo/s à travers F2FS |
| Écriture séquentielle | ~14 Mo/s (128 Mo + `sync` en 9,1 s) |
| 4K aléatoire (O_DIRECT, outil `iob` compilé avec zig) | lecture 907 IOPS (3,7 Mo/s), écriture 440 IOPS (1,8 Mo/s), écriture+fdatasync 325 IOPS, pire latence 423 ms |
| Petits fichiers | 500 fichiers de 4 Ko + sync : 8,5 s (≈ 17 ms par fichier) |
| Batterie | jauge bq27541 : `charge_full` 4014 mAh pour 4400 nominaux (91 %) ; batterystats estime 3260 mAh (≈ 75 %) ; santé « Good », 28 °C en charge |
| Thermique | 36-37 °C au repos ; aucune trace de bridage dans dmesg |
| Anomalies | erreurs I2C sur `tegra-i2c.2` et « wake up tp failed » (tactile elan) à la sortie de veille ; échecs binder dans les premières minutes (démarrage sous pression mémoire) ; `fio` de la ROM plante (Bus error) |

Lecture : l'eMMC n'est pas « morte » ; les 4K aléatoires en écriture (1,8 Mo/s) sont au niveau d'une puce saine de cette génération, le TRIM tourne déjà grâce à F2FS. Ce qui ralentit la tablette au quotidien, c'est la RAM : 1 Go dont un cinquième pour les services Google, d'où zram plein et charge de 6 à 11 au démarrage.

## Réglages appliqués (réversibles, `nexus7-tune.sh apply|revert|status`)

Planificateur `row`, `iostats` 0, `dirty_expire` 500 / `dirty_writeback` 1000 (fichier `/system/etc/init/zz-nexus7-tune.rc`, relu au boot), animations 0,5, NFC et scan BLE coupés, 14 paquets désactivés par `pm disable-user` (Google, impression, widget horloge), SystemUI, Trebuchet et Paramètres compilés en `speed`.

TRIM : `FITRIM` est refusé par le F2FS de ce noyau sur /data et /cache (« Invalid argument », vold échoue pareil : `vdc fstrim dotrim`, dernière maintenance Android le 2025-03-16) ; le TRIM passe en ligne par l'option `discard` (granularité 4 Mo acceptée par la puce). /system (ext4) : 90 Mo trimés à la main.

| Mesure | Avant (24 min après boot) | Après (6 min après boot) |
|---|---|---|
| Ouverture des Paramètres, 1re / suivantes | 1417 / 452 ms | 791 / 403 ms |
| zram utilisé | 103 Mo | 6 Mo |
| Charge au démarrage | 6 à 11 | 2 |
| 4K lecture aléatoire | 907 IOPS | 1408 IOPS |
| 4K écriture aléatoire | 440 IOPS | 427 IOPS |
| Écriture + fsync, pire latence | 428 ms | 428 ms |

La première ouverture n'est pas strictement comparable (moments différents après le boot). « Lost RAM » de dumpsys passe de 97 à 261 Mo juste après le boot (mémoire noyau non attribuée, probablement GPU) : à remesurer après une heure d'usage.

## Root Magisk (2026-10-16)

Magisk 30.7 (armeabi-v7a) installé : `boot.img` (partition `LNX`, mmcblk0p2) sauvegardé avec la recovery (`SOS`, mmcblk0p1) dans `~/nexus7-grouper-backup/` (SHA256SUMS à côté), patché sur l'appareil par `boot_patch.sh` de l'APK, testé par `fastboot boot`, puis écrit sur `LNX`. `su` accordé au shell adb (uid 2000) par `magisk --sqlite`. Retour arrière : `fastboot flash boot ~/nexus7-grouper-backup/boot.img`.

Horloges relues (debugfs) : GPU 3D/2D 228 MHz courant, 416 MHz max (valeur d'origine T30L) ; EMC 667 MHz ; CPU 1,3 GHz max ; hotplug `autosmp` (min 1, max 4 cœurs). Le surcadençage du GPU (446/520 MHz, voir `nexus7-2012-boost-online.md`) demande un noyau recompilé : non fait.

## Gains rapides (dans l'ordre)

1. `adb shell su -c "fstrim -v /data"` puis `/cache` et `/system` (si monté rw). Sur Android 5.1.1 et 7.1 le binaire existe ; le trim automatique tourne seulement la nuit, appareil inactif [source: tomshardware, droid-life]. Un trim manuel après un gros nettoyage est le premier geste.
2. Garder au moins 20 % de /data libre : fstrim n'aide pas une eMMC remplie à ras bord [source: AnandTech via phonearena/tomshardware].
3. Mesurer avant/après avec `dd` (section 1) ; si l'écriture séquentielle est très basse après trim, sauvegarder puis reformater /data (`fastboot format userdata` ou TWRP) et, sur ROM custom, passer en F2FS [source: xda-developers.com article F2FS].
4. Lire l'état batterie (section 2) avant toute session longue ; si gonflée, ne plus charger.
5. Pour l'app native : ROM LineageOS 14.1 (Android 7.1) non officielle, ou stock 5.1.1 dégooglisé ; stopper le framework (`stop`) et lancer le binaire en root, ou APK NativeActivity (section 5).
6. Fixer le gouverneur `interactive` ou `performance`, le planificateur d'E/S `deadline` ou `noop`, désactiver les animations, geler les apps Google (section 4).
7. Ne pas surcadencer au départ ; la T30L est limitée par la thermique et le régulateur de tension, gain faible pour un risque réel.

## 1. Ralentissement eMMC

### Cause
- La Nexus 7 2012 ralentit avec le temps parce que les blocs supprimés ne sont pas signalés au contrôleur eMMC : il les croit encore occupés, la garbage collection devient coûteuse, les écritures s'effondrent [source: https://www.tomshardware.com/uk/news/Nexus-7-eMMC-controller-fstrim-TRIM-garbage-collection,23751.html ; https://www.droid-life.com/2013/07/30/original-nexus-7-performance-issues-fixed-in-android-4-3/ ; https://9to5google.com/2013/07/30/android-4-3-cures-performance-issues-of-2012-nexus-7/].
- Le support TRIM existait en 4.2 mais n'était pas activé ; Android 4.3 active `fstrim`, lancé toutes les 24 h au repos (batterie suffisante) [source: https://www.phonearena.com/news/Your-old-Nexus-7-running-slow-Android-4.3-brings-a-fix_id45816 ; https://www.androidheadlines.com/2013/07/android-4-3-could-breathe-new-life-into-your-original-nexus-7.html].
- Les cartes eMMC bon marché ont des contrôleurs peu rapides, d'où une dégradation forte quand plein [source: https://www.anandtech.com/show/6130 ; https://www.anandtech.com/show/6073/the-google-nexus-7-review/6].
- Android 5.0.2 a encore ajusté noyau et scripts de démarrage pour maintenir un peu plus de performance CPU [source: https://www.androidpolice.com/2014/12/20/developer-changelog-posted-for-android-5-0-1_r1-lrx22c-to-5-0-2_r1-lrx22g/].

### Variantes de puce
- Le modèle 8 Go d'origine utilise une eMMC 4.41 Kingston (KE44B-26BN/8GB d'après le démontage) [source: https://www.anandtech.com/show/6073/the-google-nexus-7-review/6 ; https://www.ifixit.com/Teardown/Nexus+7+Teardown/9623].
- Les 16/32 Go : fournisseurs variables. Hynix, Samsung, Toshiba sont cités dans la tâche mais **[non trouvé]** dans mes sources pour ce modèle précis. Ne pas supposer ; lire la puce (ci-dessous).

### Identifier le fabricant
```sh
adb shell su -c 'cat /sys/block/mmcblk0/device/name /sys/block/mmcblk0/device/manfid /sys/block/mmcblk0/device/cid /sys/block/mmcblk0/device/date'
```
`manfid` est l'ID JEDEC/MMC du fabricant (0x11 = Toshiba, 0x15 = Samsung, 0x90 = Hynix, 0x70 = Kingston/Phison selon les tables de noyau Linux) **[connaissance]**. Les noms de champs sysfs peuvent varier sur un noyau 3.1 ; sinon `cat /proc/mmc*`, ou `dmesg | grep -i mmc`.

### Mesurer
- Écriture séquentielle : `su -c "dd if=/dev/zero of=/data/local/tmp/t bs=1M count=256 conv=fsync; rm /data/local/tmp/t"` (toybox/busybox selon la ROM ; sinon omettre `conv=fsync` et faire `sync` chronométré).
- Lecture : `echo 3 > /proc/sys/vm/drop_caches` puis `dd if=/data/local/tmp/t of=/dev/null bs=1M`.
- Applications : AndroBench, A1 SD Bench (non vérifiées ici).
- Ordres de grandeur **[connaissance, à vérifier]** : sain ~ 10-20 Mo/s en écriture séquentielle, ~ 40-60 Mo/s en lecture ; dégradé : écriture < 2-5 Mo/s, écritures aléatoires 4 Ko sous 0,1 Mo/s. Android Authority note que la Nexus 7 2013 fait 5x en lecture séquentielle, 2x en lecture aléatoire, 1,5x en écriture par rapport à la 2012 [source: https://androidauthority.com/nexus-7-2013-vs-nexus-7-2012-benchmarks-248910].

### Corriger
1. `fstrim -v /data; fstrim -v /cache; fstrim -v /system` (root). Attendre la fin, relire dd.
2. Si insuffisant : sauvegarde complète (adb pull), puis `fastboot format userdata` (ou formatage TWRP) : relance le contrôleur avec des blocs frais, plus efficace que fstrim seul **[connaissance]**.
3. F2FS (ROM custom) : noyau compatible F2FS + TWRP modifié, formatage de /data en F2FS, restauration. Efface tout. Procédure de legolas93 sur XDA ; pas de chiffres publiés [source: https://www.xda-developers.com/speed-up-your-aging-nexus-7-2012s-storage-with-f2fs/]. Le fil d'origine est derrière XDA (403 à l'extraction) : à ouvrir à la main.
4. LagFix : application d'optimisation par fstrim/réécriture des années 4.1-4.2, rendue obsolète par 4.3+ **[connaissance]**.

### Usure
- L'indicateur d'usure (`EXT_CSD` life time estimation A/B, `pre-EOL info`) date d'eMMC 5.0 ; la puce est eMMC 4.41, donc **indisponible** [source: eMMC 4.41 AnandTech ; règle JEDEC = **connaissance**, confirmée par raisonnement de version]. Aucun indicateur direct : se fier aux mesures dd et aux erreurs `dmesg` (mmc, I/O error).
- Le nombre de blocs défectueux n'est pas exposé. Une tablette qui passe `dd` correctement après format est saine.

## 2. Batterie

- Pack ASUS C11-ME370T (4325 mAh d'origine). Remplacements du commerce : 4300-4750 mAh, qualité variable, avis mixtes [source: https://www.subtel.de/en/battery-for-asus-google-nexus-7-1st-gen-2012-pad-me370t-c11-me370t-4300mah-replacement-bat-916125.html].
- Après 10+ ans, attendre une capacité nettement réduite et une résistance interne élevée (chutes brutales, arrêt à 20-30 %) **[connaissance]**. Aucune statistique publiée trouvée **[non trouvé]**.
- Lecture :
  ```sh
  adb shell dumpsys battery
  adb shell su -c 'cd /sys/class/power_supply/battery && for f in capacity voltage_now current_now temp health status technology charge_full charge_full_design; do echo $f=$(cat $f 2>/dev/null); done'
  ```
  `charge_full` / `charge_full_design` (usure) n'existent pas sur tous les noyaux ; sur 3.1 grouper la jauge est basée sur tension, donc peu fiable [source partielle: https://articles.brick.tech/how-to-check-battery-health-on-android/ ; limite grouper = **connaissance**]. Test pratique : cycle complet chronométré sous charge GPU, tension à 4,2 V puis chute.
- Gonflement : si le dos bombe ou l'écran se décolle, arrêter de charger et recycler ; risque d'incendie [source: https://gelius.ua/en/blog/kak-uznat-naskolko-iznoshena-battery-na-andriod/].
- Remplacement : retrait de l'écran/dos collé, nappe connecteur ; sur iFixit un remplacement sans charge venait d'un pack défectueux ou du port micro-USB [source: https://es.ifixit.com/Respuestas/Ver/671707/I'm+missing+something+simple]. Pour un banc de test branché en permanence, mieux vaut retirer la batterie gonflée ; mais la carte peut refuser de démarrer sans batterie **[connaissance, à tester]**.

## 3. ROM et noyaux

| Option | Android | État | Remarque |
|---|---|---|---|
| Stock LMY47V | 5.1.1 | dernier officiel [source: computerbase.de forum] | GPU/Bluetooth stables, lent à cause des services Google |
| LineageOS 14.1 non officiel (grouper, XDA) | 7.1 | le plus utilisé ; builds jusqu'en 2020-2021 [source: https://xdaforums.com/t/guide-tutorial-howto-google-nexus-7-2012-stock-to-android-7-1.4236959/] | partition /system ~650 Mo : gapps `pico` trop gros, prendre « Beans » ou rien [source: https://diarium.usal.es/pmgallardo/2018/10/21/how-to-install-lineageos-14-1-on-nexus-7-2012/] |
| LineageOS 13 (6.0) | 6.0 | ancien officiel | **[connaissance]** |
| Android 8/9/10 | - | **[non trouvé]** ; l'auteur du guide XDA déconseille 8/9 : instable [source: guide XDA ci-dessus] | le GPU Tegra 3 n'a plus de pilote propriétaire récent |
| /e/OS | - | page « grouper » existe, appareil non maintenu [source: https://community.e.foundation/t/asus-nexus-7-2012-grouper/10311] | |

- Sources du noyau LineageOS 14.1 grouper : `kernel/asus/grouper` (utilisé aussi par DivestOS) [source: https://git.hackliberty.org/Git-Mirrors/DivestOS/commit/6746942f3017ba1323914001ce16f8b7c387c701].
- Noyaux historiques sur XDA : Trinity (Morfic, jusqu'à 1,6 GHz) [source: https://liliputing.com/overclock-the-google-nexus-7-with-a-custom-kernel/ ; https://refu-archive.kevquirk.com/RefuGeeks/nexus-7-gets-overclocked-to-1-64-ghz-all-thanks-to-trinity-kernel], Omega (1,6 GHz, interface d'OC du GPU, nombreux gouverneurs) [source: https://forum.xda-developers.com/showthread.php?p=36565507], M-Kernel (deadline par défaut) [source: https://forum.android.com.pl/topic/125327-44-m-kernel-a67-wifi3g-11114], Elite [source: https://pocketnow.com/elite-kernel-super-powers-nexus-7]. Ces noyaux ciblent 4.2-4.4 ; ElementalX, franco, Code_Blue pour grouper : **[non trouvé]**, ne pas supposer. Aucun n'a été confirmé maintenu en 2026.
- Choix recommandé : LineageOS 14.1 non officiel + son noyau 3.1 ; pas de noyau tiers sauf besoin d'OC/sysfs.
- GPU : ULP GeForce du Tegra 3 = GLES 2.0 uniquement, pilote propriétaire NVIDIA limité à Android 4.x-7.x. Pas de GLES 3 **[connaissance, cohérent avec AnandTech: https://www.anandtech.com/show/5072]**. Extensions utiles à prévoir : textures NPOT limitées, pas de `half_float` fiable, pas de depth texture en 4.x **[connaissance]** : à tester avec `zinc doctor`.
- NEON : Tegra 2 n'en avait pas, Tegra 3 l'a (MPE) [source: https://www.anandtech.com/show/5072]. Compiler en `armeabi-v7a` avec `-mfpu=neon -mfloat-abi=softfp` (`hard` non supporté par la bionic Android 4.x/5.x) **[connaissance]**. VFPv3-D32 présent.

## 4. Réglages de performance (XDA)

Les chiffres exacts ci-dessous sont **[connaissance]** sauf mention ; valider chaque réglage par mesure. Aucun fil XDA zram/minfree spécifique à grouper n'a été trouvé.

- CPU : gouverneur `interactive` (défaut) ou `performance` pour des mesures reproductibles :
  ```sh
  for c in /sys/devices/system/cpu/cpu[0-3]; do echo performance > $c/cpufreq/scaling_governor; done
  ```
  Les cœurs se coupent (hotplug `tegra_hotplug`/`mpdecision`-like) : pour un banc, bloquer `min_cpus` ou écrire `echo 1 > cpu1/online` ; fréquence max stock 1,3 GHz (1,2 GHz quand 4 cœurs actifs) ; la T30L plafonne plus bas que la T30 **[connaissance]**.
- E/S : `echo deadline > /sys/block/mmcblk0/queue/scheduler` (ou `noop`) ; `echo 512 > .../queue/read_ahead_kb` ; plusieurs noyaux XDA fixent deadline par défaut [source: M-Kernel, lien ci-dessus]. `row`/`fiops` : seulement si le noyau les contient.
- Swap/zram : 1 Go de RAM ; zram ~128-256 Mo (`swappiness` 60-100) aide en multitâche mais coûte du CPU ; non pertinent pour une app plein écran unique.
- lowmemorykiller : relever `/sys/module/lowmemorykiller/parameters/minfree` (ex. `1536,2048,4096,8192,10240,12288` pages) pour garder plus de RAM libre.
- Animations : Options développeur, mettre échelles animation/transition/durée à 0 (ou `settings put global window_animation_scale 0`).
- Bloat : `pm disable-user 0 <pkg>` pour les services Google (Play Services, Chrome, Google App), ou ROM sans gapps. Launcher minimal.
- Overclock : 1,6-1,7 GHz CPU (Trinity/Omega), GPU 520+ MHz via interface noyau ; risques : tensions, chaleur, plantages, usure batterie ; 1,8-2 GHz instable [source: https://www.geeky-gadgets.com/google-nexus-7-tablet-tegra-3-processor-overclocked-to-2ghz-27-08-2012/]. « Franco kernel » pour grouper et « GPU 520 MHz » : **[non trouvé]**.
- Overlays matériels : `service call SurfaceFlinger 1008 i32 1` (désactiver HW overlays) ; effet nul pour un GL plein écran ; **[connaissance]**.
- Thermique : tablette passive, plafonne ~ 70-80 °C ; surveiller `/sys/class/thermal/thermal_zone*/temp`.

## 5. Exécuter une app native

### Binaire en shell root
- Cible : ELF `armeabi-v7a`, lié contre la bionic de la ROM (ou statique avec musl/glibc statique). Pousser vers `/data/local/tmp`, `chmod 755`, lancer via `adb shell su -c`. `/data` est parfois monté `noexec` sur les ROM récentes ; `/data/local/tmp` reste exécutable **[connaissance]**.
- Écran sans framework : `adb shell su -c "stop"` arrête zygote/SurfaceFlinger ; puis EGL direct via `/dev/graphics/fb0` avec l'EGL NVIDIA (`libEGL_tegra.so`) et `fbdev`/`FBDEV_PLATFORM` : le chemin `eglCreateWindowSurface` avec `NativeWindowType` fbdev n'est pas documenté dans mes sources ; **[non trouvé]**. Alternative fiable : garder SurfaceFlinger et lancer l'app comme APK `NativeActivity` (`android_native_app_glue`, EGL standard), ou lancer le binaire depuis un shell en créant une surface via `libgui`/`ANativeWindow` (dépend de la version d'Android, fragile).
- Entrée tactile : `/dev/input/event*` (lecture brute avec `getevent`) quand le framework est arrêté.
- Plan pragmatique pour Zinc : (a) APK NativeActivity pour la voie rapide ; (b) un `zinc agent` en root avec le framework arrêté, seulement si le fbdev EGL de NVIDIA est confirmé par un test.

### Linux mainline
- postmarketOS : `asus-grouper` (armv7, Tegra 3 T30L), statut « testing » [source: https://wiki.postmarketos.org/wiki/Nvidia_Tegra_2/3/4].
- Noyau mainline + firmware ajoutés (commit pmaports !933) : USB, Wi-Fi (IWD), Bluetooth, tactile, rotation, capteur de lumière, NFC fonctionnent ; **3D non fonctionnelle**, GPS, GSM (tilapia) et caméra non fonctionnels ; mesa-git en attendant `mesa-grate-git` [source: https://gitlab.postmarketos.org/postmarketOS/pmaports/-/commit/6ed77fd5fddc86fe3364baf430e90ede0bc662c8]. Commit non daté, rien de plus récent trouvé.
- Pilotes libres : le projet « grate » (Mesa/Gallium pour Tegra 2/3, GPU ULP GeForce) est le chemin 3D sur mainline ; état de maturité non vérifié **[non trouvé]**. Sans 3D, une app Zinc passerait par le rendu logiciel (llvmpipe) : trop lent pour un usage UI fluide sur A9 1,3 GHz **[connaissance]**.
- Ubuntu Touch : port « grouper » ancien (noyau 3.1 Android), non maintenu **[connaissance, non vérifié]**.
- Conclusion : pour utiliser le GPU, rester sur Android + pilote NVIDIA propriétaire.

## Pistes à valider sur l'appareil (par priorité)
1. `manfid`/`name`/`cid`, dd avant/après fstrim, `dmesg | grep -i mmc`.
2. `dumpsys battery` + sysfs batterie ; inspection visuelle du gonflement.
3. Version Android installée, `getprop ro.build.fingerprint`, `grep -E 'neon|vfp' /proc/cpuinfo`, `dumpsys SurfaceFlinger | grep GLES`.
4. Test minimal d'un binaire GLES2 en NativeActivity ; mesurer fps, températures sous charge 10 min.

## Sources principales
- https://www.tomshardware.com/uk/news/Nexus-7-eMMC-controller-fstrim-TRIM-garbage-collection,23751.html
- https://www.droid-life.com/2013/07/30/original-nexus-7-performance-issues-fixed-in-android-4-3/
- https://www.phonearena.com/news/Your-old-Nexus-7-running-slow-Android-4.3-brings-a-fix_id45816
- https://www.anandtech.com/show/6073/the-google-nexus-7-review/6 et https://www.anandtech.com/show/6130
- https://www.xda-developers.com/speed-up-your-aging-nexus-7-2012s-storage-with-f2fs/
- https://xdaforums.com/t/guide-tutorial-howto-google-nexus-7-2012-stock-to-android-7-1.4236959/
- https://diarium.usal.es/pmgallardo/2018/10/21/how-to-install-lineageos-14-1-on-nexus-7-2012/
- https://www.anandtech.com/show/5072 (Tegra 3, NEON)
- https://wiki.postmarketos.org/wiki/Nvidia_Tegra_2/3/4 et le commit pmaports 6ed77fd5
- https://forum.xda-developers.com/showthread.php?p=36565507 (Omega), https://liliputing.com/overclock-the-google-nexus-7-with-a-custom-kernel/ (Trinity)
