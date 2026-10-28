// SPDX-License-Identifier: GPL-3.0-only
package com.shilapi.xcertplay.transport

import java.io.IOException

/** A remote refusal kept distinct from malformed plists, TLS errors, disconnects and timeouts. */
class LockdownServiceException(val request: String, val code: String) :
    IOException("Lockdown $request failed: $code")

/** Reuses trusted keys first; remote invalid-host/pair refusals alone permit fresh Pair. */
object LockdownSavedSession {
    fun open(host: Iap2UsbMuxHost, store: LockdownPairStore, label: String,
             timeoutMillis: Long = 120000, isCancelled: () -> Boolean = { false },
             onProgress: (String) -> Unit = {}): BlockingDuplexByteStream {
        require(timeoutMillis in 1..300000)
        val end = System.nanoTime() + timeoutMillis * 1000000L
        val identity = store.loadOrCreate()
        var record = identity.paired
        var repaired = false
        var unlockReported = false
        fun remaining(): Long {
            if (isCancelled()) throw LockdownPairingException.Cancelled
            val nanos = end - System.nanoTime()
            if (nanos <= 0) throw LockdownPairingException.TimedOut
            return (nanos + 999999L) / 1000000L
        }
        fun waitForUnlock() {
            if (!unlockReported) {
                onProgress("Unlock iPhone to continue USB pairing/session; saved trust is retained")
                unlockReported = true
            }
            var delay = minOf(1000L, remaining())
            while (delay > 0) {
                val part = minOf(100L, delay, remaining())
                try { Thread.sleep(part) } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    throw LockdownPairingException.Cancelled
                }
                delay -= part
            }
        }
        while (true) {
            remaining()
            if (record == null) {
                try {
                    record = LockdownPairingClient(host).pair(label, identity.hostId, identity.systemBuid,
                        remaining(), isCancelled)
                    store.save(record)
                    onProgress("USB pairing saved for this iPhone")
                } catch (error: LockdownPairingException) {
                    if (error === LockdownPairingException.PasswordProtected ||
                        error is LockdownPairingException.RemoteError && error.code == "PasswordProtected") {
                        waitForUnlock()
                        continue
                    }
                    throw error
                }
            }
            try {
                onProgress("Opening carkit with saved USB pairing")
                return LockdownCarKitClient(host).open(record, label)
            } catch (error: LockdownServiceException) {
                if (requiresPairing(error) && !repaired) {
                    repaired = true
                    record = null
                    onProgress("iPhone rejected saved host trust; pairing again without deleting stored keys")
                    continue
                }
                if (error.code == "PasswordProtected") { waitForUnlock(); continue }
                throw error
            }
        }
    }

    internal fun requiresPairing(error: LockdownServiceException): Boolean =
        error.request == "StartSession" && error.code in setOf("InvalidHostID", "InvalidPairRecord")
}
