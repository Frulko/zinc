package com.shilapi.xcertplay.transport

import com.shilapi.xcertplay.iap2.body.Iap2BodyReader
import org.junit.Assert.*
import org.junit.Test

class Iap2LocationIdentificationTest {
    private fun config() = Iap2IdentificationConfig(
        name = "PlayPort", modelIdentifier = "playport", manufacturer = "Zinc",
        serialNumber = "test", firmwareVersion = "1.0", hardwareVersion = "1.0",
        carPlayUsbInterfaceNumber = 3, locationInformationEnabled = true,
    )
    @Test fun externalLocationIncludesVehicleIdentityOnUsbAndWireless() {
        for (wireless in listOf(null, Iap2WirelessIdentification("02:00:00:00:00:01", "test"))) {
            val body = Iap2BodyReader.of(Iap2IdentificationClient.identificationInformation(config().copy(wireless = wireless)))
            val vehicle = body.group(20)
            assertEquals(3, vehicle.u16(0)); assertEquals("PlayPort", vehicle.string(1))
            assertFalse(vehicle.has(2)) // No invented engine/fuel information.
            assertFalse(body.has(21))
            assertTrue(0x5204 in body.u16List(7)); assertEquals(64, body.group(30).u16(7)); assertEquals(8, body.group(30).u16(8))
            assertTrue(body.group(22).has(17)); assertTrue(body.group(22).has(18))
        }
    }
    @Test fun existingElectricVehicleIdentityIsNotDuplicated() {
        val body = Iap2BodyReader.of(Iap2IdentificationClient.identificationInformation(config().copy(vehicleStatusEnabled = true)))
        assertEquals(1, body.all(20).size)
        assertTrue(body.group(20).has(2)); assertTrue(body.has(21))
    }
}
