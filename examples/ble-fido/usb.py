#!/usr/bin/env python3
"""Pont USB <-> U2F (FIDO1), même protocole que bridge.swift, via libfido2 (brew install libfido2).
Aucun appairage : on branche la clé, un toucher valide chaque opération.
Commandes (stdin) : version | register | auth <credid-hex> <pubkey-hex> | quit
Sortie            : STATE scan|found <nom> usb|ready   OP <op> touch   OK <op> ...   ERR <op> ...
Test sans clé     : python3 usb.py selftest
"""
import base64, hashlib, os, subprocess, sys, tempfile, time

RP = "zinc.demo"  # l'« origine » U2F de la démo
# En-tête DER d'une clé publique ECDSA P-256 (SubjectPublicKeyInfo) ; le point non compressé de 65 octets suit.
SPKI = bytes.fromhex("3059301306072a8648ce3d020106082a8648ce3d030107034200")


def b64(b): return base64.b64encode(b).decode()


def point_from_pem(pem):
    der = base64.b64decode("".join(l for l in pem.splitlines() if l and not l.startswith("-----")))
    return der[-65:]  # ponytail: suppose une clé P-256 (U2F l'impose)


def pem_from_point(point):
    body = b64(SPKI + point)
    return "-----BEGIN PUBLIC KEY-----\n" + "\n".join(body[i:i + 64] for i in range(0, len(body), 64)) + "\n-----END PUBLIC KEY-----\n"


def run(args, stdin=""):
    return subprocess.run(args, input=stdin, capture_output=True, text=True)


def find_device():
    r = run(["fido2-token", "-L"])
    for line in r.stdout.splitlines():
        if ": " in line:
            path, rest = line.split(": ", 1)
            return path, rest.split("(")[-1].rstrip(")") if "(" in rest else rest
    return None


def say(s): print(s, flush=True)


def register(dev):
    cdh = os.urandom(32)
    say("OP register touch")
    r = run(["fido2-cred", "-M", "-u", dev], f"{b64(cdh)}\n{RP}\ndemo\n{b64(os.urandom(16))}\n")
    lines = r.stdout.splitlines()
    if r.returncode != 0 or len(lines) < 6:
        say("ERR register " + (r.stderr.strip() or "refusé (clé non touchée ?)")); return
    v = run(["fido2-cred", "-V"], r.stdout)  # vérifie aussi la signature d'attestation ; sort la clé publique en PEM
    if v.returncode != 0:
        say("ERR register attestation invalide"); return
    say(f"OK register {point_from_pem(v.stdout).hex()} {base64.b64decode(lines[4]).hex()}")


def auth(dev, credid_hex, pub_hex):
    cdh = os.urandom(32)
    say("OP auth touch")
    r = run(["fido2-assert", "-G", "-u", "-p", dev], f"{b64(cdh)}\n{RP}\n{b64(bytes.fromhex(credid_hex))}\n")
    lines = r.stdout.splitlines()
    if r.returncode != 0 or len(lines) < 4:
        say("ERR auth " + (r.stderr.strip() or "refusé (clé non touchée, ou key handle inconnu)")); return
    ad = base64.b64decode(lines[2])  # authData = rpIdHash(32) | flags(1) | compteur(4)
    with tempfile.NamedTemporaryFile("w", suffix=".pem") as f:
        f.write(pem_from_point(bytes.fromhex(pub_hex))); f.flush()
        ok = run(["fido2-assert", "-V", "-p", f.name, "es256"], r.stdout).returncode == 0
    say(f"OK auth presence={ad[32] & 1} counter={int.from_bytes(ad[33:37], 'big')} signature={'VALIDE' if ok else 'INVALIDE'}")


def version(dev):
    r = run(["fido2-token", "-I", dev])
    say("OK version " + ("U2F_V2" if "U2F_V2" in r.stdout else (r.stdout.strip().splitlines() or ["inconnue"])[0]))


def selftest():
    # aller-retour point <-> PEM sur une vraie clé P-256 générée par openssl
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(["openssl", "ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", d + "/k.pem"], check=True, capture_output=True)
        pem = subprocess.run(["openssl", "ec", "-in", d + "/k.pem", "-pubout"], check=True, capture_output=True, text=True).stdout
    p = point_from_pem(pem)
    assert len(p) == 65 and p[0] == 4, "point P-256 non compressé attendu"
    assert point_from_pem(pem_from_point(p)) == p
    assert pem_from_point(p).strip() == pem.strip(), "le PEM reconstruit doit être identique à celui d'openssl"
    print("selftest OK")


def main():
    say("STATE scan")
    t0, dev = time.time(), None
    while dev is None:
        dev = find_device()
        if dev is None:
            if time.time() - t0 > 240: say("ERR timeout : aucune clé USB (branchez-la)"); return 2
            time.sleep(1)
    say(f"STATE found {dev[1].replace(' ', '_')} usb"); say("STATE ready")
    for line in sys.stdin:
        a = line.split()
        if not a: continue
        d = find_device()
        if a[0] == "quit": return 0
        if d is None: say(f"ERR {a[0]} clé débranchée"); continue
        if a[0] == "version": version(d[0])
        elif a[0] == "register": register(d[0])
        elif a[0] == "auth" and len(a) == 3: auth(d[0], a[1], a[2])
        else: say("ERR commande inconnue: " + line.strip())
    return 0


if __name__ == "__main__":
    if sys.argv[1:] == ["selftest"]: selftest()
    else: sys.exit(main())
