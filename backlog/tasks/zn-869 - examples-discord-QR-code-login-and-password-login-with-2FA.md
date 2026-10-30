---
id: ZN-869
title: 'examples/discord: QR code login and password login with 2FA'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 14:53'
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
- [ ] #3 A captcha answer says to use the QR code instead
- [ ] #4 Unit test of the remote-auth key exchange against recorded vectors
<!-- AC:END -->
