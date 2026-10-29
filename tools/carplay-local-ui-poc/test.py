"""Small, asset-free checks. The real-archive probe checks the original Lua separately."""
import importlib.machinery
import io
import math
from pathlib import Path
import unittest
import zipfile

tool=importlib.machinery.SourceFileLoader('probe_tool',str(Path(__file__).with_name('run'))).load_module()
component=importlib.machinery.SourceFileLoader('component_tool',str(Path(__file__).parent/'component/run.py')).load_module()


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

    def test_component_wraps_original_module_without_rewriting(self):
        source = b'local items = {1, 2}\nfor k, v in items do print(k, v) end\nreturn items\n'
        data = io.BytesIO()
        with zipfile.ZipFile(data, 'w') as archive:
            archive.writestr('sample.lua', source)
        bundle, hashes = component.bundle(tool.checked_zip(data.getvalue()))
        self.assertIn(source.decode(), bundle)
        self.assertEqual(len(hashes['sample.lua']), 64)

    def test_component_rejects_missing_or_static_state_updates(self):
        def sample(speed):
            return {'speed':speed,'scene':{'name':'root','children':[
                {'name':'SpeedometerProgressBar','strokeEnd':speed/160},
                {'name':'MeasurementLabel:PrimarySpeed','children':[
                    {'name':'glyph','maskToBounds':True,'bounds':{'x':speed}}]},
                {'name':'decoration','texture':{'path':'decorative_speedometer.png'}}]}}
        samples = [sample(v) for v in [0,65,130]]
        component.verify(samples)
        with self.assertRaises(AssertionError): component.verify(samples[:2])
        samples[1]['scene']['children'][0]['strokeEnd'] = 0
        with self.assertRaises(AssertionError): component.verify(samples)


if __name__=='__main__': unittest.main()
