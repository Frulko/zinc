# CarPlay : modes, lancement et dépannage

État vérifié le 29 octobre 2026. Ce guide concerne le récepteur expérimental et le lecteur Zinc du dépôt. Il permet de choisir un mode, lancer le montage Mac/Pi existant et comprendre les limites observées.

## Choisir le montage

Le transport et le profil d’affichage sont deux choix indépendants.

| Choix | État vérifié |
| --- | --- |
| USB, récepteur et lecteur sur Mac | Session physique iPhone, vidéo et audio testés |
| Sans-fil, récepteur sur Pi et lecteur sur Mac | Session physique iPhone, vidéo et audio testés ; stabilité dépendante du réseau et de l’alimentation |
| Sans-fil, récepteur sur Mac | Chemin disponible dans le code ; pas de validation équivalente au montage Pi |
| USB, récepteur sur Pi | Non pris en charge par le lanceur actuel |
| CarPlay classique | Projection, commandes, audio et télémétrie selon l’app iPhone |
| CarPlay Ultra | Expérimental : négociation, Vehicle State, UI Sync et catalogue de thème ; composition native complète non réalisée |

Un processus récepteur utilise **USB ou sans-fil**. Il refuse de combiner `--usb` et `--wireless`. Il n’y a pas de bascule automatique entre ces transports. Le lecteur Mac se connecte au récepteur par WebSocket dans les deux cas.

Les essais Ultra les plus récents ont été réalisés en sans-fil sur Pi. La présence des mêmes options dans le récepteur USB ne constitue pas une validation complète de chaque combinaison.

## Prérequis du récepteur

Depuis la racine du dépôt :

```sh
plugins/carplay/backend/build
```

Le backend utilise un JDK 21 ou supérieur ; l’USB Mac nécessite aussi libusb et les outils Xcode. Le lecteur utilise le moteur Zinc construit et FFmpeg. Voir les [instructions USB](../../plugins/carplay/backend/usb/README.md) et le [README du plugin](../../plugins/carplay/README.md).

Une identité valide doit être fournie dans `ZINC_CARPLAY_IDENTITY`, avec `offline-mfi/certificate.p7b` et `offline-mfi/identity.pk8`. Ces fichiers ne sont pas inclus dans Git. Le backend utilisé lors des essais fonctionne sans coprocesseur MFi physique avec cette identité ; cela ne permet pas de démarrer sans identité valide.

Les tokens, clés et secrets Wi-Fi des exemples ci-dessous sont à remplacer par ceux de l’installation. Ne pas publier ces fichiers ni exposer le port HTTP sur Internet.

## USB sur Mac

Repérer le téléphone :

```sh
plugins/carplay/backend/run --usb-list
```

Dans un premier terminal, lancer le récepteur classique :

```sh
sudo env JAVA_HOME="$(/usr/libexec/java_home)" \
  ZINC_CARPLAY_IDENTITY="$HOME/.local/share/zinc/carplay-experiment/identity" \
  ZINC_CARPLAY_USB_SERIAL='SERIAL_IPHONE' \
  ZINC_CARPLAY_ULTRA_THEME='' \
  ZINC_CARPLAY_ULTRA_VEHICLE=0 ZINC_CARPLAY_ULTRA_UI_SYNC=0 \
  plugins/carplay/backend/run --usb \
  --airplay-port 17000 --http-port 18080 --token YOUR_LOCAL_TOKEN
```

Déverrouiller l’iPhone et répondre à la demande de confiance si elle apparaît. Le chemin utilise USBMUX/NCM et une interface réseau virtuelle macOS ; le lecteur reste accessible en boucle locale.

Dans un second terminal :

```sh
ZINC="$PWD/build/zinc" ZINC_BACKGROUND=1 \
  ZINC_CARPLAY_URL='ws://127.0.0.1:18080/ws?token=YOUR_LOCAL_TOKEN' \
  examples/carplay/run --live
```

Arrêter le récepteur avec Ctrl-C. Le lecteur peut être fermé séparément.

## Sans-fil sur le Pi déjà préparé

Ces commandes supposent l’installation existante dans `~/zinc-carplay`, le profil NetworkManager `zinc-carplay-ap`, les droits nécessaires aux helpers et les fichiers privés `~/.config/zinc-carplay/{phone-bt,token,ap-psk}`. Elles ne provisionnent pas un Pi vierge.

Utiliser de préférence Ethernet pour l’administration et réserver le Wi-Fi/Bluetooth à CarPlay. Le Pi doit disposer d’une alimentation stable. `PI_HOST` désigne son adresse accessible depuis le Mac ; une adresse peut changer après un redémarrage.

Terminal de contrôle sur le Mac :

```sh
ssh spark@PI_HOST 'systemctl --user start playport-pi.service'
```

Terminal de logs :

```sh
ssh -t spark@PI_HOST \
  'journalctl --user-unit=playport-pi.service -f -o cat'
```

Le service lance le point d’accès, l’annonce Bluetooth et le récepteur. Ne pas lancer simultanément `start-wireless` à la main. Le service continue après la fermeture du terminal SSH ; le script lancé directement peut être arrêté par la fermeture de sa session.

Pour connecter le lecteur Mac sans rejoindre le point d’accès CarPlay, ouvrir un tunnel dans un troisième terminal :

```sh
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=10 \
  -L 19080:10.77.0.1:18080 spark@PI_HOST
```

Puis lancer le lecteur avec le token privé du récepteur Pi :

```sh
ZINC="$PWD/build/zinc" ZINC_BACKGROUND=1 \
  ZINC_CARPLAY_URL='ws://127.0.0.1:19080/ws?token=YOUR_PI_TOKEN' \
  examples/carplay/run --live
```

Après un reboot du Pi, le tunnel SSH doit être relancé s’il s’est fermé. Un lecteur en reconnexion ne prouve pas que le téléphone a perdu son appairage.

Pour arrêter proprement :

```sh
ssh spark@PI_HOST 'systemctl --user stop playport-pi.service'
```

Fermer ensuite le tunnel avec Ctrl-C. Pour éteindre le Pi :

```sh
ssh spark@PI_HOST 'sudo poweroff'
```

Attendre son arrêt avant de couper l’alimentation. Le service de test n’est pas nécessairement activé au démarrage : vérifier avec `systemctl --user is-enabled playport-pi.service`.

## Activer le profil Ultra

Définir ces variables **sur le récepteur**, avant son démarrage :

```sh
export ZINC_CARPLAY_CLUSTER=1
export ZINC_CARPLAY_ULTRA_THEME='44C9FA31EC:985'
export ZINC_CARPLAY_ULTRA_VEHICLE=1
export ZINC_CARPLAY_ULTRA_UI_SYNC=1
```

Pour un lancement USB sous `sudo env`, les ajouter explicitement aux variables de la commande USB. Une variable exportée dans le terminal Mac ne modifie pas un service systemd déjà lancé sur le Pi.

Sur le Pi, utiliser `systemctl --user edit playport-pi.service` et définir :

```ini
[Service]
Environment=ZINC_CARPLAY_CLUSTER=1
Environment=ZINC_CARPLAY_ULTRA_THEME=44C9FA31EC:985
Environment=ZINC_CARPLAY_ULTRA_VEHICLE=1
Environment=ZINC_CARPLAY_ULTRA_UI_SYNC=1
```

Appliquer avec `systemctl --user daemon-reload`, puis `systemctl --user restart playport-pi.service`. La session iPhone sera interrompue puis devra se reconnecter.

Pour revenir au classique, remplacer les valeurs Ultra par :

```ini
Environment=ZINC_CARPLAY_ULTRA_THEME=
Environment=ZINC_CARPLAY_ULTRA_VEHICLE=0
Environment=ZINC_CARPLAY_ULTRA_UI_SYNC=0
```

Le cluster classique peut rester activé. Vérifier les autres fichiers de surcharge si la configuration effective ne correspond pas au choix.

### Ce qu’Ultra montre actuellement

Le catalogue testé utilise **1920 × 720**. Les essais à 800 × 480 et 984 × 480 ont produit des flux à ces dimensions, mais les éléments de l’interface du thème étaient coupés. **Adapter fenêtre** ajuste la fenêtre Mac sans renégocier le flux ; **Ultra 1920 × 720** restaure la géométrie du catalogue.

Le tableau de bord Zinc compose des jauges locales et, lorsqu’elle est disponible, la carte projetée. Il ne rend pas encore le paquet Local UI authentifié du constructeur. Le sélecteur de thème de l’iPhone peut donc afficher un aperçu que le lecteur ne sait pas reproduire intégralement.

Le profil décrit carburant, pneus, climatisation, sièges, radio simulée et réglages constructeur. Des abonnements et échanges de données ont été observés. Cela ne suffit pas à prouver que chaque app native fonctionne : **Véhicule restait sur son écran de chargement lors du dernier essai**, sans abonnement aux nouvelles valeurs de réglages. Il n’y a ni tuner radio ni actionneur automobile réel derrière les simulations.

Voir le [guide des thèmes et de la composition](carplay-themes.md) et la [référence iAP2](../reports/zinc-next-carplay-iap2-capabilities.md).

## Appairage et état du téléphone

Le panneau **Appareils** du lecteur montre le serveur, le nom et modèle du téléphone, les identifiants disponibles et la batterie lorsqu’elle est reçue. Bluetooth et AirPlay peuvent utiliser des identifiants différents pour le même iPhone.

Le panneau permet de désappairer un enregistrement précis après confirmation et de relancer les invitations. Les traces Bluetooth ne sont inspectables via BlueZ que sur Linux. Pour la CLI et ses conditions d’utilisation, voir le [guide de gestion des appareils](carplay-themes.md#receiver-and-paired-devices-in-the-player).

## Distinguer reboot, relance du service et reconnexion

Sur le Pi :

```sh
uptime
cat /proc/sys/kernel/random/boot_id
systemctl --user show playport-pi.service -p ActiveState -p NRestarts -p Result
vcgencmd get_throttled
journalctl -k -b --no-pager | grep -Ei 'voltage|thrott|watchdog|panic|oom'
journalctl --user-unit=playport-pi.service -n 100 --no-pager -o cat
```

- Un nouvel identifiant de boot et un uptime revenu à quelques minutes indiquent un redémarrage du système.
- `NRestarts` concerne les relances automatiques du service dans son état actuel ; zéro ne prouve pas l’absence de redémarrages du Pi.
- Les messages « re-inviting the iPhone » appartiennent au superviseur CarPlay et ne signifient pas que Linux redémarre.
- `0x50005` indique une sous-tension et un throttling actuels, ainsi que leur occurrence depuis le démarrage. Vérifier l’alimentation et le câble avant de reprendre les essais exigeants.

Le 29 octobre, le Pi avait redémarré, le noyau signalait `Undervoltage detected!`, et CarPlay était inactif avec `NRestarts=0`. Le watchdog matériel était actif avec un délai d’une minute. Les journaux étaient volatils, donc le démarrage précédent n’était pas consultable. **La sous-tension est prouvée ; la cause précise de chaque reboot ne l’est pas.** Une coupure d’alimentation et un reset du watchdog restent à distinguer.

Pour conserver les prochains journaux entre deux boots, configurer journald avec `Storage=persistent` et une taille maximale adaptée à la carte SD, puis redémarrer journald et vider son tampon vers le stockage avec `journalctl --flush`. Cette configuration n’a pas encore été appliquée au Pi pendant ce diagnostic. Ne pas désactiver le watchdog pour masquer le symptôme.
