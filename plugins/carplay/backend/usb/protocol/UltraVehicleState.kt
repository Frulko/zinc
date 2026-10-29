// SPDX-License-Identifier: GPL-3.0-or-later
// Vehicle State wire identifiers cross-checked against LIVI's GPL implementation.
package com.shilapi.xcertplay.transport

/** Small, explicit vehicle profile for the Ultra Vehicle State DataStream. */
class UltraVehicleState {
    private data class Characteristic(
        val iid: Long, val type: Long, val format: Long, val initial: Any,
        val writable: Boolean = false, val units: Long? = null, val maximum: Long? = null,
    ) {
        fun plist(): Map<String, Any?> = linkedMapOf<String, Any?>(
            "iid" to iid, "type" to type, "format" to format,
            "mutable" to true, "writable" to writable, "oemWritable" to true,
            "priority" to 1L, "initialValue" to initial,
        ).apply {
            units?.let { this["units"] = it }
            maximum?.let { this["minimumValue"] = 0L; this["maximumValue"] = it; this["stepValue"] = 1L }
        }
    }

    private data class Service(val iid: Long, val type: Long, val characteristics: List<Characteristic>) {
        fun plist(): Map<String, Any?> = mapOf(
            "iid" to iid, "type" to type, "characteristics" to characteristics.map { it.plist() },
        )
    }

    private data class Accessory(val iid: Long, val type: Long, val services: List<Service>) {
        fun plist(): Map<String, Any?> = mapOf(
            "iid" to iid, "type" to type, "version" to "1.0", "services" to services.map { it.plist() },
        )
    }

    private val accessories = listOf(
        Accessory(2560, 0x09000005, listOf(Service(2561, 0x1a00000f, listOf(
            Characteristic(2562, 0x30000024, 3, 0L, units = 981, maximum = 8000),
        )))),
        Accessory(1536, 0x09000006, listOf(Service(1537, 0x1a000005, listOf(
            Characteristic(1538, 0x41000002, 1, 50L, units = 1205, maximum = 100),
        )))),
        Accessory(512, 0x01000001, listOf(
            Service(513, 0x11000001, listOf(Characteristic(514, 0x31000002, 0, true, writable = true))),
            Service(518, 0x11000002, listOf(Characteristic(520, 0x31000017, 9, 21.0, writable = true, units = 1082))),
        )),
    )
    private val characteristics = accessories.flatMap { it.services }.flatMap { it.characteristics }.associateBy { it.iid }
    private val values = characteristics.mapValuesTo(LinkedHashMap()) { it.value.initial }
    private val followed = HashSet<Long>()

    fun infoEntry(): Map<String, Any?> = mapOf(
        "protocolVersion" to "1.0", "pluginCount" to 1L,
        "pluginMapping" to mapOf("Zinc" to 0L),
        "pluginConfigs" to listOf(mapOf("name" to "Zinc", "pluginID" to 0L,
            "accessories" to accessories.map { it.plist() })),
    )

    /** Returns protocol replies only; caller sends each on the same encrypted lane. */
    @Synchronized fun handle(message: ByteArray): List<ByteArray> {
        val outer = runCatching { AppleOpack.decode(message) as? Map<*, *> }.getOrNull() ?: return emptyList()
        if (outer["pluginID"] != 0L) return emptyList()
        val body = outer["pluginData"] as? ByteArray ?: return emptyList()
        val request = runCatching { AppleOpack.decode(body) as? Map<*, *> }.getOrNull() ?: return emptyList()
        val transaction = request["transactionID"]
        val result = when (request["command"]) {
            "configRequest" -> mapOf("command" to "configResponse", "transactionID" to transaction,
                "values" to mapOf("accessories" to accessories.map { it.plist() }))
            "registerRequest" -> {
                val wanted = (request["values"] as? List<*>)?.mapNotNull { it as? Long }.orEmpty()
                followed.addAll(wanted)
                val held = wanted.filter { it in values }.associateWith { values.getValue(it) }
                val missing = wanted.filter { it !in values }.associateWith { -6727L }
                linkedMapOf<String, Any?>("command" to "registerResponse", "transactionID" to transaction,
                    "values" to held).apply { if (missing.isNotEmpty()) this["errors"] = missing }
            }
            "writeRequest" -> {
                val writes = request["values"] as? Map<*, *> ?: emptyMap<Any, Any>()
                val errors = linkedMapOf<Long, Long>()
                for ((key, value) in writes) {
                    val iid = key as? Long ?: continue
                    val spec = characteristics[iid]
                    val accepted = when (iid) {
                        514L -> value is Boolean
                        520L -> value is Number && value.toDouble() in 16.0..30.0
                        else -> false
                    }
                    errors[iid] = if (spec?.writable == true && accepted) 0 else -6727
                    if (errors[iid] == 0L) values[iid] = if (iid == 520L) (value as Number).toDouble() else value as Any
                }
                mapOf("command" to "writeResponse", "transactionID" to transaction, "errors" to errors)
            }
            "controlRequest" -> {
                val controls = request["values"] as? Map<*, *> ?: emptyMap<Any, Any>()
                mapOf("command" to "controlResponse", "transactionID" to transaction,
                    "errors" to controls.keys.filterIsInstance<Long>().associateWith { -6735L })
            }
            else -> return emptyList()
        }
        return listOf(wrap(result))
    }

    @Synchronized fun setGauge(iid: Long, value: Any): ByteArray? {
        val accepted = when (iid) {
            2562L -> value is Long && value in 0..8000
            1538L -> value is Long && value in 0..100
            514L -> value is Boolean
            520L -> value is Double && value in 16.0..30.0
            else -> false
        }
        require(accepted) { "Invalid Ultra gauge $iid" }
        if (values[iid] == value) return null
        values[iid] = value
        return if (iid in followed) wrap(mapOf("command" to "updateNotify", "values" to mapOf(iid to value))) else null
    }

    @Synchronized fun snapshot(): Map<Long, Any> = values.toMap()

    @Synchronized fun resetSubscriptions() { followed.clear() }

    private fun wrap(inner: Map<String, Any?>): ByteArray = AppleOpack.encode(mapOf(
        "pluginID" to 0L, "pluginData" to AppleOpack.encode(inner),
    ))
}
