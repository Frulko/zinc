#!/usr/bin/env python3
"""Exercise the BlueZ helper contract and byte pump without Bluetooth hardware."""
from pathlib import Path
import os
import runpy
import socket
import threading
import unittest

bridge = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'bt-bridge'))

class BridgeTest(unittest.TestCase):
    def test_addresses(self):
        self.assertEqual('AA:BB:CC:DD:EE:FF', bridge['address']('aa:bb:cc:dd:ee:ff'))
        with self.assertRaises(Exception):
            bridge['address']('not a Bluetooth address')

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
