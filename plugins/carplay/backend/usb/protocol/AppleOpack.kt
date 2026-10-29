// SPDX-License-Identifier: GPL-3.0-or-later
// Wire format cross-checked against LIVI's GPL OPACK implementation and vectors.
package com.shilapi.xcertplay.transport

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import java.util.UUID

/** Bounded Apple OPACK values used by the CarPlay Ultra vehicle channel. */
object AppleOpack {
    private const val MAX_BYTES = 4 * 1024 * 1024
    private const val MAX_ITEMS = 16_384
    private const val MAX_DEPTH = 32

    fun decode(bytes: ByteArray): Any? {
        require(bytes.size <= MAX_BYTES) { "OPACK exceeds 4 MiB" }
        val reader = Reader(bytes)
        val result = reader.value(0)
        require(reader.at == bytes.size) { "Trailing OPACK data" }
        return result
    }

    fun encode(value: Any?): ByteArray {
        val out = ByteArrayOutputStream()
        write(out, value, 0)
        require(out.size() <= MAX_BYTES) { "OPACK exceeds 4 MiB" }
        return out.toByteArray()
    }

    private class Reader(val bytes: ByteArray) {
        var at = 0
        val seen = ArrayList<Any?>()

        fun take(count: Int): ByteArray {
            require(count >= 0 && count <= bytes.size - at) { "Truncated OPACK data" }
            val result = bytes.copyOfRange(at, at + count)
            at += count
            return result
        }

        fun unsigned(width: Int): Long {
            val data = take(width)
            var value = 0L
            for (index in data.indices.reversed()) value = (value shl 8) or (data[index].toLong() and 255)
            return value
        }

        fun signed(width: Int): Long {
            val bits = unsigned(width)
            val shift = 64 - width * 8
            return (bits shl shift) shr shift
        }

        fun length(tag: Int, base: Int): Int {
            val n = tag - base
            val length = if (n <= 32) n.toLong() else unsigned(n - 32)
            require(length in 0..MAX_BYTES.toLong()) { "OPACK length out of bounds" }
            return length.toInt()
        }

        fun remember(value: Any?): Any? {
            require(seen.size < MAX_ITEMS) { "Too many OPACK references" }
            seen.add(value)
            return value
        }

        fun value(depth: Int): Any? {
            require(depth < MAX_DEPTH) { "OPACK nesting limit" }
            val tag = unsigned(1).toInt()
            return when (tag) {
                1 -> true
                2 -> false
                4 -> null
                5 -> {
                    val data = ByteBuffer.wrap(take(16)).order(ByteOrder.BIG_ENDIAN)
                    remember(UUID(data.long, data.long))
                }
                6, 0x36 -> remember(Double.fromBits(unsigned(8)))
                0x35 -> remember(java.lang.Float.intBitsToFloat(unsigned(4).toInt()).toDouble())
                in 0x08..0x2f -> (tag - 0x08).toLong()
                in 0x30..0x33 -> remember(signed(1 shl (tag - 0x30)))
                in 0x40..0x64 -> {
                    val decoder = StandardCharsets.UTF_8.newDecoder()
                        .onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                    remember(decoder.decode(ByteBuffer.wrap(take(length(tag, 0x40)))).toString())
                }
                in 0x70..0x94 -> remember(take(length(tag, 0x70)))
                in 0xa0..0xc0 -> seen.getOrNull(tag - 0xa0) ?: throw IllegalArgumentException("Unknown OPACK reference")
                in 0xc1..0xc4 -> {
                    val index = unsigned(tag - 0xc0)
                    require(index < seen.size) { "Unknown OPACK reference" }
                    seen[index.toInt()]
                }
                in 0xd0..0xdf -> {
                    val count = if (tag == 0xdf) null else tag - 0xd0
                    val list = ArrayList<Any?>()
                    while (count == null || list.size < count) {
                        if (count == null && bytes.getOrNull(at)?.toInt() == 3) { at++; break }
                        require(list.size < MAX_ITEMS) { "Too many OPACK items" }
                        list.add(value(depth + 1))
                    }
                    list
                }
                in 0xe0..0xef -> {
                    val count = if (tag == 0xef) null else tag - 0xe0
                    val map = LinkedHashMap<Any, Any?>()
                    var items = 0
                    while (count == null || items < count) {
                        if (count == null && bytes.getOrNull(at)?.toInt() == 3) { at++; break }
                        require(items < MAX_ITEMS) { "Too many OPACK entries" }
                        val key = value(depth + 1) ?: throw IllegalArgumentException("Null OPACK key")
                        map[key] = value(depth + 1)
                        items++
                    }
                    map
                }
                else -> throw IllegalArgumentException("Unsupported OPACK tag 0x${tag.toString(16)}")
            }
        }
    }

    private fun writeLength(out: ByteArrayOutputStream, base: Int, length: Int) {
        require(length in 0..MAX_BYTES) { "OPACK length out of bounds" }
        if (length <= 32) { out.write(base + length); return }
        val width = when {
            length <= 255 -> 1
            length <= 65535 -> 2
            length <= 0xffffff -> 3
            else -> 4
        }
        out.write(base + 32 + width)
        repeat(width) { out.write(length ushr (it * 8)) }
    }

    private fun write(out: ByteArrayOutputStream, value: Any?, depth: Int) {
        require(depth < MAX_DEPTH) { "OPACK nesting limit" }
        when (value) {
            null -> out.write(4)
            true -> out.write(1)
            false -> out.write(2)
            is Byte, is Short, is Int, is Long -> {
                val n = (value as Number).toLong()
                if (n in 0..39) out.write(0x08 + n.toInt())
                else {
                    val width = when {
                        n >= Byte.MIN_VALUE && n <= Byte.MAX_VALUE -> 1
                        n >= Short.MIN_VALUE && n <= Short.MAX_VALUE -> 2
                        n >= Int.MIN_VALUE && n <= Int.MAX_VALUE -> 4
                        else -> 8
                    }
                    out.write(0x30 + Integer.numberOfTrailingZeros(width))
                    repeat(width) { out.write((n ushr (it * 8)).toInt()) }
                }
            }
            is Float, is Double -> {
                out.write(0x36)
                val bits = (value as Number).toDouble().toBits()
                repeat(8) { out.write((bits ushr (it * 8)).toInt()) }
            }
            is String -> {
                val bytes = value.toByteArray(StandardCharsets.UTF_8)
                writeLength(out, 0x40, bytes.size)
                out.write(bytes)
            }
            is ByteArray -> { writeLength(out, 0x70, value.size); out.write(value) }
            is UUID -> {
                out.write(5)
                out.write(ByteBuffer.allocate(16).order(ByteOrder.BIG_ENDIAN)
                    .putLong(value.mostSignificantBits).putLong(value.leastSignificantBits).array())
            }
            is List<*> -> {
                require(value.size <= MAX_ITEMS) { "Too many OPACK items" }
                val open = value.size > 14
                out.write(if (open) 0xdf else 0xd0 + value.size)
                value.forEach { write(out, it, depth + 1) }
                if (open) out.write(3)
            }
            is Map<*, *> -> {
                require(value.size <= MAX_ITEMS) { "Too many OPACK entries" }
                val open = value.size > 14
                out.write(if (open) 0xef else 0xe0 + value.size)
                value.forEach { (key, item) ->
                    require(key != null) { "Null OPACK key" }
                    write(out, key, depth + 1)
                    write(out, item, depth + 1)
                }
                if (open) out.write(3)
            }
            else -> throw IllegalArgumentException("Unsupported OPACK value ${value.javaClass.simpleName}")
        }
        require(out.size() <= MAX_BYTES) { "OPACK exceeds 4 MiB" }
    }
}
