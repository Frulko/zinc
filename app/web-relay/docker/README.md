# The web relay on a server

The relay (`app/web-relay`) can run on any Linux machine that stays on (a NAS, a Raspberry Pi 4 or 5, a small VPS) instead of the Mac, so the
tablet reads the web without the Mac. Zinc Web on the tablet does not change: set **Settings**, **Relay** to the server's address and token.

## Build and run

On the Mac, from the repository (Docker on the Mac builds both architectures):

```sh
app/web-relay/docker/build --arch arm64        # a Pi or an ARM server; --arch amd64 for a PC or most VPS
docker save zinc-web-relay | ssh me@server docker load
scp app/web-relay/docker/compose.yaml me@server:web-relay/
ssh me@server 'cd web-relay && docker compose up -d && docker compose logs web-relay | grep token'
```

The image holds Debian's Chromium, Noto fonts and the Linux zinc; the relay keeps its token and Chrome's profile in the `relay-data`
volume. It needs about 1 GB of memory.

## Keep it private

A relay is a browser that anyone with its token can drive. In the image it runs with:

- a token: every request but `/` and `/health` needs it (never `--no-token` on a server);
- `--block-private`: it refuses pages of the local network (`192.168.*`, `10.*`, `localhost`, `*.local`, and disguises such as
  `0x7f.1`), and Chrome blocks those hosts in a page's own requests and redirects, so the relay cannot be used to look into your network.
  A public name that resolves to a private address is not caught: for that, give the container a network with no route to your LAN.

Over the internet, put it behind HTTPS, as one of:

- **Tailscale** or **WireGuard** (simplest): the tablet and the server on one private network, the port never open to the internet;
- a reverse proxy with a certificate (Caddy: `relay.example.com { reverse_proxy localhost:8790 }`);
- the relay's own TLS: add `--tls-cert /data/cert.pem --tls-key /data/key.pem` to the command (a certificate the tablet trusts).
