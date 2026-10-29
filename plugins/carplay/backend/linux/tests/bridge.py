#!/usr/bin/env python3
"""Exercise the BlueZ helper contract and byte pump without Bluetooth hardware."""
from pathlib import Path
import os
import runpy
import socket
import threading
import unittest
from unittest.mock import patch
import subprocess

bridge = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'bt-bridge'))

class BridgeTest(unittest.TestCase):
    def test_addresses(self):
        self.assertEqual('AA:BB:CC:DD:EE:FF', bridge['address']('aa:bb:cc:dd:ee:ff'))
        with self.assertRaises(Exception):
            bridge['address']('not a Bluetooth address')

    def test_local_address_uses_bluez_controller(self):
        output = 'Controller b8:27:eb:2e:aa:28 zinc-player [default]\n\tPowered: yes\n'
        with patch.object(subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, output)) as run:
            self.assertEqual('B8:27:EB:2E:AA:28', bridge['local_address']())
            self.assertEqual(['bluetoothctl', 'show'], run.call_args.args[0])

    def test_rfcomm_uses_standard_socket_and_connects_once(self):
        with patch.dict(socket.__dict__, {'AF_BLUETOOTH': 31, 'BTPROTO_RFCOMM': 3}):
            with patch.object(socket, 'socket') as create:
                self.assertIs(create.return_value,
                              bridge['open_rfcomm']('AA:BB:CC:DD:EE:FF', 1))
                create.assert_called_once_with(31, socket.SOCK_STREAM, 3)
                create.return_value.connect.assert_called_once_with(('AA:BB:CC:DD:EE:FF', 1))
                self.assertEqual([15, None],
                                 [call.args[0] for call in create.return_value.settimeout.call_args_list])

    def test_rfcomm_closes_socket_when_connect_fails(self):
        with patch.dict(socket.__dict__, {'AF_BLUETOOTH': 31, 'BTPROTO_RFCOMM': 3}):
            with patch.object(socket, 'socket') as create:
                create.return_value.connect.side_effect = OSError(77, 'bad socket state')
                with self.assertRaises(OSError):
                    bridge['open_rfcomm']('AA:BB:CC:DD:EE:FF', 1)
                create.return_value.close.assert_called_once()

    def test_bidirectional_binary_stdio_and_eof(self):
        peer, local = socket.socketpair()
        input_read, input_write = os.pipe()
        output_read, output_write = os.pipe()
        worker = threading.Thread(target=bridge['pump'], args=(local, input_read, output_write))
        worker.start()
        try:
            peer.settimeout(2)
            os.write(input_write, b'\x00\xffiap2')
            self.assertEqual(b'\x00\xffiap2', peer.recv(6))
            peer.sendall(b'\xff\x00reply')
            self.assertEqual(b'\xff\x00reply', os.read(output_read, 7))
            os.close(input_write); input_write = -1
            worker.join(2)
            self.assertFalse(worker.is_alive())
        finally:
            peer.close(); local.close()
            for fd in (input_read, input_write, output_read, output_write):
                if fd >= 0: os.close(fd)

if __name__ == '__main__': unittest.main()
