#!/usr/bin/env python3
"""Fresh and repeated overlays must produce identical, compilable source."""
from pathlib import Path
import subprocess
import sys
import tempfile

script = Path(__file__).resolve().parents[1] / 'prepare'
with tempfile.TemporaryDirectory(prefix='carplay-usb-prepare-') as temporary:
    root = Path(temporary) / 'receiver'
    subprocess.run(['git', 'clone', '-q', '--shared', sys.argv[1], str(root)], check=True)
    main = root / 'server/src/main/kotlin/com/playport/server/Main.kt'
    gradle = root / 'protocol/build.gradle.kts'
    subprocess.run([str(script), str(root)], check=True)
    tls = root / 'server/src/main/kotlin/com/playport/server/TlsCertificate.kt'
    server = root / 'server/src/main/kotlin/com/playport/server/CarPlayServer.kt'
    info = root / "protocol/src/main/java/com/shilapi/xcertplay/airplay/AirPlayInfoPlist.kt"
    session = root / "protocol/src/main/java/com/shilapi/xcertplay/airplay/AirPlaySession.kt"
    bridge = root / "server/src/main/kotlin/com/playport/server/WebBridge.kt"
    uplink = root / "server/src/main/kotlin/com/playport/server/MicUplink.kt"
    wireless = root / "server/src/main/kotlin/com/playport/server/WirelessBootstrap.kt"
    wireless_control = root / "protocol/src/main/java/com/shilapi/xcertplay/transport/Iap2WirelessControlClient.kt"
    hub = root / "server/src/main/kotlin/com/playport/server/WebHub.kt"
    iap2_session = root / "protocol/src/main/java/com/shilapi/xcertplay/iap2/session/Iap2Session.kt"
    identification = root / "protocol/src/main/java/com/shilapi/xcertplay/transport/Iap2IdentificationClient.kt"
    formatter = root / "protocol/src/main/java/com/shilapi/xcertplay/iap2/trace/Iap2FrameFormatter.kt"
    messages = root / "protocol/src/main/java/com/shilapi/xcertplay/iap2/message/Iap2Messages.kt"
    catalog = root / "protocol/src/main/java/com/shilapi/xcertplay/iap2/catalog/Iap2Endpoint.kt"
    sources = [catalog, messages, formatter, identification, iap2_session, main, gradle, tls, server, info, session, bridge, uplink, wireless, wireless_control, hub]
    first = [source.read_bytes() for source in sources]
    initializer = main.read_text().split('    val wired = try {', 1)[1].split('    val server =', 1)[0]
    assert 'wired?.close()' not in initializer, 'initializer cannot close an uninitialized value'
    subprocess.run([str(script), str(root)], check=True)
    assert first == [source.read_bytes() for source in sources], 'warm overlay differs from fresh checkout'
print('PASS fresh/repeated backend overlay')
