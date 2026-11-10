import { Config } from './config';

export function deployment(data: string, config: Config): void {
  if (config.local) { console.log('Local HTTP mode binds only 127.0.0.1. Use HTTPS setup for deployment.'); return; }
  const directory = JSON.stringify(data.replace(/%/g, '%%'));
  console.log('[Unit]\nDescription=Zinc call server\nAfter=network-online.target\n\n[Service]\nType=simple\nUser=zinc-call\nGroup=zinc-call');
  console.log('WorkingDirectory=/opt/zinc-call\nExecStart=/opt/zinc-call/call-server run --data ' + directory);
  console.log('Environment=ZINC=/usr/local/bin/zinc\nRestart=on-failure\nRestartSec=5\nKillMode=control-group\nTimeoutStopSec=10\nLimitNOFILE=65536');
  console.log('AmbientCapabilities=CAP_NET_BIND_SERVICE\nCapabilityBoundingSet=CAP_NET_BIND_SERVICE\nNoNewPrivileges=true\nPrivateTmp=true\nProtectSystem=strict\nProtectHome=true');
  console.log('ReadWritePaths=' + directory + ' /var/lib/zinc-call\nEnvironment=ZINC_HOME=/var/lib/zinc-call\n\n[Install]\nWantedBy=multi-user.target');
  console.log('\nFirewall input: allow TCP ' + config.port + ', UDP ' + config.udpPort + (config.turn === '' ? '' : ', UDP and TCP ' + config.turn.slice(1)) + '.');
  console.log('For HTTP-01 certificate renewal also allow TCP 80 to the ACME client. Apply rules with your existing firewall; no rules were changed.');
  if (config.turn !== '') {
    console.log('Built-in TURN has no peer allowlist or relay port-range option. Before public deployment, use the restricted coturn configuration in README.md and disable built-in TURN.');
  }
  console.log('coturn peer restriction template (replace SERVER_IPV4 with the SFU server address; add each own IPv6 address explicitly):');
  console.log('denied-peer-ip=0.0.0.0-255.255.255.255\ndenied-peer-ip=::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff\nallowed-peer-ip=SERVER_IPV4');
}
