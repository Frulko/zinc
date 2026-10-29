# Wired receiver overlay

Source: https://github.com/shihabal3amri/DiPlay at
`615b32ce0b40cd0b99ce94ba23a512001553684f`, GPL-3.0 (LICENSE).
Preserve DiPlay, xcertplay and LIVI attribution when distributing this backend.

USBMUX, NTB16, Ethernet/IPv6, Lockdown pairing/TLS/carkit and wired iAP2 files
in protocol/ are upstream ports. Android USB calls are replaced by native
libusb; Android Log by SLF4J; Base64 by JDK Base64; Xml by KXML2 2.3.0 (BSD,
https://kxml.sourceforge.net/). Optional GPS reporting is outside this port.
Tests with upstream class names come from the same pinned DiPlay revision.
Pair certificates preserve the upstream empty issuer/subject names. The dedicated
USB TLS certificate reader selects the already-installed Bouncy Castle provider
explicitly, because the JDK default reader rejects that profile. The bootstrap
generates uppercase host and system UUIDs as DiPlay CarPlayController does. KXML2 is instantiated explicitly; it
does not implement Android's PROCESS_DOCDECL feature or resolve external entities.

native/ uses libusb >= 1.0.25 (LGPL-2.1+, https://libusb.info/) through its
Darwin IOKit backend, and the macOS utun kernel interface. Descriptor matching,
mode request 0xc0/0x52/value0/index4 and USB bulk endpoint selection follow
DiPlay's IphoneCarPlayConfiguration, IphoneUsbHost and NcmFunctionDiscovery.
The native utun bridge replaces Android VpnService for the NCM IPv6 link.

This entire directory is part of the separately distributed GPL receiver.
Nothing is linked into Zinc. Distribute the original sources, overlay, dependency
licences and PlayPort notices with binaries; no identity credentials are included.

The dedicated Lockdown TLS context and key manager use BCJSSE from
org.bouncycastle:bctls-jdk18on:1.79, with the existing bcprov 1.79 crypto provider
(Bouncy Castle licence, https://www.bouncycastle.org/licence.html). Explicit
provider instances keep the process-wide JSSE provider and policy unchanged.
The JDK default SunJSSE parser rejects the iPhone's empty-issuer certificates
even when a compatible CertificateFactory was used to load our local identity.
The regression completes mutual TLS 1.2 and exchanges encrypted application
data with this certificate profile, without changing global providers.

The debug GPS path additionally ports `Iap2LocationClient.kt` and its location
client/reporter tests from the same pinned DiPlay revision. The synchronized GPX
provider and HUD debug adapter are local additions, reusing the existing JVM XML
parser and typed iAP2 codecs. The USB pair store and saved-session policy are local
additions. No pairing keys or hardware captures are included.

Artwork support ports Iap2LinkEngine, Iap2LinkChannel, Iap2CsmChannel,
Iap2FileTransferReceiver and iap2/session/Iap2Session from the same DiPlay pin,
with its file-transfer and link-engine tests. This routes negotiated session12
file datagrams separately from session10 CSM controls. Local ArtworkFrame checks
PNG/JPEG dimensions with JDK ImageIO in memory; no new image library is added.

Iap2TelemetrySchema uses field mappings from the pinned LIVI message schemas
(now_playing, route_guidance, power and communications) and DiPlay lane capacity.
Formatting/validation stays in the pinned typed iAP2 codec. The live inspector,
recording/export and restricted TX routing are local additions. User-supplied
Apple PDF excerpts were read locally and are not copied into this repository.
