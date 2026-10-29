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
    server_config = root / 'server/src/main/kotlin/com/playport/server/ServerConfig.kt'
    gradle = root / 'protocol/build.gradle.kts'
    subprocess.run([str(script), str(root)], check=True)
    tls = root / 'server/src/main/kotlin/com/playport/server/TlsCertificate.kt'
    server = root / 'server/src/main/kotlin/com/playport/server/CarPlayServer.kt'
    info = root / "protocol/src/main/java/com/shilapi/xcertplay/airplay/AirPlayInfoPlist.kt"
    session = root / "protocol/src/main/java/com/shilapi/xcertplay/airplay/AirPlaySession.kt"
    airplay_config = root / "protocol/src/main/java/com/shilapi/xcertplay/airplay/AirPlayConfig.kt"
    media = root / "protocol/src/main/java/com/shilapi/xcertplay/airplay/CarPlayMediaEngine.kt"
    vehicle = root / "protocol/src/main/java/com/shilapi/xcertplay/transport/UltraVehicleState.kt"
    ui_sync = root / "protocol/src/main/java/com/shilapi/xcertplay/transport/UltraUiSync.kt"
    theme = root / "protocol/src/main/java/com/shilapi/xcertplay/transport/UltraTheme.kt"
    tunnel = root / "protocol/src/main/java/com/shilapi/xcertplay/airplay/IapTunnel.kt"
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
    sources = [catalog, messages, formatter, identification, iap2_session, main, server_config, gradle, tls, server, info, session, airplay_config, media, vehicle, ui_sync, theme, tunnel, bridge, uplink, wireless, wireless_control, hub]
    first = [source.read_bytes() for source in sources]
    initializer = main.read_text().split('    val wired = try {', 1)[1].split('    val server =', 1)[0]
    assert 'wired?.close()' not in initializer, 'initializer cannot close an uninitialized value'
    assert 'ZINC_CARPLAY_WIFI_PASSPHRASE' in server_config.read_text()
    assert '"ultraGauge" ->' in server.read_text(), 'Ultra gauge WebSocket command missing'
    assert 'ultraUiSync = System.getenv("ZINC_CARPLAY_ULTRA_UI_SYNC") == "1" && UltraTheme.enabled()' in server.read_text()
    assert 'main = if (UltraTheme.enabled()) AirPlayDisplayConfig(' in server.read_text()
    assert 'heightPixels = if (UltraTheme.enabled()) UltraTheme.displayHeightPixels else ClusterDimensions.height' in server.read_text()
    assert 'themeAssetIdentifier' in identification.read_text()
    assert 'Cluster_Display' in theme.read_text()
    assert '"uiSync" in offered' in session.read_text()
    assert 'ULTRA_UI_SYNC_UUID' in media.read_text()
    subprocess.run([str(script), str(root)], check=True)
    assert first == [source.read_bytes() for source in sources], 'warm overlay differs from fresh checkout'
print('PASS fresh/repeated backend overlay')
