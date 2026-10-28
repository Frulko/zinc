package com.playport.server

import java.nio.file.Files
import org.junit.Assert.*
import org.junit.Test

class DebugGpsRoutingTest {
    @Test fun debugGpsCommandsWorkBeforePhoneSessionAndRejectInvalidFixes() {
        val directory = Files.createTempDirectory("carplay-debug-routing-")
        try {
            CarPlayServer(ServerConfig(stateDir = directory, identityDir = directory, bindAddress = "127.0.0.1")).use { server ->
                val route = CarPlayServer::class.java.getDeclaredMethod("routeInput", ClientMessage::class.java)
                route.isAccessible = true
                route.invoke(server, ClientMessage(type = "debugGps", lat = 48.0, lon = 2.0, gpsEnabled = true))
                assertTrue(server.debugGps.snapshot().enabled)
                assertFalse(server.debugGps.snapshot().subscribed)
                route.invoke(server, ClientMessage(type = "debugGps", lat = 91.0, lon = 2.0))
                assertEquals(48.0, server.debugGps.snapshot().lat!!, 0.0)
                route.invoke(server, ClientMessage(type = "debugGpx", gpx = "<gpx><trkpt lat='48' lon='2'/><trkpt lat='48.1' lon='2.1'/></gpx>"))
                assertEquals(2, server.debugGps.snapshot().points)
                route.invoke(server, ClientMessage(type = "debugGpsSeek", seekSeconds = 0.5))
                assertEquals(48.05, server.debugGps.snapshot().lat!!, 0.0001)
                route.invoke(server, ClientMessage(type = "debugGps", gpsEnabled = false))
                assertFalse(server.debugGps.snapshot().enabled)
                assertEquals(System.getenv("ZINC_CARPLAY_CLUSTER") == "1", server.airPlayConfig.cluster != null)
            }
        } finally {
            Files.walk(directory).use { paths -> paths.sorted(Comparator.reverseOrder()).forEach { Files.delete(it) } }
        }
    }
}
