// SPDX-License-Identifier: GPL-3.0-only
package com.shilapi.xcertplay.transport

import com.shilapi.xcertplay.airplay.AirPlayInfoPlist

/** Newer phones also accept UI/map appearance updates addressed to the projected display. */
object AirPlayAppearance {
    fun commands(night: Boolean): List<Map<String, Any?>> = listOf(
        linkedMapOf("type" to "setNightMode", "params" to linkedMapOf("nightMode" to night)),
        update("uiAppearanceUpdate", night),
        update("mapAppearanceUpdate", night),
    )

    private fun update(type: String, night: Boolean): Map<String, Any?> = linkedMapOf(
        "type" to type,
        "params" to linkedMapOf(
            "uuid" to AirPlayInfoPlist.MAIN_UUID,
            "appearanceMode" to if (night) 1 else 0,
            "appearanceSetting" to 0,
        ),
    )
}
