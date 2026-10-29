// SPDX-License-Identifier: GPL-3.0-only
package com.shilapi.xcertplay.transport

import com.shilapi.xcertplay.airplay.AirPlayInfoPlist
import com.shilapi.xcertplay.airplay.BplistCodec
import org.junit.Assert.*
import org.junit.Test

class AirPlayAppearanceTest {
    @Test fun dayAndNightEncodeLegacyAndDisplayAddressedCommands() {
        for (night in listOf(false, true)) {
            for (cluster in listOf(false, true)) {
                val commands = AirPlayAppearance.commands(night, cluster).map { BplistCodec.decode(BplistCodec.encode(it)) as Map<*, *> }
                assertEquals(if (cluster) listOf("setNightMode", "uiAppearanceUpdate", "mapAppearanceUpdate", "uiAppearanceUpdate", "mapAppearanceUpdate")
                             else listOf("setNightMode", "uiAppearanceUpdate", "mapAppearanceUpdate"), commands.map { it["type"] })
                assertEquals(night, (commands[0]["params"] as Map<*, *>)["nightMode"])
                for ((index, command) in commands.drop(1).withIndex()) {
                    val params = command["params"] as Map<*, *>
                    assertEquals(if (index < 2) AirPlayInfoPlist.MAIN_UUID else AirPlayInfoPlist.ALT_UUID, params["uuid"])
                    assertEquals(if (night) 1 else 0, (params["appearanceMode"] as Number).toInt())
                    assertEquals(0, (params["appearanceSetting"] as Number).toInt())
                }
            }
        }
    }
}
