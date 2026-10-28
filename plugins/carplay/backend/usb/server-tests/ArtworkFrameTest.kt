package com.playport.server

import com.shilapi.xcertplay.transport.Iap2ArtworkTransfer
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO
import org.junit.Assert.*
import org.junit.Test

class ArtworkFrameTest {
    @Test fun forwardsBoundedPngAndClearsRejectedImages() {
        val output = ByteArrayOutputStream()
        ImageIO.write(BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB), "png", output)
        val bytes = output.toByteArray()
        assertArrayEquals(byteArrayOf(7, 9) + bytes, ArtworkFrame.encode(Iap2ArtworkTransfer(9, bytes)))
        assertArrayEquals(byteArrayOf(7, 9), ArtworkFrame.encode(Iap2ArtworkTransfer(9, byteArrayOf(1, 2, 3))))
        assertArrayEquals(byteArrayOf(7, 9), ArtworkFrame.encode(Iap2ArtworkTransfer(9, ByteArray(0))))
        output.reset()
        ImageIO.write(BufferedImage(2049, 1, BufferedImage.TYPE_INT_RGB), "png", output)
        assertArrayEquals(byteArrayOf(7, 9), ArtworkFrame.encode(Iap2ArtworkTransfer(9, output.toByteArray())))
    }
}
