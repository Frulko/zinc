# CarPlay : données iAP2 exploitables et envoyables

État du 29 octobre 2026, vérifié contre le récepteur de cette branche, les
extraits officiels fournis dans `/Users/mowmow/Downloads/carplay-specs/` et les
présentations Apple citées ci-dessous. **Catalogue** signifie qu'un identifiant
est connu ; cela ne veut pas dire que l'iPhone l'envoie, que son schéma complet
est connu, ou que Zinc sait exécuter l'action. Les traces de l'iPhone priment.

## Où passe chaque donnée

- USB : iAP2 sur USBMUX, puis AirPlay vidéo/audio sur NCM.
- Sans-fil : iAP2 sur Bluetooth classique sert à l'identification et aux
  paramètres Wi-Fi ; une fois le Wi-Fi établi, l'iAP2 de télémétrie passe par le
  tunnel CarPlay/AirPlay. Le Bluetooth n'est pas la voie vidéo.
- Les touches, l'apparence jour/nuit et la vidéo du cluster sont des commandes
  ou flux AirPlay, **pas** des messages de télémétrie iAP2.
- Le téléphone n'envoie pas tout spontanément : l'accessoire annonce ses
  identifiants RX/TX dans `IdentificationInformation` et démarre les flux de
  mises à jour qui ont un abonnement.

Le PDF officiel `carplay.pdf` §23.2.7 (pages imprimées 409–411) décrit la
séparation USB/Bluetooth/tunnel, les données d'apps et la localisation. Apple
confirme que l'interface native du véhicule peut utiliser les métadonnées iAP2
de navigation, musique et appels, y compris dans un affichage tête haute :
[WWDC23](https://developer.apple.com/videos/play/wwdc2023/10150/),
[WWDC19](https://developer.apple.com/videos/play/wwdc2019/252/).

## Reçu de l'iPhone (RX)

| Famille | Messages et données accessibles | État de Zinc |
|---|---|---|
| État du téléphone | `0xAE01` : batterie/charge et alimentation ; `0x4158` : intensité du signal, enregistrement réseau, mode avion, opérateur ; `0x4E09`–`0x4E0E` : nom, langue, heure/fuseau, UUID, disponibilité CarPlay sans fil, identifiants de transport | Abonnements alimentation et communications envoyés ; le Pi a reçu `AE01` cinq fois, `4158`, `4E0D` et `4E0E` au moins une fois. Schémas décodés dans la trace, mais chaque champ n'est pas garanti présent ; pas encore de panneau d'état synthétique. |
| Appels | `0x4155` : interlocuteur/nom, état, sens, UUID d'appel, motif de fin | Abonnement envoyé ; un message reçu sur le Pi. Les champs sont décodables dans la trace ; affichage et commandes d'appel natifs à faire. |
| Média | `0x5001` : titre, artiste, album, durée, position, lecture/pause, nom de l'app et identifiant de pochette ; transfert séparé de l'image | Confirmé en direct avec Spotify ; HUD et pochette visibles. Les messages sont des mises à jour partielles. |
| Navigation | `0x5201` : source, état d'itinéraire, destination, route, distances, ETA, manœuvres actives ; `0x5202` : instruction et type de manœuvre ; `0x5204` : voies | Apple Plans confirmé avec guidage complet. Le cluster vidéo est un flux distinct. Le HUD décode route/manœuvre ; la trace sait nommer les voies. |
| CarPlay/transport | `0x4300` : disponibilité filaire/sans-fil ; acceptation ou refus de l'identification et de l'authentification | Reçu lors des démarrages USB ; la trace signale le cycle de vie. |
| Demande de GPS | `0xFFFA` démarre et `0xFFFC` arrête la localisation externe, avec sélecteurs de phrases | Reçu ; Zinc affiche les sélecteurs et ses compteurs d'envoi. L'usage effectif des positions par Plans reste à valider. |

Les noms de champs ci-dessus suivent les schémas actuellement codés dans
`plugins/carplay/backend/usb/protocol/Iap2TelemetrySchema.kt` et le catalogue
du récepteur. Les extraits officiels fournis ne contiennent pas les chapitres
complets des paramètres `AE01`, `4158` et `4155` : leurs formats et valeurs
doivent encore être confrontés à des traces réelles avant une UI définitive.

### Ce que démontre Waze

La trace fournie contient `0x5201 componentId=42, state=0`, puis
`sourceName="Waze", sourceSupportsGuidance=0`. Le téléphone nomme donc Waze
comme source, mais indique qu'elle **ne fournit pas de guidage à l'accessoire**
dans cette session. Une carte Waze visible en vidéo ne permet pas d'en déduire
des manœuvres iAP2. Sur ce téléphone : Plans a fourni des données complètes,
Google Maps des données partielles, Waze uniquement l'identification de source.
Cela dépend aussi de l'app et de la session ; il faut afficher l'état reçu sans
inventer une direction.

## Envoyé vers l'iPhone (TX)

| Famille | Messages ou commande | État de Zinc |
|---|---|---|
| Identité et confiance | `0x1D01` identité/composants/capacités, `0xAA01` certificat et `0xAA03` réponse au défi | Fonctionnel en USB avec l'identité externe fournie. Sur le Pi, RFCOMM et authentification iAP2 ont abouti ; la projection sans fil reste à vérifier. |
| Départ CarPlay | `0x4301` adresse/port et identité de session, en réponse à `0x4300` ; `0x5703` configuration du Wi-Fi sans fil (SSID, mot de passe, canal, sécurité) | `4301` confirmé en USB. Sur le Pi, `5703` est parti deux fois mais aucun `4300` ni `4301` n'a été observé ; l'invitation CarPlay sur Wi-Fi reste à diagnostiquer. Les secrets sont masqués dans la trace de cette version. |
| Abonnements | `0x5000` média, `0x5200` guidage, `0xAE00` alimentation, `0x4157` communications, `0x4154` appels ; messages d'arrêt correspondants | Zinc annonce et envoie les cinq démarrages ; l'inspecteur montre les comptes TX/RX. Un abonnement ne force pas une app à fournir des champs. |
| GPS externe | `0xFFFB` phrases NMEA demandées par l'iPhone | Presets, coordonnées manuelles et GPX alimentent l'émetteur ; des écritures iAP2 réussies sont comptées. Le mode GNSS exigé par le PDF officiel pour le sans-fil n'est pas encore prouvé. |
| Alimentation | `0xAE03` courant disponible/charge | Émis avec la puissance annoncée ; pas un moyen de forcer le niveau de batterie du téléphone. |
| Contrôles média/appels | Le catalogue connaît `0x5003 SetNowPlayingInfo`, les commandes de bibliothèque média et des fonctions d'appel | Pas d'UI ni d'implémentation validée pour ces actions ; ne pas envoyer de TLV conjecturaux. Les boutons Play/Pause/Précédent/Suivant actuels utilisent les contrôles AirPlay/HID. |
| Véhicule | Composants VehicleInformation/VehicleStatus et données de capteurs | Présence déclarative limitée ; aucun simulateur de statut véhicule complet. Les extraits fournis renvoient à des chapitres absents (localisation, Vehicle Status), donc les paramètres ne sont pas inventés. |

L'[inspecteur iAP2](../../examples/carplay/src/components/Iap2Panel.tsx) permet
de filtrer RX/TX, voir le catalogue et les identifiants inconnus observés,
activer une trace détaillée, enregistrer/exporter et composer un TLV pour un
message TX annoncé et non sensible. Les messages d'authentification et les
secrets Wi-Fi sont masqués. La trace peut être activée par l'UI ou par
`ZINC_CARPLAY_IAP2_TRACE=1` au démarrage du récepteur. Les compteurs restent
visibles sans trace détaillée.

## Limites et prochain niveau de preuve

Les huit PDF fournis sont des extraits : `carplay.pdf` ne contient pas les pages
637–638 (GNSS), 718 (Vehicle Status), 743–746 (Apple Device IE), 877 (Wi-Fi
configuration) ni la description complète de chaque message. Il est donc
impossible de garantir « tous les messages iAP2 » à partir de ces sources.
L'inspecteur montre aussi les identifiants inconnus réellement reçus, avec leur
corps borné, pour étendre le décodeur à partir de preuves. Les données sensibles
d'appel, d'identité et de réseau ne doivent pas être enregistrées par défaut.

À vérifier sur téléphone : contenu réel de `AE01`, `4158`, `4155` après
abonnement ; comportement jour/nuit du flux cluster après redémarrage du
récepteur ; acceptation du GPS externe, notamment en sans-fil ; reprise de
session sans nouvel accord de confiance ; projection AirPlay via l'AP du Pi.
Le 29 octobre au matin, le Pi avait un lien iAP2 authentifié, cinq abonnements
et une station Wi-Fi à `10.77.0.162`, mais aucune connexion RTSP vers `17000`.
Une requête PTR `_airplay._tcp.local` envoyée sur `ap0` a reçu la réponse
Bonjour `PlayPort Pi` depuis `10.77.0.1` ; l'annonce locale répond donc.
Une capture de 18 secondes a vu du mDNS émis par la station, sans connexion
RTSP ; une seconde capture de 10 secondes n'a vu aucune recherche `_airplay`.
Ces fenêtres courtes ne suffisent pas à conclure que l'iPhone ne découvre
jamais le service.
Le récepteur attend encore une disponibilité `0x4300` avant d'envoyer `0x4301`
sur le lien Bluetooth. Apple décrit ensuite une découverte Bonjour et une
invitation CarPlay côté accessoire [WWDC17](https://developer.apple.com/videos/play/wwdc2017/717/) ;
il faut déterminer sur quel transport cette étape manque, sans forcer un
`0x4301` au hasard.
