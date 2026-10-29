package com.playport.server

import com.shilapi.xcertplay.airplay.AirPlayUltraStatus
import io.ktor.websocket.Frame
import java.nio.file.Path
import kotlinx.coroutines.channels.Channel
import kotlinx.serialization.json.Json
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UltraStatusTest {
    @Test fun reportsPhoneOfferSeparatelyFromEnabledCapabilities() {
        val hub = WebHub(ServerConfig(identityDir = Path.of("."), stateDir = Path.of(".")), DisplayState(1280, 720, 60, 100))
        val channel = Channel<Frame>(1)
        val clientType = Class.forName("com.playport.server.WsClient")
        val constructor = clientType.getDeclaredConstructor(Channel::class.java).apply { isAccessible = true }
        val clientsField = WebHub::class.java.getDeclaredField("clients").apply { isAccessible = true }
        @Suppress("UNCHECKED_CAST")
        val clients = clientsField.get(hub) as MutableSet<Any>
        clients.add(constructor.newInstance(channel))
        try {
            hub.ultraStatus(AirPlayUltraStatus(true, true, false, false))
            val frame = channel.tryReceive().getOrThrow() as Frame.Text
            val message = Json.decodeFromString<ServerMessage>(frame.data.toString(Charsets.UTF_8))
            val status = requireNotNull(message.ultra)
            assertTrue(status.phoneOffersVehicleState)
            assertTrue(status.phoneOffersUiSync)
            assertFalse(status.vehicleStateEnabled)
            assertFalse(status.uiSyncEnabled)
        } finally { clients.clear(); channel.close() }
    }
}
