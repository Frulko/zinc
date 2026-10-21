# Toumei C800 (mini projecteur Android 4.4) : récupération et cible Zinc

Date : 2026-10-18, demandé par le propriétaire (« c'est un vieux produit chinois, faut qu'on puisse l'améliorer »). Tout a été fait sur l'appareil par adb réseau, rien n'a été flashé. Fichiers voisins : `toumei-c800-api19.sh` (rend un export Android de Zinc compatible API 19), `toumei-c800-api19-shim.c` (les fonctions de la libc qui manquent).

## 1. L'appareil

| | |
|---|---|
| SoC | Rockchip RK3128, 4x Cortex-A7 (1,2 GHz annoncés, 816 MHz en pratique, voir §4) |
| GPU | Mali-400 MP2 (deux cœurs pixel), OpenGL ES 2.0 seulement, 200/297/400 MHz |
| Système | Android 4.4.4 (API 19), build `TM-A3-20170812`, noyau 3.10.0 du 2017-08-04, armeabi-v7a |
| Mémoire | 1 Go, zram de 64 Mo active, KSM actif |
| Stockage | eMMC, /data 1,9 Go |
| Écran | dalle LVDS 854x480 (fb0 : 32 bpp, 3 tampons de 864x1440) ; les apps voient 1280x720 (`sys.ui.fakesize`), densité 160 |
| Entrées | mini clavier 2,4 GHz en USB (`/dev/input/event3` : clavier, `event4` : flèches), télécommande IR (`event1`) |

Accès :

- `adb connect 192.168.2.39:5555`. adbd tourne déjà en root (uid 0), sans autorisation à l'écran ; `persist.adb.tcp.port=5555` le garde après un redémarrage.
- **Il n'y a pas d'adb par USB.** Tout ce qui coupe le wifi ou adbd oblige à intervenir physiquement sur le boîtier.
- /system se remonte en écriture, /data n'est pas `noexec`, `/dev/graphics/fb0` est accessible en écriture en root. On y trouve libEGL, libGLESv2, libgui, libui, `gralloc.rk30board`, `hwcomposer.rk30board`.
- **Piège :** `adb shell stop` puis `start` a redémarré Android et perdu le wifi : il a fallu débrancher le projecteur. Ne jamais arrêter le framework, dessiner par-dessus.
- `zbench` exige exactement un appareil adb : déconnecter le projecteur (`adb disconnect 192.168.2.39:5555`) avant un bench sur un autre appareil Android.

## 2. Allègement fait (désactiver, ne rien supprimer)

Consigne du propriétaire : garder Android, le wifi (pour adb), la souris et le clavier ; aucun service Google n'est utilisé ; on désactive, on ne supprime rien.

- Désactivés par `pm disable` : `com.en.dangbeimarket` (5 processus permanents, dont des moniteurs), tous les `com.google.android.*` (gms, gsf, gsf.login, backuptransport, configupdater, feedback, onetimeinitializer, partnersetup, syncadapters calendar et contacts, youtube.tv), `com.android.vending`, `com.netflix.mediaclient`, `com.ionitech.airscreen`, `com.hpplay.happyplay.aw`, `android.rockchip.update.service`. Revenir : `adb shell pm enable <paquet>`.
- Mémoire libre + cache : 504 Mo avant, 753 Mo après. Redémarrage vérifié : Android repart en 28 s, le wifi, adb, le launcher et le clavier (`com.android.inputmethod.latin`, celui d'AOSP) reviennent seuls.
- Animations à 0,5 (`settings put global window_animation_scale|transition_animation_scale|animator_duration_scale 0.5`).
- Déjà bien réglé : `wifi_sleep_policy=2` (le wifi ne dort jamais), écran jamais éteint, zram, KSM.
- Non fait : agrandir la zram (aucun point d'accroche au démarrage : pas d'`init.d`, les `.rc` sont dans le ramdisk) ; `ro.config.low_ram` (fait pour 512 Mo, coupe des accélérations) ; changer le launcher (`com.lsm.appleuilauncher`, un clone d'iOS ; Launcher3 est installé mais se pilote mal à la télécommande).

## 3. Faire tourner Zinc (API 19)

`zinc export --target android` vise minSdk 24 (`next/src/cli_core.cpp`, `kMinSdk` : libuv appelle `pthread_barrier_*`, présent dans bionic depuis l'API 24) et SDL3 vise 21. Le NDK 29 ne descend pas sous 21. L'APK SDL normal tourne quand même sur 4.4 avec quatre changements, appliqués par `toumei-c800-api19.sh apply <export>` :

1. **Gradle** : `minSdkVersion 19`, natif en `android-21`, `android.ndk.suppressMinSdkVersionError=21`, armeabi-v7a seulement, et `-D__ANDROID_UNAVAILABLE_SYMBOLS_ARE_WEAK__` pour le C et le C++ (sans ça, `getifaddrs` de `sys_host.cpp`, API 24, ne compile pas ; libuv l'a déjà).
2. **`api19_shim.c`** : les 61 fonctions qu'un binaire au niveau 21 importe et que la libc 4.4 n'a pas, trouvées avec `toumei-c800-api19.sh check` (llvm-nm de `libmain.so` contre les `.so` du projecteur). Appels système non enveloppés (`accept4`, `dup3`, `epoll_create1`, `epoll_pwait`, `inotify_init1`, `recvmmsg`, `sendmmsg`, `sendfile64`), fonctions autrefois en ligne dans les en-têtes (`signal`, `sig*set`, `rand`, `atof`, `__cmsg_nxthdr`, `__ctype_get_mb_cur_max`), locales `*_l` de libc++, multioctet (`mbsnrtowcs`, `wcsnrtombs`), plus des définitions pour les références faibles qui seraient appelées (`fopen64`, `getifaddrs`, `iconv`). Il ne reste que `posix_spawn*` et `__cxa_thread_atexit_impl`, faibles et jamais appelés par une app.
3. **SDL Java** : `SDLSurface` implémente `View.OnApplyWindowInsetsListener` (API 20) et Dalvik rejette alors toute la classe (`VerifyError: SDLActivity`). L'écouteur passe dans une petite classe `SDLInsets20`, chargée seulement à partir de l'API 20.
4. **`ZincActivity`** : `setStatusBarColor` et `setNavigationBarColor` (API 21) sous `SDK_INT >= 21`.

Résultat : `examples/bouncing-ball` tourne sans changement de code. `libmain.so` est accepté par le chargeur 4.4 (il garde une table `DT_HASH`), la fenêtre s'ouvre en 510 ms.

Limites connues du correctif : `pthread_condattr_setclock` est ignoré, donc les attentes avec délai sur une condition libuv suivent `CLOCK_REALTIME` ; seule la locale « C » existe ; `pthread_gettid_np` ne répond juste que pour le thread appelant ; `wcstoll` n'accepte que l'ASCII. Seul `bouncing-ball` a été essayé : une démo UI (HarfBuzz, layout) ou avec du son peut importer d'autres fonctions, et `check` les liste.

Hors APK : un ELF ARMv7 nu compilé au niveau 21 (`clang --target=armv7-none-linux-androideabi21`) s'exécute aussi depuis `/data/local/tmp`, et `/dev/graphics/fb0` s'écrit directement (test rouge/vert/bleu vu à l'écran, framework arrêté : c'est ce test qui a fait perdre le wifi). Un `simpleperf` du NDK 29 ne se charge pas (`DT_HASH` absent).

## 4. Performances

Méthode : nombre d'images par seconde tiré de `adb shell dumpsys SurfaceFlinger --latency SurfaceView` (les 127 dernières images, horodatées par le compositeur) ; détail par étape avec `--es zinc.env "'ZINC_PRESENT_STATS=1'"` (p50/p99 sur 120 images, dans logcat) ; charge créée en maintenant la touche Haut du mini clavier (`sendevent /dev/input/event3 1 103 1; sendevent /dev/input/event3 0 0 0`, puis la valeur 0 pour relâcher ; `input keyevent` n'est pas vu par la démo). La démo ajoute 100 balles par image tant que la touche est maintenue.

`bouncing-ball` en 1280x720 :

| Mode | 1 balle | forte charge |
|---|---|---|
| Logiciel, présentation dans le tampon de la fenêtre (défaut Android) | 18 | 28 (~14 400 balles) |
| Logiciel, `ZINC_PRESENT=shadow` | 18 | |
| Logiciel, `ZINC_PRESENT=565` | 34 | |
| Logiciel, `ZINC_PRESENT=texture` | **59** | 26,5 (~9 400 balles : raster 16,6 ms, upload 11,9 ms) |
| GPU, `ZINC_RENDERER=gl` | 52 (draw 12 à 17 ms) | 26 (~15 900 balles : raster 27 ms, draw 0,6 ms) |

Même APK sur le Nexus 7 2012 (Tegra 3, Android 7.1.2), 1 balle : logiciel ~48 images/s (intervalle p50 20,7 ms), GPU ~41 (24,3 ms).

Ce que ça montre :

- **Le rendu logiciel n'est pas lent, c'est sa présentation qui l'est.** Avec une balle, la rastérisation coûte 0,5 ms. Le défaut Android (`anw_present` dans `targets/macos/hal_sdl.cpp`, ZN-743) dessine dans le tampon de la fenêtre via `ANativeWindow_lock`. Sur ce RK3128 sous 4.4, ce tampon est en mémoire non cachée, et le verrou recopie toute la zone non modifiée depuis le tampon précédent. Dessiner ailleurs d'abord (`shadow`) ne change rien, diviser les octets par deux (`565`) double le débit, passer par une texture GL monte à 59. Sur le Nexus 7, ce même chemin est le plus rapide, et c'est pour lui qu'il a été choisi.
- **L'écart avec le Nexus 7 ne vient pas du même test.** Les 89 ms (GPU) contre 15 ms (logiciel) relevés sur le Nexus 7 (commentaire de `hal_sdl.cpp`, ZN-622) portaient sur `rn-showcase` : texte, formes arrondies, ombres, donc des shaders que le GPU du Tegra 3 exécute mal, alors que le rendu logiciel ne redessine que ce qui change. `bouncing-ball` ne dessine que des rectangles pleins. Le coût des shaders de Zinc sur le Mali-400 avec une vraie interface n'est pas mesuré.
- **Sous forte charge, c'est le processeur qui limite** (~1,7 µs par rectangle sur un A7 à 816 MHz) ; le GPU reste presque à 0 % d'utilisation (`/sys/devices/10091000.gpu/utilisation`), et le fixer à 400 MHz ne change rien (`dvfs_enable=0`, `clock=400000000` : 52,3 contre 51,5 images/s).
- **Le processeur reste à 816 MHz** quel que soit le gouverneur (`performance` ou `userspace` à 1 200 000 donnent 816 à 1008 MHz ; `time_in_state` depuis le démarrage : 816 MHz 1 032 s, 1008 MHz 118 s, 1200 MHz 3,7 s). C'est le DVFS Rockchip (`rockchip_pm policy=1`), probablement une protection thermique dans un boîtier fermé chauffé par la lampe [non vérifié : aucun capteur de température exposé]. Non forcé.
- **Résolution truquée** : les apps dessinent en 1280x720 et SurfaceFlinger réduit au GPU vers 854x480 (composition `GLES`, pas d'overlay). Les propriétés `persist.sys.keystone.*` laissent penser que cette passe sert à la correction trapézoïdale [non vérifié]. `sys.ui.fakesize` n'est défini dans aucun fichier lisible (fixé par un binaire). `wm size 854x480` ne donne pas le mode natif : l'image est réduite à 570x320 (GPU 58,9 images/s, logiciel 37,7, avec moins de pixels). Remis par `wm size reset`.

## 5. Pistes

- **Choisir le mode d'affichage par appareil**, pas par système : sur ce projecteur, logiciel + `ZINC_PRESENT=texture` (rendu identique au pixel, 59 images/s à vide), sur le Nexus 7 la présentation directe. Une mesure courte au premier lancement pourrait décider.
- Mesurer `rn-showcase` sur le projecteur dans les deux moteurs de rendu, pour savoir ce que coûtent les shaders de Zinc sur un Mali-400.
- Dessiner directement en 854x480 (taille du tampon de la surface) pour retirer la réduction de SurfaceFlinger, sans toucher à la ROM.
- Le coût par rectangle sur les petits ARM (regroupement, NEON) : c'est ce qui limite sous charge, et ça profiterait à toutes les cibles faibles.
- Porter `kMinSdk` à 19 dans l'export, derrière une option, avec ce correctif et les gardes Java : ça ouvrirait les box TV et projecteurs Android 4.4.
- Long terme, non essayé : Armbian pour les boîtiers RK3128 (noyau 6.6 + Lima, https://github.com/chieunhatnang-personal/RK3128-Linux-SupportingScripts). Il remplace U-Boot (pas de double démarrage avec Android), ses images pilotent le HDMI alors que ce boîtier a une dalle LVDS (timings dans `/proc/device-tree/display-timings`), et la récupération passe par le mode maskrom en USB OTG, avec des points à court-circuiter sur la carte. Aucun firmware alternatif connu pour le C800 ; un firmware C800 flashé sur un modèle cousin (E05) s'éteint aussitôt avec une erreur « batterie critique ».

## Sources

- Armbian RK3128 : https://forum.armbian.com/topic/59146-armbian-for-rk3128-tvbox-board/ et https://chieunhatnang.de/p/building-armbian-for-rockchip-rk3128-part-2/
- Firmware C800 sur un E05 : https://forum.earlybird.club/threads/e05-dlp-mini-rk3128-android-4-4-2-projector-firmware-fix-help-needed.1314833/post-7919809
- Configuration « low RAM » de KitKat : https://essential-books.onrender.com/essential/android/low-ram-configuration-f85c92460b5c4c128d0fb84b7a9cc509.html
