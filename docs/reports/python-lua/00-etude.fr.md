# Du vrai Python et du vrai Lua sur Zinc : l'étude

4 novembre 2026. L'objectif : **écrire un vrai programme Python, avec des modules `pip` et des modules Zinc, et le faire tourner dans Zinc ; la même chose pour Lua.**

Documents liés, en anglais : [00-study.md](00-study.md) (cette étude), [01-prior-art.md](01-prior-art.md) (autres projets, demande), [02-api-surface.md](02-api-surface.md) (ce qu'un programme doit atteindre, compté), [03-static-front-end.md](03-static-front-end.md) (première version de l'étude : la voie qui compile Python et Lua sans runtime), [04-real-runtimes-research.md](04-real-runtimes-research.md) (distribution de Python et Lua, wheels, précédents), [spike/real/](spike/real/) (le code derrière les chiffres).

Étiquettes : **[mesuré]** exécuté ici aujourd'hui, **[code]** lu dans le dépôt, **[estimation]** mon jugement. Les faits sourcés gardent les étiquettes des fichiers de recherche.

## 1. La réponse

**Ça marche, et ça a tourné aujourd'hui.** Le vrai CPython et le vrai Lua entrent dans le processus Zinc. Zinc garde la fenêtre, la boucle de rendu et l'UI ; le runtime du langage est appelé par Zinc et rappelle le code Zinc compilé via un pont généré.

| Preuve, sur le moteur tel quel [mesuré] | Résultat |
|---|---|
| Python 3.12, **numpy 2.5.4 installé par `pip`** (extension C), `humanize` (Python pur), une métaclasse, `eval`, un thread lancé | le tout dans un seul processus avec `zinc:ui` et le `Button` du kit |
| Un signal changé depuis Python, lu dans un effet Zinc qui rappelle Python et numpy | le texte suit : « 2,000,000 samples, mean 10.00, std 2.00 » |
| numpy calcule 2000 particules, Python les dessine via `zinc:gfx` | 0,05 ms de numpy + 0,79 ms de dessin par image |
| Lua 5.5, un module C compilé et un module pur via un simple `require`, métatables, `load`, une coroutine qui cède à travers des appels | le tout avec `zinc:ui`, réactif aussi |
| Interpréteur **et** AOT | les deux tournent ; en AOT, le C++ compilé et CPython partagent un processus |
| Un appel du langage vers le Zinc compilé | **Python 123 à 130 ns, Lua 95 à 106 ns** (AOT) |

Tout le reste de Zinc demeure : `lib/std` (15 855 lignes) et les plugins restent du TypeScript compilé, rien n'est réécrit. Le programme voit simplement un paquet `zinc` généré.

**Les limites, franchement**, car elles changent ce que Zinc promet :

1. **numpy ne tourne pas partout.** CPython n'existe ni sur ESP32, ni sur console, ni sur une vieille tablette ; PyPI n'a pas de numpy pour iOS ni Android (§5). Un programme avec des wheels C tourne là où ces wheels existent. Lua s'en sort bien mieux : sa VM est du C simple.
2. **Python pèse.** Environ 23 à 37 Mo pour l'interpréteur (archive, [04] §1) plus les paquets (numpy seul : 24 Mo sur disque [mesuré]) ; 51 Mo de mémoire dans le prototype, contre 13 Mo pour Lua [mesuré]. Pour les apps qui font ce choix, on quitte le discours « pas de navigateur, machines modestes ».
3. **Le code Python garde la vitesse de Python.** numpy est rapide, une boucle Python pure est lente, comme toujours. L'UI, la mise en page et le dessin restent compilés.

Il y a donc trois choses à construire, dans cet ordre : le **pont**, les **paquets**, l'**export**. Le compilateur statique de [03] devient la deuxième étape, pour les cibles que CPython ne peut pas atteindre.

## 2. Comment ça s'assemble

```
 ton programme (vrai .py ou .lua)     modules pip / LuaRocks (numpy, requests, lpeg...)
        │                                  │
        ▼                                  ▼
   CPython ou Lua, dans le processus Zinc ───── paquet `zinc` généré
                                                    │  123 ns l'appel, rappels dans les deux sens
                                                    ▼
   glue générée (TypeScript) ─ lib/std, kit, plugins ─ IR ─ interpréteur ou AOT C++
                                                    │
                                                    ▼
                         fenêtre, boucle de rendu, mise en page et rendu de Zinc
```

- **Le point d'accroche est l'ABI des plugins, sans changement** [code]. Le prototype, ce sont deux plugins de projet ordinaires (`pyhost`, 77 lignes ; `luahost`, 64 lignes). Le programme se lance avec `zinc run .`, sans toucher à `src/`.
- **La glue est générée.** `spike/real/py/src/main.ts` est écrit à la main pour le prototype : une table d'appels. Le produit la génère à partir de ce que `zinc doc` extrait déjà (`src/doc/api.cpp`), et seulement pour les modules importés : la compilation en monde fermé le reste.
- **La réactivité traverse toute seule** [mesuré]. Le suivi de `zinc:ui` est une variable globale sur un seul thread. Un effet Zinc appelle Python, Python lit un signal via le pont, la lecture abonne l'effet. Rien de spécial à faire ; les appels réentrants Zinc → Python → Zinc → numpy fonctionnent en interpréteur et en AOT.
- **Le pont est économique parce qu'il n'est pas en JSON.** `zinc:script` coûte aujourd'hui 1,0 µs l'appel sur le Mac, via du texte JSON (`script-boundary-optimisation.md`). La table de doubles et de chaînes du prototype est environ 8 fois moins chère. Les appels groupés iraient plus loin : `zinc.rects(tableau_numpy)` ne traverse qu'une fois pour toute une image. Cet appel groupé est conçu ici, pas mesuré ; le rapport cité a mesuré un gain de 3 à 5 fois pour la même idée.

## 3. Pourquoi cette voie

La première version de l'étude ([03]) choisissait un frontend de compilateur et classait une VM très bas. Ce classement supposait l'absence de paquets. Avec `pip` comme exigence :

| Voie | `pip` / rocks avec du C | Modules Zinc | Partout | Verdict |
|---|---|---|---|---|
| **Runtime dans le processus, pont généré** | oui | oui, 100 ns l'appel | là où le runtime et les wheels existent | **la voie** |
| Compilateur statique ([03]) | non : les extensions C exigent l'ABI de CPython, et aucun compilateur ne les garde (Codon et Mojo appellent un CPython installé, [04] §6) | oui, gratuit | partout | la deuxième étape, pour la portée et la vitesse |
| CPython dans un processus séparé (modèle Flet) | oui | oui, via un socket : bien plus lent [estimation], deux processus | bureau | non : dans le processus, ça a marché directement |
| Transpiler vers JavaScript | non | oui | large | non |
| MicroPython ou PocketPy | non : pas l'ABI de CPython, donc pas de numpy | oui | large | hors objectif ; peut-être un petit profil plus tard |

Pour Lua, le choix est plus simple : **PUC Lua 5.4 par défaut**, une constante à changer plus tard. Le prototype a tourné en 5.5, mais certains rocks refusent encore `>= 5.5` (luaposix, [04] §5). LuaJIT reste à l'écart : dialecte 5.1, pas de JIT sur iOS ni consoles.

## 4. À quoi ressemble un programme

```python
import numpy as np
import requests
from zinc import background
from zinc.ui import render, Signal, View, Text
from zinc.ui.kit import Button

prices = Signal(np.empty(0))

def refresh():
    prices.set(np.array(requests.get(URL).json()["prices"]))

def App():
    return View(
        Text(lambda: f"mean {prices().mean():.2f}", class_name="text-2xl font-bold"),
        Button(label="Refresh", on_click=background(refresh)),
        class_name="w-full h-full items-center justify-center gap-4",
    )

render(App)
```

```lua
local lpeg = require("lpeg")
local zinc = require("zinc")

local count = zinc.signal(0)

zinc.render(function()
  return zinc.View { class_name = "w-full h-full items-center justify-center gap-4",
    zinc.Text { function() return "Count: " .. count() end },
    zinc.Button { label = "Add one", on_click = function() count:set(count() + 1) end },
  }
end)
```

Ces deux exemples montrent l'API visée. Le prototype a fait tourner la même forme avec moins de noms ; `background` et un `Signal` contenant n'importe quel objet Python n'existent pas encore (§6), et ni `requests` ni `lpeg` n'ont été lancés.

```sh
zinc new mon-app --lang python
zinc add numpy requests        # résolus, verrouillés, gardés dans le projet
zinc run                       # ou : zinc dev, zinc build, zinc export
```

Rien à installer côté Python ou Lua : `zinc` récupère une fois le runtime et les outils épinglés, vérifiés, comme il le fait pour zig et V8.

## 5. Où ça peut tourner

Sourcé dans [04] §1 et §2 ; seul le Mac a été exécuté ici.

| Cible | Python + `pip` | Lua + rocks |
|---|---|---|
| macOS (le Mac de développement) | **exécuté aujourd'hui** | **exécuté aujourd'hui** (un module C de ma main, pas un vrai rock) |
| Windows, Linux x64 et arm64 | python-build-standalone, wheels de PyPI : devrait marcher | devrait marcher |
| Pi 2 et plus, 32 bits | interpréteur oui, mais pas de numpy armv7 sur PyPI ; piwheels ne sert que le Python de la distribution | oui |
| Pi 1 et Zero | Python système avec piwheels uniquement | oui |
| Android | binaires officiels depuis 3.14 ; pas de numpy sur PyPI, le canal Chaquopy en a | oui ; rocks C cross-compilés |
| iOS | Tier 3 ; chaque extension dans son Framework ; numpy seulement sur l'index de BeeWare ; pas de `pip` à l'exécution | oui, compilé dedans |
| Web | Pyodide : cœur 6,8 Mo, complet 337 Mo, sa propre mémoire : un projet à part | oui, du C simple en wasm |
| ESP32, consoles, TouchPad, Nexus 7 | **pas de CPython.** Voie statique, sans paquets C | VM oui si la mémoire suffit [estimation] ; les rocks C demandent un portage |

Donc : **un programme sans paquet C atteint tout**, via la voie statique ou la VM Lua ; **un programme avec numpy atteint d'abord le bureau et le Pi**, les téléphones avec du travail, les petites cibles jamais. `zinc check --target x` doit le dire dès la première ligne, en nommant le paquet, comme `zinc lint` le fait déjà pour les plugins.

Le mobile reste à la fin de la passe multiplateforme, comme le dit `AGENTS.md`.

## 6. Ce qui reste difficile

Le prototype évite ces points exprès ; c'est là qu'est le vrai travail.

| Problème | Pourquoi c'est important | Direction |
|---|---|---|
| **Un programme qui bloque.** Un vrai programme finit par `asyncio.run(main())` ou `while True:` ; dans le prototype, son niveau principal doit rendre la main, sinon la fenêtre ne démarre jamais | Décide si « vrai programme » tient | Lancer le niveau principal sur son propre thread ; Zinc garde le thread principal. Les appels à Zinc depuis un autre thread passent par une file (`cb_post` existe), et ceux qui attendent une valeur patientent un tour. **La première chose à prouver.** |
| **Un clic qui bloque.** `requests.get` dans un handler fige l'UI, et une extension C qui garde le GIL fait sauter une image | La panne la plus courante du Python embarqué | `zinc.background`, threads, et un avertissement de `zinc dev` quand un handler dépasse une image. Le prototype relâche le GIL entre les appels ; le résultat du thread n'a pas été vérifié |
| **asyncio et promesses** | 126 lignes de `Promise` dans les API des plugins ; `await` doit marcher dessus | Faire avancer asyncio d'un pas par image (`call_soon(stop)` + `run_forever`, [04] §4) ; une promesse Zinc devient un future Python et une coroutine Lua |
| **Durées de vie entre deux collecteurs** | Le prototype ne libère jamais un handle. Une closure Zinc qui tient un objet Python, et l'inverse, forment un cycle qu'aucun collecteur ne voit | Handles comme ressources du moteur (`R<k>`, les finaliseurs existent), liés aux scopes de l'UI. Pas de magie au début ; Pyodide vit avec des durées de vie explicites |
| **Les valeurs non numériques** | Les signaux du prototype ne contiennent que des nombres | La glue instancie `createSignal<PyRef>` ; objets d'options depuis les arguments nommés et les tables ; tableaux via le buffer protocol |
| **Les erreurs entre langages** | Une trace qui mêle Python et Zinc | Les erreurs Zinc lèvent des exceptions Python et inversement, avec les deux piles. Dans le prototype elles sont seulement imprimées |
| **Sécurité et chaîne d'approvisionnement** | `pip` exécute du code à l'installation, et un programme Python ignore les permissions de `zinc.json` | Wheels uniquement par défaut (`--only-binary`), verrou avec hachages, `zinc export` liste paquets et licences, et la doc dit qu'une app Python a tous les accès |
| **L'export** | Pas essayé. Relocaliser python-build-standalone, re-signer chaque bibliothèque des wheels sur macOS, notarisation | Le modèle de Blender : résoudre pour la cible, embarquer les wheels ([04] §3). `zinc export` fait comme pour un pack V8 |
| **Ce que supposent d'autres programmes** | `pygame`, `tkinter`, les fenêtres de Matplotlib veulent leur propre boucle et leur fenêtre | Refusés ou non pris en charge, et dit clairement. Matplotlib vers un buffer, ça va |

Deux manques du moteur rencontrés par le prototype, à combler selon la règle « Fill the engine's gaps » :
- La table C d'un plugin ne peut pas porter de callback, alors que `include/zn/native.h` décrit `c(sig)` : Z5011 dit « the C ABI cannot carry yet ». Le prototype a dû passer par la forme C++.
- `runtime/zrt.h` entre en conflit avec `<new>` dès qu'un plugin inclut la bibliothèque standard C++ : le prototype doit définir `ZRT_HOSTED_CPP`.

## 7. Les paquets

**Python : le modèle de Blender** ([04] §3), le précédent le plus proche. Résoudre pour chaque cible au moment du build avec un `uv` épinglé, garder le résultat dans le projet, ne jamais lancer `pip` sur la machine de l'utilisateur.

- `zinc add numpy` écrit `zinc.json` et un verrou avec hachages ; les paquets vont dans le projet, par cible. `uv` fait 14 à 17 Mo, licence Apache-2.0, sur toutes nos cibles bureau et Pi.
- Runtime : python-build-standalone, récupéré avec sa somme de contrôle (`zinc engine` le fait déjà pour V8). Quelle version : 3.13 ou 3.14, les wheels décident.
- Dans le prototype, l'étape tenait en une commande : `uv pip install --target site numpy humanize` [mesuré].

**Lua : LuaRocks** (MIT, 5.5 depuis 3.13.0). Un rock pur est un fichier. Un rock C est compilé par la machine qui construit l'app : LuaRocks accepte `CC`, donc le `zig cc` épinglé est le compilateur naturel et la cross-compilation vient avec. Non vérifié.

**Je n'ai pas pu tester LuaRocks lui-même :** le système de permissions a refusé son téléchargement et sa compilation ici. Le prototype prouve le mécanisme avec un module C de ma main, compilé comme LuaRocks le fait (`-bundle -undefined dynamic_lookup`) et chargé par `require`, pas avec un vrai rock. Sous Linux, l'hôte doit en plus exporter les symboles `lua_*`.

## 8. Le plan

Les tailles sont des **estimations**. Python et Lua partagent tout au-dessus des deux petits hôtes : ils se construisent ensemble.

| Phase | Quoi | Taille | Terminé quand |
|---|---|---|---|
| **0. Blocage et threads** | Prouver le modèle de threads sur le prototype : `asyncio.run`, `while True`, un clic bloquant, avec une fenêtre | quelques centaines de lignes, jetées ensuite | un vrai programme, sans modification, garde une UI vivante. **Si ça échoue, la conception change.** |
| **1. Le pont** | `zinc doc --json`, générateur (glue, `zinc` pour Python et Lua, stubs `.pyi` et LuaLS), les deux hôtes derrière une interface, `zinc run main.py`, erreurs, durées de vie | ~3 000 lignes | `bouncing-ball` et un template d'UI écrits dans chaque langage ; pyright et lua-language-server complètent l'API |
| **2. Les paquets** | `zinc add`, verrou, `uv` épinglé, pack du runtime, LuaRocks avec `zig cc` | ~800 lignes | numpy, requests, pillow, pandas, rich ; lpeg, cjson, penlight, luasocket depuis une machine vierge |
| **3. L'asynchrone** | promesses, asyncio, coroutines | ~500 lignes | `await` sur `fetch` et sur une promesse de plugin |
| **4. L'export** | `.app` macOS signée avec ses wheels ; Linux ; puis la passe multiplateforme | ~800 lignes | une app avec numpy tourne sur un Mac sans Python |
| **5. Portée et vitesse** | La voie statique de [03] pour les cibles sans CPython, et `@zinc.compile` sur les fonctions critiques | ~6 000 lignes | un `.py` sans paquet tourne sur l'ESP32 |

Tests : un programme sans fenêtre tourne sous `python` et `lua` et doit imprimer la même chose, l'idée de `tools/oracle`. Les tests de fumée des paquets vont en T2, hors des lancements courants.

## 9. Ce qui ne peut être décidé que par toi

1. **Les licences.** `RULES.md` §3 accepte MIT, BSD, Apache-2.0, zlib, ISC et le domaine public. **CPython est sous PSF et python-build-standalone sous MPL-2.0 : aucune n'est dans la liste.** Lua est sous MIT. Je recommande de les autoriser pour un pack téléchargé à la demande, non lié à `zinc`, comme V8. Il me faut ton accord.
2. **Ce que Zinc dit du poids.** Une app Python fait 50 Mo ou plus. L'accepter comme le prix de `pip`, avec Lua et TypeScript comme options légères ? La doc devrait le dire clairement.
3. **Le premier langage.** Les deux partagent le pont. Python est la demande (71,8 % des gens qui apprennent, contre 15 % pour Lua, Stack Overflow 2025) ; Lua est le plus facile. Je recommande de construire les deux en même temps sur le pont, parce que Lua garde le pont honnête sur la mémoire.
4. **Le backlog.** Il est gelé ; il faudra `New-task: owner`. La phase 0 peut démarrer sans tâche, comme un prototype.
5. **Le test de LuaRocks.** Autoriser son téléchargement et sa compilation dans un dossier temporaire, pour remplacer mon substitut par de vrais rocks :
   `curl -LO https://luarocks.org/releases/luarocks-3.13.0.tar.gz`, puis `./configure --prefix=<dossier> --lua-version=5.5 --with-lua=/opt/homebrew`, `make install`, `luarocks --tree spike/real/lua/rocks install lua-cjson penlight`.

## 10. Limites de cette étude

- Tout a tourné **sans fenêtre (headless), sur un seul Mac, avec une charge de 12 à 18**, trois essais au plus. Les temps sont des ordres de grandeur ; ils n'entrent pas dans le journal de performance. Les premiers lancements étaient plus lents (0,61 s pour Python, 0,31 s pour Lua, contre 0,11 s et 0,03 s une fois en cache).
- Pas prouvé : une vraie fenêtre avec de vrais clics, un programme qui bloque (§6), une autre machine, une app exportée (le prototype lie le Python de Homebrew : le binaire de 6,5 Mo ne contient pas Python), pandas et autres gros paquets, les longues durées et les fuites.
- Dans la recherche, les tailles des bundlers, la taille de numpy sous Pyodide, `zig cc` comme `CC` et la plupart des précédents Lua n'ont pas été trouvés ([04], fin). La répartition des langages de Godot vient d'une source secondaire.
- Les tailles, le plan et le verdict sur la voie à processus séparé sont mon jugement.
