package com.playport.server

internal object ClusterDimensions {
    fun dimension(value: String?, fallback: Int): Int {
        if (value == null) return fallback
        val pixels = value.toIntOrNull()
        require(pixels != null && pixels in 64..4096 && pixels % 2 == 0) {
            "Cluster dimensions must be even pixel counts from 64 to 4096"
        }
        return pixels
    }
    val width = dimension(System.getenv("ZINC_CARPLAY_CLUSTER_WIDTH"), 960)
    val height = dimension(System.getenv("ZINC_CARPLAY_CLUSTER_HEIGHT"), 360)
}
