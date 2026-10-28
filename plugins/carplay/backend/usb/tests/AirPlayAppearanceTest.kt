// SPDX-License-Identifier: GPL-3.0-only
package com.shilapi.xcertplay.transport

import com.shilapi.xcertplay.airplay.AirPlayInfoPlist
import com.shilapi.xcertplay.airplay.BplistCodec
import org.junit.Assert.*
import org.junit.Test

class AirPlayAppearanceTest {
    @Test fun dayAndNightEncodeLegacyAndDisplayAddressedCommands() {
        for (night in listOf(false, true)) {
            val commands = AirPlayAppearance.commands(night).map { BplistCodec.decode(BplistCodec.encode(it)) as Map<*, *> }
            assertEquals(listOf("setNightMode", "uiAppearanceUpdate", "mapAppearanceUpdate"), commands.map { it["type"] })
            assertEquals(night, (commands[0]["params"] as Map<*, *>)["nightMode"])
            for (command in commands.drop(1)) {
                val params = command["params"] as Map<*, *>
                assertEquals(AirPlayInfoPlist.MAIN_UUID, params["uuid"])
                assertEquals(if (night) 1 else 0, (params["appearanceMode"] as Number).toInt())
                assertEquals(0, (params["appearanceSetting"] as Number).toInt())
            }
        }
    }
}
