// SPDX-License-Identifier: GPL-3.0-only
package com.shilapi.xcertplay.transport

import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.PosixFilePermissions
import org.junit.Assert.*
import org.junit.Test

class UsbLockdownPairStoreTest {
    private fun withDirectory(body: (Path) -> Unit) {
        val directory = Files.createTempDirectory("zinc-usb-pair-store-")
        try { body(directory) } finally {
            Files.walk(directory).use { stream -> stream.sorted(Comparator.reverseOrder()).forEach { Files.delete(it) } }
        }
    }
    private fun file(directory: Path): Path = Files.list(directory.resolve("usb-pairing")).use { stream -> stream.findFirst().get() }
    private fun paired(identity: LockdownPairStore.Identity) = PairedRecord(LockdownPairRecord.restore(
        identity.hostId, identity.systemBuid, "02:00:00:00:00:01",
        byteArrayOf(1), byteArrayOf(2), byteArrayOf(3), byteArrayOf(4), byteArrayOf(5), byteArrayOf(6)), byteArrayOf(7))

    @Test fun stableIdentityAndPrivatePairMaterialSurviveNewStoreInstance() = withDirectory { directory ->
        val store = LockdownPairStore(directory, "phone-1")
        val first = store.loadOrCreate()
        assertNull(first.paired)
        val reopened = LockdownPairStore(directory, "phone-1").loadOrCreate()
        assertEquals(first.hostId, reopened.hostId)
        assertEquals(first.systemBuid, reopened.systemBuid)
        store.save(paired(first))
        val saved = LockdownPairStore(directory, "phone-1").loadOrCreate()
        assertArrayEquals(byteArrayOf(3), saved.paired!!.pairRecord.hostPrivateKeyPem)
        assertArrayEquals(byteArrayOf(5), saved.paired!!.pairRecord.rootPrivateKeyPem)
        assertArrayEquals(byteArrayOf(7), saved.paired!!.escrowBag)
        assertEquals(PosixFilePermissions.fromString("rw-------"), Files.getPosixFilePermissions(file(directory)))
        assertEquals(PosixFilePermissions.fromString("rwx------"), Files.getPosixFilePermissions(directory.resolve("usb-pairing")))
        assertNotEquals(first.hostId, LockdownPairStore(directory, "phone-2").loadOrCreate().hostId)
    }

    @Test fun corruptOrExposedStoreIsPreservedAndRefused() = withDirectory { directory ->
        val store = LockdownPairStore(directory, "phone-1")
        store.loadOrCreate()
        val path = file(directory)
        Files.write(path, byteArrayOf(9, 9))
        try { store.loadOrCreate(); fail("corruption accepted") } catch (_: IOException) { }
        assertArrayEquals(byteArrayOf(9, 9), Files.readAllBytes(path))
        Files.setPosixFilePermissions(path, PosixFilePermissions.fromString("rw-r--r--"))
        try { store.loadOrCreate(); fail("public keys accepted") } catch (_: IOException) { }
        assertArrayEquals(byteArrayOf(9, 9), Files.readAllBytes(path))
    }

    @Test fun symlinkIsRefused() = withDirectory { directory ->
        val store = LockdownPairStore(directory, "phone-1")
        store.loadOrCreate()
        val path = file(directory)
        val outside = directory.resolve("outside")
        Files.write(outside, byteArrayOf(8))
        Files.delete(path)
        Files.createSymbolicLink(path, outside)
        try { store.loadOrCreate(); fail("symlink accepted") } catch (_: IOException) { }
        assertArrayEquals(byteArrayOf(8), Files.readAllBytes(outside))
    }

    @Test fun mismatchedIdentityCannotReplaceSavedKeys() = withDirectory { directory ->
        val store = LockdownPairStore(directory, "phone-1")
        val first = store.loadOrCreate()
        store.save(paired(first))
        val path = file(directory)
        val before = Files.readAllBytes(path)
        val foreign = LockdownPairStore(directory, "phone-2").loadOrCreate()
        try { store.save(paired(foreign)); fail("foreign identity accepted") } catch (_: IllegalArgumentException) { }
        assertArrayEquals(before, Files.readAllBytes(path))
    }

    @Test fun repairOnlyForExplicitStartSessionTrustRefusal() {
        for (code in listOf("InvalidHostID", "InvalidPairRecord"))
            assertTrue(LockdownSavedSession.requiresPairing(LockdownServiceException("StartSession", code)))
        for (code in listOf("PasswordProtected", "PairingDialogResponsePending", "UserDeniedPairing", "DeviceDisconnected", "UnknownError"))
            assertFalse(LockdownSavedSession.requiresPairing(LockdownServiceException("StartSession", code)))
        assertFalse(LockdownSavedSession.requiresPairing(LockdownServiceException("StartService", "InvalidHostID")))
    }
}
