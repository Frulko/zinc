package com.playport.server

import com.shilapi.xcertplay.iap2.catalog.*
import com.shilapi.xcertplay.iap2.body.Iap2BodyReader
import com.shilapi.xcertplay.iap2.session.Iap2Session
import com.shilapi.xcertplay.iap2.message.Iap2ControlMessages
import com.shilapi.xcertplay.iap2.wire.*
import com.shilapi.xcertplay.transport.*
import kotlinx.serialization.Serializable

@Serializable data class Iap2Capability(
    val id: Int, val name: String, val feature: String, val direction: String,
    val schema: String, val samplePayload: String, val declared: Boolean, val tx: Long, val rx: Long, val sensitive: Boolean,
)
@Serializable data class Iap2InspectorSnapshot(
    val connected: Boolean, val tracing: Boolean, val catalog: List<Iap2Capability>, val subscriptions: List<Int>,
)

/** Uses the existing session trace; no second iAP2 reader competes with the protocol loop. */
class Iap2LiveTrace(
    private var enabled: Boolean = System.getenv("ZINC_CARPLAY_IAP2_TRACE") == "1",
    private val output: (String) -> Unit,
) {
    private val messageId = Regex("0x([0-9a-fA-F]{4})")
    private val samples = Iap2ControlMessages.subscriptions().associate { it.messageId to it.payload.joinToString("") { b -> "%02x".format(b.toInt() and 255) } }
    private val tx = mutableMapOf<Int, Long>()
    private val rx = mutableMapOf<Int, Long>()
    private val subscriptions = mutableSetOf<Int>()
    private var session: Iap2Session? = null
    private var declaredTx = emptySet<Int>()
    private var declaredRx = emptySet<Int>()
    @Synchronized fun attach(channel: Iap2Session, config: Iap2IdentificationConfig) {
        val body = Iap2BodyReader.of(Iap2IdentificationClient.identificationInformation(config))
        declaredTx = body.u16List(6).toSet(); declaredRx = body.u16List(7).toSet()
        session = channel
    }
    @Synchronized fun tracing(value: Boolean) { enabled = value }
    @Synchronized fun accept(text: String) {
        val id = messageId.find(text)?.groupValues?.get(1)?.toInt(16) ?: return
        val outgoing = text.startsWith("IAP2 TX")
        val counts = if (outgoing) tx else rx
        counts[id] = (counts[id] ?: 0) + 1
        if (outgoing) when (id) {
            0x5000, 0x5200, 0xae00, 0x4157, 0x4154 -> subscriptions += id
            0x5002 -> subscriptions -= 0x5000
            0x5203 -> subscriptions -= 0x5200
            0xae02 -> subscriptions -= 0xae00
            0x4159 -> subscriptions -= 0x4157
            0x4156 -> subscriptions -= 0x4154
        }
        if (!enabled) return
        output("${java.time.Instant.now()} " + if (sensitive(id)) text.lineSequence().first().take(240) + " [body omitted]" else text.take(8192))
    }
    @Synchronized fun snapshot(): Iap2InspectorSnapshot = Iap2InspectorSnapshot(
        session?.isClosed == false, enabled, (Iap2Endpoints.ALL +
            (tx.keys + rx.keys + declaredTx + declaredRx).filter { Iap2Endpoints.byId(it) == null }.sorted().map {
                Iap2TelemetrySchema.endpoint(it) ?: Iap2Endpoint(it, "Unknown", "Unclassified", Iap2Direction.BIDIRECTIONAL, Iap2Confidence.MEDIUM)
            }).map { original ->
            val endpoint = Iap2TelemetrySchema.endpoint(original.id) ?: original
            Iap2Capability(endpoint.id, endpoint.name, endpoint.feature, when (endpoint.direction) {
                Iap2Direction.IPHONE_TO_ACCESSORY -> "RX"
                Iap2Direction.ACCESSORY_TO_IPHONE -> "TX"
                Iap2Direction.BIDIRECTIONAL -> "RX/TX"
            }, schema(endpoint.fields), samples[endpoint.id].orEmpty(), endpoint.id in declaredTx || endpoint.id in declaredRx,
                tx[endpoint.id] ?: 0, rx[endpoint.id] ?: 0, sensitive(endpoint.id))
        }, subscriptions.sorted(),
    )
    fun send(id: Int, hex: String) {
        val channel = synchronized(this) {
            require(id in declaredTx && !sensitive(id)) { "Message not declared for TX on this link, or managed by authentication" }
            val endpoint = Iap2Endpoints.byId(id) ?: error("Unknown message")
            require(endpoint.direction != Iap2Direction.IPHONE_TO_ACCESSORY) { "RX-only message" }
            session?.takeUnless { it.isClosed } ?: error("No authenticated iAP2 link")
        }
        val payload = payload(hex)
        channel.send(Iap2Frame(id, payload), 1000)
    }
    companion object {
        fun sensitive(id: Int): Boolean = id == 0x4301 || id ushr 8 in setOf(0xaa, 0x1d, 0x57)
        fun payload(hex: String): ByteArray {
            require(hex.length <= 12288) { "Payload exceeds 4096 bytes" }
            val clean = hex.filterNot { it.isWhitespace() }
            require(clean.length % 2 == 0 && clean.length <= 8192 && clean.all { it.digitToIntOrNull(16) != null }) { "Invalid hex payload" }
            return ByteArray(clean.length / 2) { clean.substring(it * 2, it * 2 + 2).toInt(16).toByte() }.also { Iap2ParameterList.parse(it) }
        }
        private fun schema(fields: List<Iap2FieldSpec>): String = fields.joinToString("; ") {
            "${it.id}:${it.name} ${it.type}" + if (it.children.isEmpty()) "" else " {${schema(it.children)}}"
        }
    }
}
