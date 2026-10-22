# {{name}}

## Próximos pasos

- `zinc dev`: lo ejecuta; cada vez que guardas, se ve al instante.
- Cambia `src/main.ts` y guarda.
- Aprende a dibujar y a reaccionar al teclado y al ratón: https://frulko.github.io/zinc/es/docs/learn/
- La guía: https://frulko.github.io/zinc/es/docs/guide/01-getting-started/
- `zinc tour`: un primer recorrido guiado.

Una API HTTP JSON hecha con la plantilla `service`.

```sh
zinc run                 # serves on http://localhost:3000 (PORT=8080 zinc run for another port)
zinc test                # the API without the network (tests/api.test.ts) and over HTTP (tests/http.test.ts)
zinc export --target rpi # a Raspberry Pi build in dist/
```

| Método | Ruta | Respuesta |
|---|---|---|
| GET | /health | `{"ok": true, "items": n}` |
| GET | /items | todos los elementos |
| POST | /items | crea uno a partir de `{"title": "..."}`: 201 y el elemento, 400 sin título |
| GET | /items/:id | el elemento, o 404 |
| DELETE | /items/:id | 204, o 404 |

`src/api.ts` convierte una petición en una respuesta y es todo lo que necesitan los tests; `src/main.ts` solo arranca el servidor.

## Ejecutarlo como servicio

`deploy/{{id}}.service` es una unidad de systemd. En la máquina:

```sh
sudo mkdir -p /opt/{{id}} && sudo cp dist/{{id}}-linux/{{id}} /opt/{{id}}/   # the executable from zinc export
sudo cp deploy/{{id}}.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now {{id}}
journalctl -u {{id}} -f
```
