#!/usr/bin/env python3
"""Writes sample.pdf beside this file: three 400 x 500 pt pages, each with a black frame, a bar whose width grows with the page number and
"Page N" in Helvetica (a standard font: nothing embedded). A few hundred bytes, with a correct cross-reference table."""
import os

pages = 3
objs = ["<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [%s] /Count %d >>" % (" ".join("%d 0 R" % (4 + 2 * i) for i in range(pages)), pages),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
for i in range(pages):
    content = "4 w 20 20 360 460 re S 40 400 %d 40 re f BT /F1 36 Tf 40 300 Td (Page %d) Tj ET" % (100 * (i + 1), i + 1)
    objs.append("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Resources << /Font << /F1 3 0 R >> >> /Contents %d 0 R >>" % (5 + 2 * i))
    objs.append("<< /Length %d >>\nstream\n%s\nendstream" % (len(content), content))
out, offsets = b"%PDF-1.4\n", []
for n, body in enumerate(objs, 1):
    offsets.append(len(out))
    out += ("%d 0 obj\n%s\nendobj\n" % (n, body)).encode()
xref = len(out)
out += ("xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)).encode()
out += "".join("%010d 00000 n \n" % o for o in offsets).encode()
out += ("trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)).encode()
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "sample.pdf"), "wb").write(out)
