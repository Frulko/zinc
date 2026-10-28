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
