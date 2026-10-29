package com.shilapi.xcertplay.transport

import com.shilapi.xcertplay.airplay.AirPlayConfig
import com.shilapi.xcertplay.airplay.AirPlayDisplayConfig
import com.shilapi.xcertplay.airplay.AirPlayInfoPlist
import com.shilapi.xcertplay.iap2.body.Iap2BodyReader
import org.junit.Assert.assertEquals
import org.junit.Test

class UltraThemeAdvertisementTest {
    @Test fun themeIdentityAndPanelNamesAgreeOnBothTransports() {
        val base = Iap2IdentificationConfig("PlayPort", "playport", "Zinc", "serial", "1.0", "1.0", 3,
            themeAssetIdentifier = "44C9FA31EC")
        assertEquals("44C9FA31EC", Iap2BodyReader.of(Iap2IdentificationClient.identificationInformation(base)).group(16).string(6))
        assertEquals("44C9FA31EC", Iap2BodyReader.of(Iap2IdentificationClient.identificationInformation(
            base.copy(wireless = Iap2WirelessIdentification("02:00:00:00:00:01", "PlayPort")))).group(24).string(6))

        val info = AirPlayInfoPlist.build(AirPlayConfig("PlayPort", "02:00:00:00:00:02", "02:00:00:00:00:02", "366.0",
            AirPlayDisplayConfig(1280, 720), cluster = AirPlayDisplayConfig(960, 360),
            mainDisplayId = "Center_Display", clusterDisplayId = "Cluster_Display"))
        val displays = info["displays"] as List<*>
        assertEquals(listOf("Center_Display", "Cluster_Display"), displays.map { (it as Map<*, *>)["uuid"] })
        val panels = UltraUiSync.displayPanels(displays)
        assertEquals(listOf("Center_Display", "Cluster_Display"), panels.map { it["uid"] })
        assertEquals("Cluster_Display", ((panels[1]["displayPlugins"] as List<*>)[0] as Map<*, *>)["uid"])
    }
}
