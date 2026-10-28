// SPDX-License-Identifier: GPL-3.0-only
package com.shilapi.xcertplay.transport

import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test

class NativeUsbHostTest {
    @Test fun nativeDiscoveryAndMissingDeviceAreActionable() {
        assumeTrue(System.getenv("ZINC_CARPLAY_USB_LIBRARY") != null)
        NativeUsb.list() // Descriptor discovery does not claim, configure or reset a device.
        try { NativeUsb.open("", false); fail("empty serial accepted") }
        catch (error: java.io.IOException) { assertTrue(error.message!!.contains("explicit iPhone USB serial")) }
        try { NativeUsb.open("ZINC-NONEXISTENT-USB-TEST", false); fail("missing phone accepted") }
        catch (error: java.io.IOException) { assertTrue(error.message!!.contains("No matching")) }
    }
}
