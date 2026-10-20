---
id: ZN-089
title: TLS and WebCrypto subset on mbedTLS
status: Done
assignee: []
created_date: '2026-10-06 22:53'
updated_date: '2026-10-07 05:11'
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
- [x] #1 https fetch against a local TLS server with a test CA; certificate failures reject
- [x] #2 crypto.subtle known-answer tests (NIST/RFC vectors) pass; WPT webcrypto subset where the data exists
- [x] #3 binary size impact recorded in docs/reports/zinc-next-packaging.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. mbedTLS 4.0.0 + TF-PSA-Crypto vendored (third_party/mbedtls, own CMake target zn_mbedtls, default config, README row, sha256), -DZN_TLS=OFF stubs. src/host/tls.{h,cpp}: TLS 1.2/1.3 over memory buffers (client verifies against system roots or ZINC_CA_FILE, Node-style failures CERT_HAS_EXPIRED / ERR_TLS_CERT_ALTNAME_INVALID / UNABLE_TO_VERIFY_LEAF_SIGNATURE), used by the fetch client (https://, port 443, redirects across schemes), an https serve(port, handler, {cert,key}) and MqttClient(host, port, id, secure). src/host/crypto.{h,cpp} on PSA + hidden zinc:__crypto + lib/std/subtle.ts (zinc:subtle: digest, HMAC, AES-GCM/CBC/CTR, PBKDF2, HKDF, ECDSA/ECDH P-256, raw import/export). Tests: tests/t0/tls.sh (openssl test CA: good, wrong name, expired, untrusted CA; MQTT over TLS against tests/mqtt_broker.py with a certificate), tests/t0/crypto.sh (FIPS 180, RFC 4231, SP 800-38A, GCM test case 4, RFC 7914, RFC 5869, RFC 5903 vectors). Size: +755 KB stripped (+18.7 %), docs/reports/zinc-next-packaging.md. Not done: crypto.subtle is a separate module (zinc:subtle) and not yet the global crypto.subtle (ZN-095 auto-import), no jwk/pkcs8/spki/RSA, WPT webcrypto data absent, mbedTLS config not trimmed, system root store read from PEM files (macOS /etc/ssl/cert.pem, Linux bundles), no client certificates, no session resumption.
<!-- SECTION:NOTES:END -->
