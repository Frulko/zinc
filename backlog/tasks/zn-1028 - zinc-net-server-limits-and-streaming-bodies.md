---
id: ZN-1028
title: 'zinc:net server limits and streaming bodies'
status: Review
assignee: []
created_date: '2026-11-07 16:37'
updated_date: '2026-11-09 05:56'
labels:
  - net
  - perf
  - size-M
milestone: m-14
dependencies: []
ordinal: 12500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A per-server body-size option (64 MiB x 32 connections is the memory ceiling on a Pi), streaming the `fetch` bodyFile from disk instead of reading it whole, `sendfile` for `Reply.file`, and dual-stack listening or documented ZINC_BIND.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-842: a per-server body-size option in zinc:net; 64 MiB times 32 connections is the memory ceiling on a Pi or a reMarkable.
- ZN-892: sendfile for Reply.file; dual-stack listening by default; ZINC_BIND documented but not implemented in serve; per-listener IP buckets; a uv_fs pool for file replies.
- ZN-906: the fetch bodyFile row still reads the whole file into memory in the host; stream it from disk.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `serve({maxBody})` refuses a larger body with 413
- [x] #2 `fetch` with bodyFile streams a 500 MB file with flat RSS
- [ ] #3 `Reply.file` uses sendfile on macOS and Linux
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research (sonnet sub-agent, 2026-11-09):
- nginx client_max_body_size (default 1m): 413 on the declared Content-Length before reading, chunked bodies counted as they come: https://www.getpagespeed.com/server-setup/nginx/nginx-client-max-body-size , https://mailman.nginx.org/pipermail/nginx/2018-December/057292.html
- Go http.MaxBytesReader closes the connection after the limit (Connection: close); clients may see a reset instead of the 413: https://golang.org/issue/62547 , https://goodfirstissue.org/golang/go/issues/73754
- Bun maxRequestBodySize: https://bun.com/reference/bun/Serve/BaseServeOptions/maxRequestBodySize ; Node has no built-in limit (body-parser 100kb).
- libuv uv_fs_sendfile (src/unix/fs.c, read in third_party/libuv): on Linux it tries copy_file_range first, which a socket refuses (EINVAL), then falls back to a read/write emulation that blocks in poll(); on Darwin a partial send returns EAGAIN with the count in len. So zinc calls sendfile(2) itself on the non-blocking socket. Apple man page: https://opensource.apple.com/source/xnu/xnu-2050.9.2/bsd/man/man2/sendfile.2.auto.html ; Go on short counts: https://golang.org/issue/64044
- sendfile cannot carry TLS (only kTLS, not used here): https replies keep the copy path.
- Dual-stack: libuv binds AF_INET6 with IPV6_V6ONLY=0 unless UV_TCP_IPV6ONLY: https://docs.libuv.org/en/v1.x/tcp.html

Done:
- #1 maxBodyBytes (the existing ServeOptions name; the criterion's `maxBody`) default 64 MiB -> 16 MiB: a buffered body is held whole until the handler runs, 32 x 16 MiB = 512 MiB, half a Pi 3 (64 MiB x 32 was 2 GB). The 413 now carries a text body naming the limit and the option (431 too), and the program gets one stderr warning per server naming maxBodyBytes and streamBody. curl with Expect: 100-continue, without it, and chunked, posting 500 MB to the default: all three read the 413 and its text on macOS.
- #2 fetch bodyFile streams: Fetch::Up (None, Waiting, Sending, Sent) changed only by upTo; the file is read 256 KiB at a time while under 1 MiB waits in uv_write callbacks (inFlight: libuv writes at once and frees in the callback, so write_queue_size alone let the whole file through). Redirects 307/308 and the TLS 1.2 retry send it again from the start, 303 drops it. 500 MB upload to a Python sink: peak RSS 28.6 MB (develop: 1631 MB), sha256 equal, progress last === total.
- #3 Reply.file: sendfile(2) on macOS and Linux over plain http; a 16 KiB uv_write probe tells when a full socket has room. 500 MB download on loopback: 7.4 GB/s, server peak RSS 21 MB, 0.06 s sys (develop copy path: 3.6 GB/s, 572 MB peak, 0.16 s sys). Linux code checked with zig c++ -target aarch64-linux-gnu -fsyntax-only only: the Pi (spark@192.168.2.31) answered ping but not ssh on 2026-11-09. Left unticked until that run.
- Found and fixed: the copy path (https, Windows) went on after its turn's queued write, which libuv may write at once, so a fast client made the server copy a whole file into memory (572 MB for 500 MB). Https upload + download of 500 MB in one process now peaks at 57 MB.
- ZINC_BIND: serve uses it when the program gives no hostname (docs/guide/08-security.md said it did). Dual-stack by default stays off (the macOS pitfall in serve's comment).
- SIGPIPE ignored at serve/fetch when the program left it at SIG_DFL (Linux writes to a closed peer; libuv sets SO_NOSIGPIPE only on macOS).
- Test: tests/t0/net_stream.sh (6 MiB bodyFile upload with prefix/suffix compared, the 413 text, an 8 MiB Reply.file compared; three engines). net, net_file, net_body_bytes, net_limits, net_fetch_bytes, net_user_agent, net_raw_bytes pass.

Next (Review): on the Pi, `zinc export` a server that replies with a 100 MB file, `curl -o /dev/null` it from the Mac, and `strace -f -e trace=sendfile -p <pid>` shows sendfile calls; then tick #3.
<!-- SECTION:NOTES:END -->
