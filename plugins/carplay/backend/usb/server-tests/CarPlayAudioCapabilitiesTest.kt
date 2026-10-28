package com.playport.server

import com.shilapi.xcertplay.airplay.AirPlayInfoPlist
import java.nio.file.Files
import org.junit.Assert.*
import org.junit.Test

class CarPlayAudioCapabilitiesTest {
    @Test fun receiverAdvertisesPlaybackAndMicrophoneFormatsWithoutStartingCapture() {
        val directory = Files.createTempDirectory("carplay-audio-info-")
        try {
            CarPlayServer(ServerConfig(stateDir = directory, identityDir = directory, bindAddress = "127.0.0.1")).use { server ->
                assertFalse(server.airPlayConfig.disableAudioOutput)
                assertTrue(server.airPlayConfig.microphone)
                val info = AirPlayInfoPlist.build(server.airPlayConfig)
                val displays = info["displays"] as List<*>
                assertTrue(displays.isNotEmpty())
                for (display in displays) {
                    val descriptor = display as Map<*, *>
                    for (key in listOf("uiAppearanceMode", "uiAppearanceSetting", "mapAppearanceMode", "mapAppearanceSetting"))
                        assertEquals(key, 0, descriptor[key])
                }
                val formats = info["audioFormats"] as List<*>
                val main = formats.filterIsInstance<Map<*, *>>().single { it["type"] == 100 && it["audioType"] == "default" }
                assertTrue((main["audioOutputFormats"] as Number).toLong() != 0L)
                assertTrue((main["audioInputFormats"] as Number).toLong() != 0L)
                val media = formats.filterIsInstance<Map<*, *>>().single { it["type"] == 102 && it["audioType"] == "media" }
                assertTrue((media["audioOutputFormats"] as Number).toLong() != 0L)
            }
        } finally {
            Files.walk(directory).use { paths -> paths.sorted(Comparator.reverseOrder()).forEach { Files.delete(it) } }
        }
    }
}
