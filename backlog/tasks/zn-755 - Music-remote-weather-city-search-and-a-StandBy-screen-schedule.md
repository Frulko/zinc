---
id: ZN-755
title: 'Music remote: weather city search, and a StandBy screen schedule'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-17 08:46'
updated_date: '2026-10-17 10:18'
labels:
  - mobile
  - ui
  - size-M
milestone: m-26
dependencies: []
ordinal: 196100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-17, examples/music on the Nexus 7: in the settings, the weather's city through a search field and a list of results (Open-Meteo geocoding, debounced, city/region/country), stored in config.json; the screen goes off after the settings' delay, and on the clock slide after 2 minutes, then wakes for a moment every 5 minutes (iOS StandBy's manner), notifications waking it too (ZN-758). Design: ../docs/reports/notification-relay-design.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the settings' city search finds and stores a city; the weather slide shows it (a scripted session on the desktop, and on the Nexus 7)
- [x] #2 the clock slide's schedule: off at 2 min, a wake every 5 min, measured on the Nexus 7 through dumpsys window brightness
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-17 (worktree agent).

What the user sees: Réglages has a MÉTÉO card ('Ville : X', '(d'après la connexion)' while the ip-api fallback is used) with a 'Choisir' pill; it opens 'Ville de la météo': a search field typed on the app's AZERTY keyboard (or a desktop keyboard), the towns found 300 ms after the last key (Open-Meteo geocoding, count=8, language=fr), each row the town, 'region, country' and the country code as a badge (no flag emoji: the bundled fonts have no flags on every target), a check on the current town; a touch stores lat/lon/city in config.json (existing keys), reads the forecast again at once and toasts 'Météo : X'. 'Annuler' or leaving the page closes it. On the clock slide the screen goes off after 2 min whatever the settings' delay (unless 'Jamais'), then lights for 10 s every 5 min (start to start), StandBy's way; a touch wakes it as before. The app has no night look, so a glance is the face as is (the backlight is on/off only).

Code: examples/music/src/screen.ts (Screen.standby, Screen.wake(seconds), glance schedule; ZINC_MUSIC_STANDBY=off,every,glance for tests), weather.ts (searchPlaces debounce, geocode with stale answers dropped, foundPlaces/searchState, placeName, ZINC_MUSIC_METEO base URL for tests), main.ts (cityPage, chooseCity, the MÉTÉO card, typed() routes to the city field, searchField takes its text, wakeScreen(seconds): the hook ZN-758's notifications call).

Proofs: tests/t1/music_city_standby.sh (PASS, 11 s): a local server answers as Open-Meteo, l-y-o-n typed on the app keyboard gives ONE geocoding request, Lyon picked, config.json holds it, the forecast is read for 45.74846,4.84671 and the weather slide names Lyon; on the clock with 2,4,1 s: lit at 440, black at 460 and 760 (same picture), the glance at 700 and 940 shows the clock of 440.
Nexus 7, release APK (zinc export examples/music --target android --apk --release --abis armeabi-v7a, 16.2 MB, adb install -r, data kept): typed 'cham' then 'chambé' on the app keyboard, the list showed Cham DE/CH, ... then Chambéry FR with the check (the owner had chosen it meanwhile), picked it, settings 'Ville : Chambéry', weather slide Chambéry. Schedule on the clock slide (lava face), dumpsys window sbrt polled every ~2.4 s + logcat: last touch 12:09:06.3, sbrt=0.0 from 12:11:06.6 (120.3 s), lit again 12:16:06.6 (300.0 s after the off) for ~10 s, sbrt=0.0 again; the next wake was the owner's touch (MotionEvents 12:16:19.8). App left in front on the clock slide.

Seen on the way: zinc export --apk with a relative -o fails after gradle at the 16 KB check (cli_core.cpp checkPages runs unzip in the output dir with the relative APK path); the APK itself is built.
<!-- SECTION:NOTES:END -->
