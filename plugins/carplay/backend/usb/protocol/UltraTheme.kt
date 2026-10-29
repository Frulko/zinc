package com.shilapi.xcertplay.transport

/** Apple catalog metadata for the experimental 44C9FA31EC version 985 CarDDP asset. */
object UltraTheme {
    const val assetId = "44C9FA31EC"
    const val assetVersion = 985L
    const val sdkVersion = "19.0"
    const val mainDisplay = "Center_Display"
    const val clusterDisplay = "Cluster_Display"
    // package.json: both displays are 1920 × 720 at 157 pixels per inch.
    const val displayWidthPixels = 1920
    const val displayHeightPixels = 720
    const val displayWidthMm = 311
    const val displayHeightMm = 117
    fun physicalWidthMm(pixels: Int): Int = ((pixels.toLong() * displayWidthMm + displayWidthPixels / 2) / displayWidthPixels).toInt().coerceAtLeast(1)
    fun physicalHeightMm(pixels: Int): Int = ((pixels.toLong() * displayHeightMm + displayHeightPixels / 2) / displayHeightPixels).toInt().coerceAtLeast(1)
    const val layoutId = "6C45CC47-EC01-527A-B40D-1316AA9C936F"
    const val paletteId = "custom"
    val activeComponents = mapOf(
        "85313C05-0812-5C3A-A757-A384402DA8E0" to "C62F3137-B953-5C93-91A0-D1FCA0535D31",
        "D6E7BC4C-744C-5944-BA96-8F578A31ED6D" to "8D56ED3C-CA1D-5110-B846-EC79FF4A2A93",
        "22E31B11-2B54-551A-95BC-1A02AD962407" to "F428A1E8-4A36-5588-8986-6CB204FAEFDB",
        "675E1D2C-402C-58A5-A99F-279EACF20573" to "B8D32D28-CD61-57E7-887D-3FC66B888A36",
    )

    // Explicit opt-in: the accessory must advertise one consistent theme in iAP2 and AirPlay.
    fun enabled(): Boolean = System.getenv("ZINC_CARPLAY_ULTRA_THEME") == "$assetId:$assetVersion" && System.getenv("ZINC_CARPLAY_CLUSTER") == "1"
}
