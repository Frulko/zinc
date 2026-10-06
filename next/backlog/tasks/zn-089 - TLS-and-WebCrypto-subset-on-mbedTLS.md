---
id: ZN-089
title: TLS and WebCrypto subset on mbedTLS
status: Backlog
assignee: []
created_date: '2026-10-06 22:53'
labels:
  - host-modules
  - security
  - size-M
milestone: m-14
dependencies:
  - ZN-087
ordinal: 40310
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Vendor mbedTLS 4.x (Apache-2.0) with TF-PSA-Crypto: TLS 1.2/1.3 client and server for zinc:net and zinc:mqtt, system root store lookup per OS, crypto.subtle subset (digest SHA-1/256/384/512, HMAC, AES-GCM/CBC/CTR, ECDSA/ECDH P-256, PBKDF2, HKDF, RSA-OAEP only if cheap), crypto.getRandomValues/randomUUID. Compile only on targets that have a network (profile capability).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 https fetch against a local TLS server with a test CA; certificate failures reject
- [ ] #2 crypto.subtle known-answer tests (NIST/RFC vectors) pass; WPT webcrypto subset where the data exists
- [ ] #3 binary size impact recorded in docs/reports/zinc-next-packaging.md
<!-- AC:END -->
