---
id: ZN-869
title: 'examples/discord: QR code login and password login with 2FA'
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-30 14:53'
updated_date: '2026-10-30 22:24'
labels:
  - net
  - ui
  - size-M
milestone: m-28
dependencies:
  - ZN-866
ordinal: 134
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase 1b: remote-auth gateway with RSA-OAEP-SHA256 (mbedTLS) and a QR code (plugins/qrcode) scanned by the phone app; then /auth/login with TOTP and SMS MFA. A captcha challenge falls back to QR login with a clear message (no embedded browser).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Scanning the QR code with the Discord phone app logs in
- [ ] #2 Password plus TOTP logs in
- [x] #3 A captcha answer says to use the QR code instead
- [x] #4 Unit test of the remote-auth key exchange against recorded vectors
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (worktree agent):
- Engine: zinc:subtle gets RSA-OAEP on PSA/mbedTLS (src/host/crypto.cpp: rsa-generate, rsa-public, rsa-spki via mbedTLS PK writer, rsa-spki-import via PK parser, rsa-oaep-encrypt/decrypt): generateKeyPair({name:'RSA-OAEP', hash, modulusLength}), encrypt/decrypt, spki import/export, raw-private = PKCS#1. Test: tests/golden/host/subtle.ts decrypts an OpenSSL-made ciphertext, checks the SPKI against OpenSSL's, round trips (t0 crypto).
- Engine gaps met by Login.tsx, fixed in src/frontend/jsx.cpp with goldens: a component declared in the file named like a host tag (function Button) is a component (tests/golden/jsx/own_button.tsx); an element assigned after its declaration (let form; form = <View/>) mounts as {form} (tests/golden/jsx/node_call.tsx). t0 jsx passes (interp, built, quickjs).
- App: src/services/auth.ts (QrLogin: remote-auth gateway v2, RSA-2048 OAEP-SHA256, nonce proof, pending_remote_init -> QR https://discord.com/ra/<fp>, pending_ticket user, pending_login ticket -> POST /users/@me/remote-auth/login -> encrypted token; passwordLogin, sendSms, mfaLogin, loginError). Login.tsx: email/password, then TOTP or SMS code, or paste a token, left; QR code (zinc:qrcode on a Canvas) right. One attempt per click, expired code waits for New code. Captcha: limits.ts message now says to log in with the QR code or once in the official app. rest.ts sends no Authorization header without a token; ApiError carries the JSON body (form errors).
- Decision: the remote-auth WebSocket sends Origin: https://discord.com (the gateway refuses other origins) and the same User-Agent the main gateway already sends; no new identity, super-properties or fingerprint.
- Test: tests/t1/discord_login.sh (examples/discord/tests/login.ts): vectors recorded with OpenSSL 3.6 (2048-bit key, nonce, user payload, fake token, proof), then QR login, wrong password, password+TOTP, captcha against the fake (tests/fake-discord.ts /ra and /auth/*). FAKE_RA_HOLD=1 keeps the QR on screen for a picture.
Left for a person (Review): AC1 scanning with the real Discord phone app and AC2 a real account's password+TOTP; never tried against discord.com here (no real account or token used). Command: build/zinc run examples/discord, scan the code / log in, then Log out.
<!-- SECTION:NOTES:END -->
