# Discord client: uploading big files to a transfer service

What the client does (ZN-906): the guard's limits by `premium_type` and boost tier pre-check each file (`safety/access.ts` `uploadMax`, 10 MB free); a larger file opens the transfer window, which sends it to Litterbox, pixeldrain or a Gokapi server (the three recommended below) with the progress (`zinc:net` `bodyFile` and `onProgress`, the file read by the engine) and posts the links on a click. The free limit stays 10 MB until Discord's own page confirms the reported 20 MB; Gokapi's chunked flow and Zipline are not done.

Research of 2026-10-31 for the Discord example (`examples/discord`). Question: when a file is over the user's Discord upload limit, which services can the app upload to and post the link? Reliability labels: **confirmed** = read on an official page or fetched live, **reported** = third-party pages only, **unverified** = could not be checked from the research machine (state it in the code comments; re-check before shipping).

## Upload limits

Discord's own help article (File Attachments FAQ, support.discord.com 25444343291031) returned HTTP 403 to the fetcher, so the numbers below come from press and vendor pages that quote it. Discord changes these often (8 MB, 25 MB, 10 MB in Sept 2024, then 20 MB in Aug 2026). The client should never hard-code them as truth: treat them as a pre-check, and also handle the API's rejection (HTTP 413 / JSON error code 40005 "Request entity too large") by offering the transfer fallback.

| Plan | `premium_type` | Per-file limit | Status |
|---|---|---|---|
| Free | 0 | 20 MB (10 MB until Aug 2026) | reported, several outlets |
| Nitro Basic | 3 | 50 MB | reported, consistent |
| Nitro Classic (legacy) | 1 | 500 MB (legacy plan, assume same as Nitro) | reported, not checked |
| Nitro | 2 | 500 MB; one Oct 2026 source says 1 GB | reported, conflicting |

- `premium_type` ([user resource](https://docs.discord.com/developers/resources/user), confirmed): 0 None, 1 Nitro Classic, 2 Nitro, 3 Nitro Basic. The field needs the `identify.premium` OAuth2 scope; a user token (the client's case) reads it from `/users/@me`.
- Attachments per message: 10 (long-standing; not re-confirmed in this research). Total request body is also capped, so ten near-limit files can still fail.
- Boosted servers: older Discord docs gave boosted guests a higher limit in that server (tier 2: 50 MB, tier 3: 100 MB). I found nothing current that confirms it still applies, so treat the per-guild boost limit as possible but unverified. Rule for the client: use `max(plan limit, guild boost limit if known)` as a hint only, and fall back on the server's refusal.

## Public transfer services

Probed from a macOS shell: catbox.moe, litterbox, pixeldrain, gofile answered HTTP 200; 0x0.st, transfer.sh and bashupload.com did not connect (DNS or refused), so their status is unverified or down.

| Service | Documented API? | Auth | Limits | Protocol and link | Verdict |
|---|---|---|---|---|---|
| [pixeldrain](https://pixeldrain.com/api) | Yes, official | **API key required**, "anonymous uploading is not supported"; HTTP Basic, empty user, key as password. Accounts created after 2026-09-01 need a verified email | per-plan size cap (`file_too_large` 413); free about 20 GB and 120 days idle expiry (reported); `/api/misc/rate_limits` shows a 6 GB transfer cap | `PUT /api/file/{name}` raw body (streams, no multipart); 201 JSON with `id`; link `https://pixeldrain.com/u/{id}` | **Implement** (user supplies key) |
| [Litterbox](https://litterbox.catbox.moe/tools.php) (catbox) | Yes, a short page | anonymous | 1 GB (reported); 1h/12h/24h/72h retention | one multipart POST; the response body is the plain-text URL | **Implement** as the anonymous option; no ToS page exists, say so in the UI |
| [Catbox](https://catbox.moe/tools.php) | Yes, same page | anonymous or `userhash` | 200 MB (reported), permanent | multipart POST, plain-text URL | Skip: 200 MB is too small to matter above Discord's limit, and a permanent anonymous host invites abuse |
| [Gofile](https://gofile.io/api) | The `/api` page is an empty shell for the fetcher; the upload API (`POST https://upload.gofile.io/uploadfile`, multipart, JSON with `data.downloadPage`) is known only from wrappers | guest or account token | not stated | multipart | Optional, not first: no official doc readable, so treat as unconfirmed |
| [Smash](https://api.fromsmash.com/docs) | Yes, official API and SDKs | API key from a free developer account | free tier is a 100 GB, 14-day trial, paid after | SDK-driven multi-step upload | Skip: paid, the user would have to be a customer |
| WeTransfer | SDKs archived or abandoned; a review says no public API since 2023 (reported) | key from a dev portal | n/a | n/a | Skip |
| SwissTransfer (Infomaniak) | No public API found; only end-user help pages (50 GB, 1 to 30 days via the web app) | n/a | n/a | any client would be reverse-engineered | Skip |
| TransferNow | No API found | n/a | n/a | n/a | Skip |
| file.io | `/developers` now redirects to limewire.com/auth; a forum post and a competitor blog say the API is broken after the LimeWire merge (reported) | n/a | n/a | n/a | Skip |
| 0x0.st | Documented on its front page (`curl -F file=@x`), but the page was unreachable here; the clone sites cap at 512 to 1024 MiB with size-based retention; 0x0.st blocks the default curl user agent and bans abuse (from memory, unverified) | anonymous | unverified | multipart POST, plain-text URL | Skip for now: unreachable, unverified rules |
| transfer.sh public | The repo README says it will not advertise any public instance; `transfer.sh` refused connections here; the repo carries a security warning in its README (issue 670) | n/a | n/a | `PUT /{name}` | Treat as dead; support only via the self-hosted route |
| bashupload | `bashupload.com` did not resolve | n/a | n/a | n/a | Skip |

Terms: none of the anonymous hosts publish terms that name third-party apps; pixeldrain's API is the only one offered for programs by design (key per user). Progress needs a streamed request body: pixeldrain's PUT and every multipart POST can stream from a file; none of the recommended ones requires chunking.

## Self-hostable servers

Release dates from the GitHub API on 2026-10-31.

| Server | API | Maintenance | License | Notes |
|---|---|---|---|---|
| [Gokapi](https://github.com/Forceu/Gokapi) | **Documented OpenAPI** (`openapi.json`), API key in the `apikey` header with per-key permissions; `POST /api/files/add` returns the link; chunked `chunk/add` + `chunk/complete` for big files | active, v2.2.4 (2026-03-10), last push 2026-10-26 | AGPL-3.0 | Per-upload expiry and download count; best fit |
| [Zipline](https://github.com/diced/zipline) | Documented REST, token in `Authorization` (no Bearer), `POST /api/upload` multipart; partial upload headers for chunks; response is JSON with a `files` array (the `url` field name was not confirmed here) | very active, v4.8.2 (2026-10-25) | MIT | Heavier (Postgres, accounts); popular with ShareX users |
| [PsiTransfer](https://github.com/psi-4ward/psitransfer) | Upload is tus-based (`/files/` with `sid`), documented in the repo `docs/`; no token API, only an optional shared upload password; the link is built by the client from the bucket id | active, v2.4.5 (2026-10-24) | BSD-2-Clause | Simple to host, awkward to call |
| [PicoShare](https://github.com/mtlynch/picoshare) | Minimal; shared-secret login, a guest-link upload route; no documented REST | active, v1.5.4 (2026-05-26) | custom (NOASSERTION in GitHub) | Skip |
| [Chibisafe](https://github.com/chibisafe/chibisafe) | REST with token, `POST /api/upload` | active, v6.7.0 (2026-10-22) | MIT | Image-host oriented |
| [XBackBone](https://github.com/SergiX44/XBackBone) | ShareX-style `/upload` with token | v3.8.2 (2026-06-27) | Apache-2.0 | Image-host oriented, PHP |
| [transfer.sh](https://github.com/dutchcoders/transfer.sh) | `PUT /{name}`, link in the body; no auth by default | last release v1.6.1 (2023-12), pushes continue 2026-09; README security warning | MIT | Simplest protocol; stale releases |
| [Enclosed](https://github.com/CorentinTh/enclosed) | Text notes and files with client-side encryption; not a plain upload call | active, v1.16.1 (2026-10-23) | Apache-2.0 | Wrong shape |
| Pingvin Share | Share and reverse-share API with JWT | **archived** (last push 2026-05-18, v1.13.0) | BSD-2-Clause | Skip |

## Recommendation

Implement three providers behind one `Uploader` interface (stream a file, report bytes sent, return a URL). Anonymous Litterbox is the zero-config default; pixeldrain needs the user's key; Gokapi is the "configure by URL and token" provider.

**1. Self-hosted first: Gokapi.** Documented OpenAPI, token header, active, one call returns the link. Settings: base URL, API key (created in Gokapi's admin UI with the Upload permission), expiry days, max downloads.

```
POST {base}/api/files/add
apikey: {token}
Content-Type: multipart/form-data
  allowedDownloads = 0      (0 = unlimited; default 1)
  expiryDays       = 14     (0 = never; default 14)
  file             = <binary>   (file part last)
-> 200 JSON  { "Result": "OK", "FileInfo": { "UrlDownload": "https://.../d?id=...", ... } }
```

Link = `FileInfo.UrlDownload`. The per-request memory cost is on the server; for files above its web upload limit use the chunked flow: `POST {base}/api/chunk/add` (multipart: `uuid` 10+ chars shared by all chunks, `filesize` total bytes, `offset`, `file` = chunk, chunks at least 5 MB except the last, header `apikey`) for each chunk, then `POST {base}/api/chunk/complete` with headers `apikey`, `uuid`, `filename`, `filesize` (optional `allowedDownloads`, `expiryDays`); the response has the same `FileInfo.UrlDownload`. Chunks give natural progress; implement `files/add` first and chunking as phase two. Source: [openapi.json](https://raw.githubusercontent.com/Forceu/Gokapi/master/openapi.json).

**2. Public, user key: pixeldrain.**

```
PUT https://pixeldrain.com/api/file/{urlencoded name}
Authorization: Basic base64(":" + apiKey)      (empty user name)
Content-Type: application/octet-stream
body: raw file bytes (streamed)
-> 201 JSON  { "id": "abc123", ... }
```

Link = `https://pixeldrain.com/u/{id}`. Errors are JSON `{ "value": "<code>", "message": "..." }`: `file_too_large`, `user_out_of_space`, `email_address_not_verified`, `ip_banned`. Do not use `POST /file`; the docs recommend PUT. Source: [pixeldrain API](https://pixeldrain.com/api) (fetched 2026-10-31).

**3. Public, anonymous: Litterbox (temporary).**

```
POST https://litterbox.catbox.moe/resources/internals/api.php
Content-Type: multipart/form-data
  reqtype      = fileupload
  time         = 72h            (1h | 12h | 24h | 72h)
  fileToUpload = <binary>
-> 200 text/plain  the full URL, e.g. https://litter.catbox.moe/xxxxxx.zip
```

Link = the trimmed response body. Limit about 1 GB (reported). There are no published terms, so the settings screen must say "anonymous, expires after N hours, no terms published" and the provider must be opt-in.

Not recommended now: Gofile (add only after reading an official API page), 0x0.st (re-check when reachable), Smash (paid), WeTransfer, SwissTransfer, TransferNow, file.io (no usable API). Zipline is the second self-hosted provider to add if wanted: `POST {base}/api/upload`, header `Authorization: {token}`, multipart `file`, optional `X-Zipline-Format`; take `files[0].url` (verify the field on a live instance).

Implementation notes for the engine side: show the 10-attachment and size pre-check before upload; stream from disk so progress is real; post the link as plain message text (Discord unfurls it); never log the key; store keys in the app's secret store, not `zinc.json`.

## Sources

- Discord user resource: https://docs.discord.com/developers/resources/user
- Discord limits (reported): https://www.gadgetreview.com/?p=402010, https://www.dexerto.com/entertainment/discord-raises-free-upload-limit-to-20mb-after-lowering-it-two-years-ago-3398251/, https://devtoollab.com/blog/discord-file-size-limit
- pixeldrain: https://pixeldrain.com/api
- Catbox and Litterbox: https://catbox.moe/tools.php, https://litterbox.catbox.moe/tools.php, https://docs.rs/catbox/latest/catbox/litter/index.html
- Smash: https://api.fromsmash.com/docs
- Gokapi: https://github.com/Forceu/Gokapi, openapi.json above
- Zipline docs: https://www.mintlify.com/diced/zipline/api/authentication
- transfer.sh: https://github.com/dutchcoders/transfer.sh
- file.io redirect: https://www.file.io/developers (301 to limewire.com), https://forums.balena.io/t/file-io-alternatives/372829
- WeTransfer SDK status: https://github.com/WeTransferArchive/wt-js-sdk, https://packagist.org/packages/wetransfer/php-sdk
- Infomaniak SwissTransfer help: https://www.infomaniak.com/fr/support/faq/2557/send-files-using-swisstransfer-infomaniak
