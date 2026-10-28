// SPDX-License-Identifier: GPL-3.0-only
package com.shilapi.xcertplay.transport

import com.shilapi.xcertplay.airplay.BplistCodec
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.channels.FileChannel
import java.nio.file.Files
import java.nio.file.LinkOption.NOFOLLOW_LINKS
import java.nio.file.Path
import java.nio.file.StandardCopyOption.ATOMIC_MOVE
import java.nio.file.StandardCopyOption.REPLACE_EXISTING
import java.nio.file.StandardOpenOption.WRITE
import java.nio.file.attribute.PosixFilePermissions
import java.security.MessageDigest
import java.util.Locale
import java.util.UUID

/** Contains private host keys. A malformed/insecure store is an error, never permission to re-pair. */
class LockdownPairStore(stateDirectory: Path, private val serial: String) {
    private val directory = stateDirectory.resolve("usb-pairing")
    private val filename = MessageDigest.getInstance("SHA-256").digest(serial.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it.toInt() and 255) } + ".bplist"
    private val file = directory.resolve(filename)
    private val directoryPermissions = PosixFilePermissions.fromString("rwx------")
    private val filePermissions = PosixFilePermissions.fromString("rw-------")
    private val owner = directory.fileSystem.userPrincipalLookupService.lookupPrincipalByName(System.getProperty("user.name"))

    init {
        require(serial.isNotBlank() && '\u0000' !in serial) { "Explicit USB serial is required" }
        Files.createDirectories(stateDirectory)
        if (!Files.exists(directory, NOFOLLOW_LINKS))
            Files.createDirectory(directory, PosixFilePermissions.asFileAttribute(directoryPermissions))
        checkPrivate(directory, true)
    }

    data class Identity(val hostId: String, val systemBuid: String, val paired: PairedRecord?) {
        override fun toString() = "LockdownPairStore.Identity(redacted)"
    }

    @Synchronized fun loadOrCreate(): Identity {
        if (!Files.exists(file, NOFOLLOW_LINKS)) {
            val identity = Identity(uuid(), uuid(), null)
            write(identity)
            return identity
        }
        checkPrivate(file, false)
        try {
            val bytes = Files.newInputStream(file, NOFOLLOW_LINKS).use { it.readNBytes(MAX_BYTES + 1) }
            require(bytes.size in 1..MAX_BYTES)
            val root = BplistCodec.decode(bytes) as? Map<*, *> ?: error("Not a dictionary")
            require(root["version"] == 1L || root["version"] == 1)
            require(root["serial"] == serial)
            fun text(key: String): String = (root[key] as? String)?.takeIf { it.isNotBlank() } ?: error("Missing $key")
            val hostId = text("hostId")
            val systemBuid = text("systemBuid")
            UUID.fromString(hostId); UUID.fromString(systemBuid)
            val body = root["paired"] as? Map<*, *>
            val paired = body?.let {
                fun data(key: String) = (it[key] as? ByteArray)?.takeIf { bytes -> bytes.isNotEmpty() } ?: error("Missing $key")
                val record = LockdownPairRecord.restore(hostId, systemBuid,
                    it["wifiMacAddress"] as? String ?: error("Missing wifiMacAddress"),
                    data("devicePublicKeyPem"), data("deviceCertificatePem"), data("hostPrivateKeyPem"),
                    data("hostCertificatePem"), data("rootPrivateKeyPem"), data("rootCertificatePem"))
                PairedRecord(record, it["escrowBag"] as? ByteArray)
            }
            require(root["paired"] == null || paired != null)
            return Identity(hostId, systemBuid, paired)
        } catch (error: Exception) {
            throw IOException("Saved USB pairing is corrupt; preserved without re-pairing", error)
        }
    }

    @Synchronized fun save(paired: PairedRecord) {
        val current = loadOrCreate()
        require(current.hostId == paired.pairRecord.hostId && current.systemBuid == paired.pairRecord.systemBuid) {
            "Pairing identity does not match this device store"
        }
        write(Identity(current.hostId, current.systemBuid, paired))
    }

    private fun write(identity: Identity) {
        checkPrivate(directory, true)
        val root = linkedMapOf<String, Any?>("version" to 1L, "serial" to serial,
            "hostId" to identity.hostId, "systemBuid" to identity.systemBuid)
        identity.paired?.let { paired ->
            val p = paired.pairRecord
            root["paired"] = linkedMapOf("wifiMacAddress" to p.wifiMacAddress,
                "devicePublicKeyPem" to p.devicePublicKeyPem, "deviceCertificatePem" to p.deviceCertificatePem,
                "hostPrivateKeyPem" to p.hostPrivateKeyPem, "hostCertificatePem" to p.hostCertificatePem,
                "rootPrivateKeyPem" to p.rootPrivateKeyPem, "rootCertificatePem" to p.rootCertificatePem,
                "escrowBag" to paired.escrowBag)
        }
        val bytes = BplistCodec.encode(root)
        require(bytes.size <= MAX_BYTES) { "USB pairing record exceeds limit" }
        val temporary = Files.createTempFile(directory, ".pair-", ".tmp", PosixFilePermissions.asFileAttribute(filePermissions))
        try {
            FileChannel.open(temporary, WRITE).use { channel ->
                val buffer = ByteBuffer.wrap(bytes)
                while (buffer.hasRemaining()) channel.write(buffer)
                channel.force(true)
            }
            Files.move(temporary, file, ATOMIC_MOVE, REPLACE_EXISTING)
            checkPrivate(file, false)
        } finally { Files.deleteIfExists(temporary) }
    }

    private fun checkPrivate(path: Path, isDirectory: Boolean) {
        if (Files.isSymbolicLink(path) || (if (isDirectory) !Files.isDirectory(path, NOFOLLOW_LINKS) else !Files.isRegularFile(path, NOFOLLOW_LINKS)) ||
            Files.getOwner(path, NOFOLLOW_LINKS) != owner ||
            Files.getPosixFilePermissions(path, NOFOLLOW_LINKS) != (if (isDirectory) directoryPermissions else filePermissions))
            throw IOException("USB pairing storage must be owner-only (directory 0700, file 0600), without symlinks")
    }

    private fun uuid() = UUID.randomUUID().toString().uppercase(Locale.ROOT)
    private companion object { const val MAX_BYTES = 131072 }
}
