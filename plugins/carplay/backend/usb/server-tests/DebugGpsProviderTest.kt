// SPDX-License-Identifier: GPL-3.0-only
package com.playport.server

import org.junit.Assert.*
import org.junit.Test

class DebugGpsProviderTest {
    private val gpx = """<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>
        <trkpt lat="0" lon="2"><time>2020-01-01T00:00:00Z</time></trkpt>
        <trkpt lat="10" lon="2"><time>2020-01-01T00:00:10Z</time></trkpt>
        </trkseg></trk></gpx>"""

    @Test fun onlyRequestedSentenceTypesAreEmitted() {
        val gps = DebugGpsProvider()
        gps.setFix(48.0, 2.0)
        gps.onRequested(setOf(0, 2, 0x8001)); gps.start()
        assertTrue(gps.latestNmea()!!.startsWith("\$GPRMC,"))
        assertFalse(gps.latestNmea()!!.contains("GGA"))
        assertEquals(listOf(0, 2, 0x8001), gps.snapshot().requested)
    }
    @Test fun onlySubscribedEnabledFixesAreSent() {
        val gps = DebugGpsProvider(currentTimeMillis = { 1_700_000_000_000L })
        gps.setFix(48.0, 2.0, 4.0, 90.0)
        assertNull(gps.latestNmea())
        gps.onRequested(setOf(1, 2)); assertTrue(gps.start())
        assertTrue(gps.latestNmea()!!.contains("4800.0000,N"))
        gps.onSent(); assertEquals(1L, gps.snapshot().sent); assertNotNull(gps.snapshot().lastSentMillis)
        gps.disable(); assertNull(gps.latestNmea())
        gps.setFix(49.0, 3.0); assertNotNull(gps.latestNmea())
        gps.stop(); assertNull(gps.latestNmea())
    }
    @Test fun gpxCanSeekAndPlayWithoutUsingHistoricalObservationTime() {
        var now = 0L
        val gps = DebugGpsProvider(nanoTime = { now }, currentTimeMillis = { 1_700_000_000_000L })
        gps.loadGpx(gpx); gps.onRequested(setOf(1, 2)); gps.start(); gps.seek(5.0)
        assertEquals(5.0, gps.snapshot().lat!!, 0.0001)
        assertEquals(10.0, gps.snapshot().duration, 0.0)
        assertFalse(gps.latestNmea()!!.contains("010120"))
        gps.play(true, 2.0); now += 1_000_000_000
        assertEquals(7.0, gps.snapshot().lat!!, 0.0001)
        gps.seek(100.0); assertEquals(10.0, gps.snapshot().seconds, 0.0)
        assertFalse(gps.snapshot().playing)
    }
    @Test fun invalidFixesAndUnsafeDocumentsAreRejected() {
        fun rejects(action: () -> Unit) {
            try { action(); fail("Expected rejection") } catch (_: Exception) { }
        }
        val gps = DebugGpsProvider()
        rejects { gps.setFix(Double.NaN, 0.0) }
        rejects { gps.setFix(0.0, 181.0) }
        rejects { gps.setFix(0.0, 0.0, speed = -1.0) }
        rejects { gps.seek(Double.NaN) }
        rejects { gps.loadGpx("<!DOCTYPE gpx [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><gpx>&x;</gpx>") }
        rejects { gps.loadGpx("<gpx>" + " ".repeat(1_048_576) + "</gpx>") }
        rejects { gps.loadGpx("<gpx><trkpt lat='91' lon='0'/></gpx>") }
        rejects { gps.loadGpx(gpx.replace("00:00:10Z", "00:00:00Z")) }
    }
}
