"""Small, asset-free checks. The real-archive probe checks the original Lua separately."""
import importlib.machinery
import io
import math
from pathlib import Path
import unittest
import zipfile

tool=importlib.machinery.SourceFileLoader('probe_tool',str(Path(__file__).with_name('run'))).load_module()


class ProbeTests(unittest.TestCase):
    def archive(self,names):
        out=io.BytesIO()
        with zipfile.ZipFile(out,'w') as z:
            for name in names: z.writestr(name,b'example')
        return out.getvalue()

    def test_rejects_escape_and_duplicate_members(self):
        for names in [['../outside'],['/absolute'],['a\\b'],['same','same']]:
            with self.subTest(names=names),self.assertRaises(ValueError):
                tool.checked_zip(self.archive(names))

    def test_accepts_regular_nested_member(self):
        z=tool.checked_zip(self.archive(['r/Cluster_Display/image.png']))
        self.assertEqual(z.read('r/Cluster_Display/image.png'),b'example')

    def test_signed_sweep_is_preserved(self):
        arc={'x':0,'y':0,'radius':10,'startAngle':0,'sweep':-1.5*math.pi}
        points=tool.arc_points(arc,1).split()
        self.assertEqual(points[0],'10.0000,0.0000')
        self.assertEqual(points[-1],'-0.0000,-10.0000')
        self.assertGreater(len(points),200)


if __name__=='__main__': unittest.main()
