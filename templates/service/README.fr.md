# {{name}}

## Prochaines étapes

- `zinc dev` : le lance ; chaque enregistrement s'affiche tout de suite.
- Changez `src/main.ts` et enregistrez.
- Apprenez à dessiner et à réagir au clavier et à la souris : https://frulko.github.io/zinc/fr/docs/learn/
- Le guide : https://frulko.github.io/zinc/fr/docs/guide/01-getting-started/
- `zinc tour` : une première visite guidée.

Une API JSON HTTP faite avec le modèle `service`.

```sh
zinc run                 # serves on http://localhost:3000 (PORT=8080 zinc run for another port)
zinc test                # the API without the network (tests/api.test.ts) and over HTTP (tests/http.test.ts)
zinc export --target rpi # a Raspberry Pi build in dist/
```

| Méthode | Chemin | Réponse |
|---|---|---|
| GET | /health | `{"ok": true, "items": n}` |
| GET | /items | tous les éléments |
| POST | /items | en crée un à partir de `{"title": "..."}` : 201 et l'élément, 400 sans titre |
| GET | /items/:id | l'élément, ou 404 |
| DELETE | /items/:id | 204, ou 404 |

`src/api.ts` fait correspondre une requête et une réponse, et c'est tout ce dont les tests ont besoin ; `src/main.ts` ne fait que démarrer le serveur.

## L'exécuter comme un service

`deploy/{{id}}.service` est une unité systemd. Sur la machine :

```sh
sudo mkdir -p /opt/{{id}} && sudo cp dist/{{id}}-linux/{{id}} /opt/{{id}}/   # the executable from zinc export
sudo cp deploy/{{id}}.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now {{id}}
journalctl -u {{id}} -f
```
