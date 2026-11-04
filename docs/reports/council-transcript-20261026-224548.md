# Conseil — organisation, positionnement et communication de Zinc

26 octobre 2026. Document de travail, aucune décision de migration ou de marque n'a été exécutée.

## Question d'origine

Rationaliser un grand monorepo en projets Git et livraisons distincts ; construire une organisation, un positionnement, éventuellement un nouveau nom et une communication qui donnent envie de créer des applications pour les appareils sans tout résoudre par un navigateur.

## Question reformulée

Comment rendre Zinc plus lisible et maintenable, déterminer des frontières de dépôts et de livraison réalistes, puis raconter sa valeur aux premiers utilisateurs sans annoncer plus que les résultats vérifiés ? Le projet est une préversion ; le cœur et les paquets distribués sont encore fortement liés. Le public visé inclut makers, éducation et créateurs ; la première audience concrète reste à valider.

## Avis indépendants

### A — Contradicteur / architecture

Le découpage selon un organigramme rêvé peut créer plusieurs dépôts interdépendants avec une CI et des versions à maintenir chacun. CMake compile quirc depuis le plugin caméra, tandis que des sources réseau sont partagées avec le plugin link ; les archives embarquent std, plugins, cibles et runtime. Piloter un plugin peu couplé puis une app. Garder ensemble les éléments qui changent encore ensemble. Tester installation, signatures et compatibilité avec une release identifiée ; préserver les licences et l'historique.

### B — Premiers principes / produit

La valeur est la liberté de fabriquer un outil qui habite un appareil, avec des compétences TypeScript familières. Proposition : « Des idées aux appareils. Créez des applications natives en TypeScript, du bureau aux écrans spécialisés. » Cibler d'abord des développeurs TypeScript expérimentateurs. Montrer un projet Mac et reMarkable seulement après validation. Clarifier sous-ensemble compilé et JavaScript embarqué. Garder Zinc tant qu'un meilleur nom n'a pas été vérifié.

### C — Expansion / communication

Partir du site existant. Montrer le Hub sur une reMarkable et un petit projet reproductible avec code, versions et limites ; ne pas annoncer les validations matérielles encore en attente. Ligne : « construire pour les machines réelles ». Avant un lancement large, faire essayer à cinq à dix personnes extérieures, relever obstacles et temps jusqu'au premier résultat. Traiter les étoiles et vues comme indicateurs secondaires.

### D — Regard extérieur

« Une fois, partout » suggère une compatibilité complète qui ne découle pas des preuves. Un nouvel utilisateur ne sait pas ce que « native » signifie, quels paquets npm sont compatibles ou quelles cibles sont mûres. Il faut un parcours concret, une matrice par version et une phrase distinguant compilation et moteur JavaScript. Le site cherche un titre « 36 modules » alors que le README en affiche « 38 modules », ce qui peut vider la liste à la génération.

### E — Exécution

Les dépôts plugin prévus sont des miroirs du monorepo ; ils ne constituent pas aujourd'hui des sources autonomes. Le pilote doit inventorier dépendances, licences et tests, extraire l'historique sur une copie, définir une source unique, épingler un moteur et tester signature, installation, mise à jour et cache hors ligne. Documenter maintenance, sécurité et continuité des URL. Ne pas commencer par caméra tant que le cœur dépend directement de son quirc.

## Relectures anonymisées

Les cinq relecteurs ont reçu les propositions A–E sous forme de résumés, non les réponses complètes. La correspondance ci-dessus est révélée pour transparence.

- Relecteur A : D est le plus fort : la promesse exacte conditionne la crédibilité. A ne prouve pas à lui seul installation, signature, mise à jour et compatibilité. Oubli : responsable des dépôts et des régressions transversales.
- Relecteur B : D est le plus fort. Un plugin n'est pas forcément le meilleur pilote s'il ne démontre pas une expérience utile ; choisir entre app et plugin selon les dépendances. Oubli : support et protocole des essais indépendants.
- Relecteur C : A est le plus fort, car le pilote mesure les coûts. D est critique pour ne pas confondre compilation et JavaScript embarqué. Oubli : capacité de support et vérifications de marque.
- Relecteur D : A est le plus fort. La preuve Mac–reMarkable ne démontre pas encore une installation simple. Oubli : responsables, compatibilité et transition des URL.
- Relecteur E : A est le plus fort. La démo doit être testée par des personnes extérieures. Oubli : gouvernance, sécurité, clés et devenir des sous-projets abandonnés.

## Synthèse

**Accords :** clarifier la promesse ; choisir une première audience et un parcours réel ; extraire progressivement avec un contrat ; préserver les utilisateurs et documenter la maintenance.

**Désaccord :** commencer par une app peut mieux démontrer l'utilité, un plugin peut mieux éprouver les mécanismes de versions et de distribution. Choisir après un inventaire court ; aucun des deux n'est automatiquement autonome.

**Angles morts :** qui maintient chaque dépôt, traite les vulnérabilités, gère les clés et porte les corrections inter-dépôts ; quelle politique de sortie et de retour arrière ; comment prouver l'installation sur appareil réel.

**Recommandation :** garder provisoirement Zinc comme marque de travail, organiser le site autour d'une promesse vérifiable et d'une vitrine, et lancer un seul pilote d'extraction avant tout découpage massif. Premiers pas : cartographier les dépendances et choisir une app ou un plugin dont l'indépendance peut être démontrée avec une release épinglée.

## Limites

Conseil sur résumés : les relectures ne sont pas un examen complet des réponses. Pas d'enquête utilisateurs, d'audit juridique de marque ni d'inventaire exhaustif du code. Aucune publication, modification des dépôts distants ou migration.
