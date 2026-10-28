// SPDX-License-Identifier: GPL-3.0-only
package com.playport.server

import com.shilapi.xcertplay.transport.CarPlayLocationFix
import com.shilapi.xcertplay.transport.Iap2LocationProvider
import com.shilapi.xcertplay.transport.NmeaLocationEncoder
import kotlinx.serialization.Serializable
import java.io.StringReader
import java.time.Instant
import javax.xml.XMLConstants
import javax.xml.parsers.DocumentBuilderFactory
import org.w3c.dom.Element
import org.xml.sax.InputSource

@Serializable
data class DebugGpsSnapshot(
    val enabled: Boolean,
    val subscribed: Boolean,
    val lat: Double?,
    val lon: Double?,
    val speed: Double?,
    val course: Double?,
    val points: Int,
    val seconds: Double,
    val duration: Double,
    val playing: Boolean,
    val sent: Long,
    val lastSentMillis: Long?,
)

/** A debug source shared by WebSocket controls and the wired iAP2 subscription loop. */
class DebugGpsProvider(
    private val nanoTime: () -> Long = System::nanoTime,
    private val currentTimeMillis: () -> Long = System::currentTimeMillis,
) : Iap2LocationProvider {
    private var enabled = false
    private var subscribed = false
    private var fix: CarPlayLocationFix? = null
    private var track = emptyList<TrackPoint>()
    private var position = 0.0
    private var anchor = 0L
    private var playing = false
    private var rate = 1.0
    private var sent = 0L
    private var lastSentMillis: Long? = null

    @Synchronized fun setFix(lat: Double, lon: Double, speed: Double? = null, course: Double? = null, altitude: Double? = null) {
        require(speed == null || speed.isFinite() && speed in 0.0..200.0) { "GPS speed must be 0..200 m/s" }
        require(course == null || course.isFinite() && course in 0.0..<360.0) { "GPS course must be 0..<360 degrees" }
        require(altitude == null || altitude.isFinite() && altitude in -12000.0..100000.0) { "Invalid GPS altitude" }
        val next = CarPlayLocationFix(lat, lon, altitude, course, speed, accuracyMeters = 5.0)
        track = emptyList(); playing = false; position = 0.0
        fix = next; enabled = true
    }

    @Synchronized fun disable() { enabled = false; playing = false }
    @Synchronized fun loadGpx(text: String) {
        val next = GpxDebugRoute.parse(text)
        track = next; position = 0.0; playing = false; enabled = true
        fix = next.first().fix
    }
    @Synchronized fun seek(seconds: Double) {
        require(seconds.isFinite() && seconds >= 0) { "Invalid GPX seek time" }
        require(track.isNotEmpty()) { "Load a GPX route before seeking" }
        position = seconds.coerceAtMost(track.last().seconds); anchor = nanoTime()
    }
    @Synchronized fun play(active: Boolean, playbackRate: Double = 1.0) {
        require(playbackRate.isFinite() && playbackRate in 0.1..20.0) { "GPX playback rate must be 0.1..20" }
        require(track.isNotEmpty()) { "Load a GPX route before playing" }
        position = elapsed(); anchor = nanoTime(); rate = playbackRate; playing = active
    }
    @Synchronized override fun onSent() { sent++; lastSentMillis = currentTimeMillis() }
    @Synchronized override fun start(): Boolean { subscribed = true; return true }
    @Synchronized override fun stop() { subscribed = false }
    @Synchronized override fun latestNmea(): String? {
        if (!enabled || !subscribed) return null
        val latest = currentFix() ?: return null
        // GPX timestamps drive the timeline; iPhone location observations use current UTC time.
        return NmeaLocationEncoder.encode(latest.copy(timestampMillis = currentTimeMillis()))
    }
    @Synchronized fun snapshot(): DebugGpsSnapshot {
        val latest = currentFix()
        return DebugGpsSnapshot(enabled, subscribed, latest?.latitudeDegrees, latest?.longitudeDegrees,
            latest?.speedMetersPerSecond, latest?.bearingDegrees, track.size, elapsed(),
            track.lastOrNull()?.seconds ?: 0.0, playing && elapsed() < (track.lastOrNull()?.seconds ?: 0.0), sent, lastSentMillis)
    }
    private fun elapsed(): Double {
        if (track.isEmpty()) return 0.0
        val seconds = position + if (playing) (nanoTime() - anchor) / 1e9 * rate else 0.0
        return seconds.coerceIn(0.0, track.last().seconds)
    }
    private fun currentFix(): CarPlayLocationFix? {
        if (track.isEmpty()) return fix
        val time = elapsed()
        val right = track.indexOfFirst { it.seconds >= time }.coerceAtLeast(0)
        if (right == 0) return track[0].fix
        val a = track[right - 1]; val b = track[right]
        val fraction = (time - a.seconds) / (b.seconds - a.seconds)
        val deltaLon = ((b.fix.longitudeDegrees - a.fix.longitudeDegrees + 540.0) % 360.0) - 180.0
        val lon = ((a.fix.longitudeDegrees + deltaLon * fraction + 540.0) % 360.0) - 180.0
        val lat1 = Math.toRadians(a.fix.latitudeDegrees); val lat2 = Math.toRadians(b.fix.latitudeDegrees)
        val dLat = lat2 - lat1; val dLon = Math.toRadians(deltaLon)
        val haversine = kotlin.math.sin(dLat / 2).let { it * it } + kotlin.math.cos(lat1) * kotlin.math.cos(lat2) * kotlin.math.sin(dLon / 2).let { it * it }
        val distance = 6_371_000.0 * 2 * kotlin.math.asin(kotlin.math.sqrt(haversine.coerceIn(0.0, 1.0)))
        val bearing = (Math.toDegrees(kotlin.math.atan2(kotlin.math.sin(dLon) * kotlin.math.cos(lat2),
            kotlin.math.cos(lat1) * kotlin.math.sin(lat2) - kotlin.math.sin(lat1) * kotlin.math.cos(lat2) * kotlin.math.cos(dLon))) + 360.0) % 360.0
        return a.fix.copy(speedMetersPerSecond = distance / (b.seconds - a.seconds), bearingDegrees = bearing,
            latitudeDegrees = a.fix.latitudeDegrees + (b.fix.latitudeDegrees - a.fix.latitudeDegrees) * fraction,
            longitudeDegrees = lon)
    }
}

internal data class TrackPoint(val seconds: Double, val fix: CarPlayLocationFix)

internal object GpxDebugRoute {
    fun parse(text: String): List<TrackPoint> {
        require(text.toByteArray(Charsets.UTF_8).size <= 1_048_576) { "GPX exceeds 1 MiB" }
        val factory = DocumentBuilderFactory.newInstance().apply {
            isNamespaceAware = true
            setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true)
            setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
            setFeature("http://xml.org/sax/features/external-general-entities", false)
            setFeature("http://xml.org/sax/features/external-parameter-entities", false)
            setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "")
            setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "")
            isXIncludeAware = false
            isExpandEntityReferences = false
        }
        val document = factory.newDocumentBuilder().parse(InputSource(StringReader(text)))
        require(document.documentElement.localName == "gpx") { "Expected a GPX document" }
        var nodes = document.getElementsByTagNameNS("*", "trkpt")
        if (nodes.length == 0) nodes = document.getElementsByTagNameNS("*", "rtept")
        require(nodes.length in 1..10000) { "GPX needs 1..10000 track or route points" }
        var firstTime: Long? = null
        var previousSeconds = -1.0
        val points = ArrayList<TrackPoint>(nodes.length)
        for (index in 0 until nodes.length) {
            val element = nodes.item(index) as Element
            val lat = element.getAttribute("lat").toDouble()
            val lon = element.getAttribute("lon").toDouble()
            val altitude = child(element, "ele")?.toDouble()
            require(altitude == null || altitude.isFinite()) { "Invalid GPX altitude" }
            val time = child(element, "time")?.let { Instant.parse(it).toEpochMilli() }
            if (index == 0) firstTime = time
            require((time == null) == (firstTime == null)) { "GPX points must all have timestamps or all omit them" }
            val seconds = if (time != null && firstTime != null) (time - firstTime) / 1000.0 else index.toDouble()
            require(seconds.isFinite() && seconds > previousSeconds) { "GPX timestamps must increase" }
            previousSeconds = seconds
            points += TrackPoint(seconds, CarPlayLocationFix(lat, lon, altitude, accuracyMeters = 5.0))
        }
        return points
    }
    private fun child(element: Element, name: String): String? {
        val nodes = element.getElementsByTagNameNS("*", name)
        return if (nodes.length == 0) null else nodes.item(0).textContent.trim().takeIf { it.isNotEmpty() }
    }
}
