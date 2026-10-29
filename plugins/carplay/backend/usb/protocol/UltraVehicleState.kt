// SPDX-License-Identifier: GPL-3.0-or-later
// Vehicle State wire identifiers cross-checked against LIVI's GPL implementation.
package com.shilapi.xcertplay.transport

/** Small, explicit vehicle profile for the Ultra Vehicle State DataStream. */
class UltraVehicleState {
    private data class Characteristic(
        val iid: Long, val type: Long, val format: Long, val initial: Any,
        val writable: Boolean = false, val units: Long? = null, val minimum: Number = 0,
        val maximum: Number? = null, val step: Number = 1,
        val mutable: Boolean = true, val large: Boolean = false,
    ) {
        fun plist(): Map<String, Any?> = linkedMapOf<String, Any?>(
            "iid" to iid, "type" to type, "format" to format,
            "mutable" to mutable, "writable" to writable, "oemWritable" to true,
            "priority" to 1L, "initialValue" to initial,
        ).apply {
            units?.let { this["units"] = it }
            maximum?.let {
                this["minimumValue"] = if (format == 9L) minimum.toDouble() else minimum.toLong()
                this["maximumValue"] = if (format == 9L) it.toDouble() else it.toLong()
                this["stepValue"] = if (format == 9L) step.toDouble() else step.toLong()
            }
            if (format in 10L..13L) this["maximumLength"] = if (large) 2_147_483_647L else 65_535L
            if (large) this["largePayload"] = true
        }
    }

    private data class Service(val iid: Long, val type: Long, val characteristics: List<Characteristic>, val controls: List<Map<String, Any?>> = emptyList()) {
        fun plist(): Map<String, Any?> = linkedMapOf<String, Any?>(
            "iid" to iid, "type" to type, "characteristics" to characteristics.map { it.plist() },
        ).apply { if (controls.isNotEmpty()) this["controls"] = controls }
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
        Accessory(1536, 0x09000006, listOf(
            Service(1537, 0x1a000005, listOf(
                Characteristic(1538, 0x41000002, 1, 68L, units = 1205, maximum = 100),
                Characteristic(1539, 0x4100001a, 1, 10L, units = 1205, maximum = 100, mutable = false),
            )),
            Service(1540, 0x1a000015, listOf(
                Characteristic(1541, 0x3000004a, 4, 420L, units = 151, maximum = 10000),
                Characteristic(1542, 0x3000004b, 4, 261L, units = 164, maximum = 10000),
                Characteristic(1543, 0x36000023, 0, false),
            )),
        )),
        Accessory(512, 0x01000001, listOf(
            Service(513, 0x11000001, listOf(
                Characteristic(514, 0x31000002, 0, true, writable = true),
                Characteristic(515, 0x31000003, 0, true, writable = true),
                Characteristic(516, 0x31000022, 0, false, writable = true),
                Characteristic(517, 0x31000029, 0, false, writable = true),
            )),
            Service(518, 0x11000002, listOf(
                Characteristic(519, 0x30000002, 0, true, writable = true),
                Characteristic(520, 0x31000017, 9, 21.0, writable = true, units = 1082, minimum = 16, maximum = 30, step = 0.5),
                Characteristic(521, 0x31000019, 9, 21.0, units = 1082, minimum = -40, maximum = 85, step = 0.5),
                Characteristic(522, 0x36000065, 10, "seat_front_left", mutable = false),
            )),
            Service(532, 0x11000002, listOf(
                Characteristic(533, 0x30000002, 0, true, writable = true),
                Characteristic(534, 0x31000017, 9, 21.0, writable = true, units = 1082, minimum = 16, maximum = 30, step = 0.5),
                Characteristic(535, 0x31000019, 9, 21.0, units = 1082, minimum = -40, maximum = 85, step = 0.5),
                Characteristic(536, 0x36000065, 10, "seat_front_right", mutable = false),
            )),
            Service(523, 0x11000007, listOf(
                Characteristic(524, 0x30000002, 0, true, writable = true),
                Characteristic(525, 0x31000012, 1, 2L, writable = true, maximum = 7),
                Characteristic(526, 0x3000005f, 0, true, writable = true),
                Characteristic(531, 0x36000065, 10, "seat_front", mutable = false),
            )),
            Service(527, 0x11000011, listOf(Characteristic(528, 0x30000002, 0, false, writable = true))),
            Service(529, 0x11000008, listOf(Characteristic(530, 0x30000002, 0, true, writable = true))),
            Service(537, 0x11000012, listOf(
                Characteristic(538, 0x30000002, 0, false, writable = true),
                Characteristic(539, 0x36000065, 10, "seat_front", mutable = false),
            )),
        )),
        Accessory(1024, 0x01500001, listOf(
            Service(1025, 0x22000001, listOf(
                Characteristic(1026, 0x31000021, 7, 0L, writable = true, maximum = 2),
                Characteristic(1027, 0x30000002, 0, false, writable = true),
                Characteristic(1028, 0x36000065, 10, "seat_front_left", mutable = false),
            )),
            Service(1029, 0x22000001, listOf(
                Characteristic(1030, 0x31000021, 7, 0L, writable = true, maximum = 2),
                Characteristic(1031, 0x30000002, 0, false, writable = true),
                Characteristic(1032, 0x36000065, 10, "seat_front_right", mutable = false),
            )),
        )),
        Accessory(1792, 0x04000001, listOf(Service(1797, 0x1a00000a, listOf(
            Characteristic(1798, 0x3000004a, 4, 12345L, units = 151, maximum = 999999),
            Characteristic(1799, 0x3000004b, 4, 7671L, units = 164, maximum = 999999),
        )))),
        Accessory(2048, 0x0a000001, listOf("tire_front_left", "tire_front_right", "tire_rear_left", "tire_rear_right").mapIndexed { index, key ->
            val iid = 2049L + index * 5
            Service(iid, 0x1b000001, listOf(
                Characteristic(iid + 1, 0x3000001b, 3, 240L, units = 932, maximum = 1000),
                Characteristic(iid + 2, 0x36000065, 10, key, mutable = false),
                Characteristic(iid + 3, 0x3000001c, 1, 1L, maximum = 5),
                Characteristic(iid + 4, 0x3000001a, 1, 1L, maximum = 4),
            ))
        }),
        Accessory(4096, 0x03000001, listOf(Service(4097, 0x14000006, listOf(
            Characteristic(4098, 0x30000019, 10, "DAB", mutable = false),
            Characteristic(4099, 0x32000025, 1, 6L, mutable = false),
            Characteristic(4100, 0x32000011, 0, false),
            Characteristic(4101, 0x30000001, 10, "Radio simulée"),
            Characteristic(4102, 0x32000026, 10, "inter"),
            Characteristic(4103, 0x32000012, 13, listOf(
                radioItem("inter", "France Inter"), radioItem("fip", "FIP"), radioItem("info", "France Info"),
            ), large = true),
            Characteristic(4104, 0x32000031, 13, emptyList<Any>(), large = true),
        )))),
        Accessory(4352, 0x0F000001, listOf(Service(4353, 0x14000001, listOf(
            Characteristic(4354, 0x32000023, 10, "DAB"),
            Characteristic(4355, 0x32000003, 10, "France Inter"),
            Characteristic(4356, 0x32000004, 10, "Radio simulée"),
            Characteristic(4357, 0x32000005, 10, ""),
            Characteristic(4358, 0x32000020, 11, byteArrayOf(), large = true),
            Characteristic(4359, 0x32000034, 1, 0L),
        ), radioControls()))),
    )

    private fun radioItem(id: String, name: String): Map<String, Any> = mapOf(
        "identifier" to id, "mediaItemName" to name, "mediaItemShortName" to name,
        "mediaItemType" to "dab", "ensemble" to "Zinc demo", "mediaItemCategory" to 0L,
    )

    private fun radioControls(): List<Map<String, Any?>> = listOf(
        4360L to 0x0F000032L, 4361L to 0x0F000033L, 4362L to 0x0F000035L,
        4363L to 0x0F000036L, 4364L to 0x0F00004BL, 4365L to 0x0F00004CL,
        4366L to 0x0F00004DL,
    ).map { (iid, type) -> linkedMapOf<String, Any?>("iid" to iid, "type" to type, "sender" to 0L, "hasResponse" to true).apply {
        if (iid == 4364L || iid == 4365L || iid == 4366L) this["requestParameters"] = when (iid) {
            4364L -> listOf(mapOf("name" to "identifier", "format" to 10L), mapOf("name" to "sourceIdentifier", "format" to 10L))
            4365L -> listOf(mapOf("name" to "frequency", "format" to 3L), mapOf("name" to "sourceIdentifier", "format" to 10L))
            else -> listOf(mapOf("name" to "identifier", "format" to 10L))
        }
    } }
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
    @Synchronized fun handle(message: ByteArray, trace: (String) -> Unit = {}): List<ByteArray> {
        val outer = runCatching { AppleOpack.decode(message) as? Map<*, *> }.getOrNull() ?: return emptyList()
        if (outer["pluginID"] != 0L) return emptyList()
        val body = outer["pluginData"] as? ByteArray ?: return emptyList()
        val request = runCatching { AppleOpack.decode(body) as? Map<*, *> }.getOrNull() ?: return emptyList()
        val transaction = request["transactionID"]
        val command = request["command"] as? String ?: return emptyList()
        val traceValues = when (val requested = request["values"]) {
            is Map<*, *> -> requested.entries.joinToString(limit = 12) { (iid, value) -> "$iid=${value.toString().take(60)}" }
            is List<*> -> requested.take(32).joinToString()
            else -> ""
        }
        trace("$command tx=$transaction values=${traceValues.take(400)}")
        val before = values.toMap()
        val result = when (command) {
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
                        514L, 515L, 516L, 517L, 519L, 524L, 526L, 528L, 530L,
                        533L, 538L, 1027L, 1031L -> value is Boolean
                        520L, 534L -> value is Number && value.toDouble() in 16.0..30.0 && value.toDouble() * 2 % 1 == 0.0
                        525L -> value is Number && value.toLong() in 0..7 && value.toDouble() == value.toLong().toDouble()
                        1026L, 1030L -> value is Number && value.toLong() in 0..2 && value.toDouble() == value.toLong().toDouble()
                        else -> false
                    }
                    errors[iid] = if (spec?.writable == true && accepted) 0 else -6727
                    if (errors[iid] == 0L) values[iid] = when (iid) {
                        520L, 534L -> (value as Number).toDouble()
                        525L, 1026L, 1030L -> (value as Number).toLong()
                        else -> value as Any
                    }
                }
                mapOf("command" to "writeResponse", "transactionID" to transaction, "errors" to errors)
            }
            "controlRequest" -> {
                val controls = request["values"] as? Map<*, *> ?: emptyMap<Any, Any>()
                val accepted = linkedMapOf<Long, Any?>()
                val errors = linkedMapOf<Long, Long>()
                for ((key, parameter) in controls) {
                    val iid = key as? Long ?: continue
                    val data = parameter as? Map<*, *> ?: emptyMap<Any, Any>()
                    val source = data["sourceIdentifier"] as? String
                    val station = data["identifier"] as? String
                    val ok = when (iid) {
                        4360L -> { values[4359L] = 1L; true }
                        4361L -> { values[4359L] = 0L; true }
                        4362L, 4363L -> { selectRadio(if (iid == 4362L) nextRadio(1) else nextRadio(-1)); true }
                        4364L -> if ((source == null || source == "DAB") && station != null && station in radioNames) { selectRadio(station); true } else false
                        4366L -> if (station == "DAB") { values[4359L] = 1L; true } else false
                        else -> false
                    }
                    if (ok) accepted[iid] = null else errors[iid] = -6735L
                }
                linkedMapOf<String, Any?>("command" to "controlResponse", "transactionID" to transaction).apply {
                    if (accepted.isNotEmpty()) this["values"] = accepted
                    if (errors.isNotEmpty()) this["errors"] = errors
                }
            }
            else -> return emptyList()
        }
        val changed = values.filter { (iid, value) -> iid in followed && before[iid] != value }
        return listOf(wrap(result)) + if (changed.isEmpty()) emptyList() else listOf(wrap(mapOf("command" to "updateNotify", "values" to changed)))
    }

    @Synchronized fun setGauge(iid: Long, value: Any): ByteArray? {
        val accepted = when (iid) {
            2562L -> value is Long && value in 0..8000
            1538L -> value is Long && value in 0..100
            1541L, 1542L -> value is Long && value in 0..10000
            1798L, 1799L -> value is Long && value in 0..999999
            2050L, 2055L, 2060L, 2065L -> value is Long && value in 0..1000
            525L -> value is Long && value in 0..7
            514L, 515L, 516L, 517L, 519L, 524L, 526L, 528L, 530L,
            533L, 538L, 1027L, 1031L -> value is Boolean
            520L, 534L -> value is Double && value in 16.0..30.0 && value * 2 % 1 == 0.0
            else -> false
        }
        require(accepted) { "Invalid Ultra gauge $iid" }
        val before = values.toMap()
        values[iid] = value
        if (iid == 1538L) {
            val kilometers = ((value as Long) * 620 + 50) / 100
            values[1541L] = kilometers
            values[1542L] = (kilometers * 1000 + 804) / 1609
        }
        val changed = values.filter { (key, current) -> key in followed && before[key] != current }
        return if (changed.isEmpty()) null else wrap(mapOf("command" to "updateNotify", "values" to changed))
    }

    private val radioNames = mapOf("inter" to "France Inter", "fip" to "FIP", "info" to "France Info")

    private fun nextRadio(step: Int): String {
        val ids = radioNames.keys.toList()
        val current = ids.indexOf(values[4102L] as? String)
        return ids[(current + step + ids.size) % ids.size]
    }

    private fun selectRadio(id: String) {
        values[4102L] = id
        values[4355L] = radioNames.getValue(id)
        values[4359L] = 1L
    }

    @Synchronized fun setRadio(id: String): ByteArray? {
        require(id in radioNames) { "Unknown simulated radio station" }
        if (values[4102L] == id && values[4359L] == 1L) return null
        selectRadio(id)
        val changed = mapOf(4102L to values.getValue(4102L), 4355L to values.getValue(4355L), 4359L to values.getValue(4359L))
        val subscribed = changed.filterKeys { it in followed }
        return if (subscribed.isEmpty()) null else wrap(mapOf("command" to "updateNotify", "values" to subscribed))
    }

    @Synchronized fun snapshot(): Map<Long, Any> = values.toMap()

    @Synchronized fun resetSubscriptions() { followed.clear() }

    private fun wrap(inner: Map<String, Any?>): ByteArray = AppleOpack.encode(mapOf(
        "pluginID" to 0L, "pluginData" to AppleOpack.encode(inner),
    ))
}
