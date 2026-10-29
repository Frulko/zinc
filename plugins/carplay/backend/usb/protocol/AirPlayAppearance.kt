// SPDX-License-Identifier: GPL-3.0-only
package com.shilapi.xcertplay.transport

import com.shilapi.xcertplay.airplay.AirPlayInfoPlist

/** Newer phones also accept UI/map appearance updates addressed to the projected display. */
object AirPlayAppearance {
    fun commands(night: Boolean, cluster: Boolean, mainId: String = AirPlayInfoPlist.MAIN_UUID, clusterId: String = AirPlayInfoPlist.ALT_UUID): List<Map<String, Any?>> = buildList {
        add(linkedMapOf("type" to "setNightMode", "params" to linkedMapOf("nightMode" to night)))
        for (uuid in if (cluster) listOf(mainId, clusterId) else listOf(mainId)) {
            add(update("uiAppearanceUpdate", night, uuid))
            add(update("mapAppearanceUpdate", night, uuid))
        }
    }

    private fun update(type: String, night: Boolean, uuid: String): Map<String, Any?> = linkedMapOf(
        "type" to type,
        "params" to linkedMapOf(
            "uuid" to uuid,
            "appearanceMode" to if (night) 1 else 0,
            "appearanceSetting" to 0,
        ),
    )
}
