package com.playport.server

import com.shilapi.xcertplay.airplay.PairingStore
import java.nio.file.Path
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PairingManagementTest {
    private class FakeBluetooth(var ids: Set<String>?) : BluetoothPairings {
        override fun list(): Set<String>? = ids
        override fun details(id: String): BluetoothDeviceDetails? =
            if (id in (ids ?: emptySet())) BluetoothDeviceDetails("Test iPhone", true, true, true, false) else null
        override fun remove(id: String) { ids = (ids ?: emptySet()) - id }
    }

    @Test fun listsExactIdentifiersAndForgetsOnlyTheChosenRecord() {
        val air = "02:E4:59:A3:0F:E9"
        val bt = "B8:01:1F:5F:98:10"
        val deleted = mutableListOf<String>()
        val store = PairingStore(onDelete = { deleted.add(it) })
        store.save(air, byteArrayOf(1, 2))
        val bluetooth = FakeBluetooth(setOf(bt))
        val manager = PairingManager(store, bluetooth)

        assertEquals(listOf(air, bt), manager.snapshot().devices.map { it.id })
        assertNotNull(manager.snapshot().devices.first().airPlayKeyFingerprint)
        assertEquals("Test iPhone", manager.snapshot().devices.last().name)
        assertEquals(true, manager.snapshot().devices.last().connected)
        assertEquals(true, manager.snapshot().devices.last().trusted)
        manager.forget(air)
        assertEquals(listOf(air), deleted)
        assertEquals(setOf(bt), bluetooth.ids)
        assertFalse(manager.snapshot().devices.single().airPlay)
        manager.forget(bt)
        assertTrue(manager.snapshot().devices.isEmpty())
    }

    @Test fun rejectsUnknownIdentifierWithoutDeletingAKey() {
        val store = PairingStore()
        store.save("02:E4:59:A3:0F:E9", byteArrayOf(7))
        val manager = PairingManager(store, FakeBluetooth(null))
        try {
            manager.forget("00:00:00:00:00:01")
            throw AssertionError("Unknown identifier accepted")
        } catch (_: IllegalStateException) { }
        assertEquals(1, manager.snapshot().devices.size)
        assertFalse(manager.snapshot().bluetoothAvailable)
    }

    @Test fun activeSessionKeepsTheNameReceivedBeforeActivation() {
        val hub = WebHub(ServerConfig(identityDir = Path.of("."), stateDir = Path.of(".")), DisplayState(1280, 720, 60, 100))
        hub.setSessionState(true, "Test iPhone")
        hub.setSessionState(true, null)
        assertEquals("Test iPhone", hub.phoneName())
        hub.setSessionState(false, null)
        assertEquals(null, hub.phoneName())
    }
}
