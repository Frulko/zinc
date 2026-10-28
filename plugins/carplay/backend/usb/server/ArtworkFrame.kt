package com.playport.server

import com.shilapi.xcertplay.transport.Iap2ArtworkTransfer
import java.io.ByteArrayInputStream
import javax.imageio.ImageIO
import javax.imageio.stream.MemoryCacheImageInputStream

/** Wire type 7: transfer ID, then a bounded PNG/JPEG, or no image bytes to clear. */
internal object ArtworkFrame {
    fun encode(transfer: Iap2ArtworkTransfer): ByteArray {
        val data = transfer.bytes
        if (data.isEmpty()) return byteArrayOf(7, transfer.id.toByte())
        val valid = data.size <= 2 * 1024 * 1024 && runCatching {
            MemoryCacheImageInputStream(ByteArrayInputStream(data)).use { input ->
                val readers = ImageIO.getImageReaders(input)
                if (!readers.hasNext()) return@use false
                val reader = readers.next()
                try {
                    reader.input = input
                    reader.formatName.lowercase() in setOf("png", "jpeg") &&
                        reader.getWidth(0) in 1..2048 && reader.getHeight(0) in 1..2048
                } finally { reader.dispose() }
            }
        }.getOrDefault(false)
        return byteArrayOf(7, transfer.id.toByte()) + if (valid) data else byteArrayOf()
    }
}
