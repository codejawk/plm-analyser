import tempfile
import unittest
import zipfile
from pathlib import Path

import dumpstate

SAMPLE = """========================================================
== dumpstate: 2026-09-20 10:00:00
========================================================
Build: UP1A.231005.007
Build fingerprint: 'samsung/xyz/xyz:14/UP1A/123:user/release-keys'
------ SYSTEM LOG (logcat -v threadtime -d *:v) ------
09-20 09:59:01.000  1000  1234  1234 E AndroidRuntime: FATAL EXCEPTION: main
09-20 09:59:01.001  1000  1234  1234 E AndroidRuntime: java.lang.NullPointerException
09-20 09:59:05.000  1000   900   950 E ActivityManager: ANR in com.android.settings
------ 0.120s was the duration of 'SYSTEM LOG' ------
------ KERNEL LOG (dmesg) ------
[  12.000] Internal error: Oops: 96000005 [#1] PREEMPT SMP
------ 0.010s was the duration of 'KERNEL LOG' ------
"""


class DumpstateTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.txt = self.dir / "dumpstate.txt"
        self.txt.write_text(SAMPLE)

    def test_overview(self):
        o = dumpstate.overview(str(self.txt))
        self.assertEqual([s["name"] for s in o["sections"]], ["SYSTEM LOG (logcat -v threadtime -d *:v)", "KERNEL LOG (dmesg)"])
        self.assertEqual(o["header"]["Build"], "UP1A.231005.007")
        self.assertEqual(o["crash_counts"], {"java_crash": 1, "anr": 1, "kernel_panic": 1})

    def test_section_and_zip(self):
        z = self.dir / "bugreport.zip"
        with zipfile.ZipFile(z, "w") as f:
            f.writestr("bugreport-xyz.txt", SAMPLE)
        s = dumpstate.section_text(str(z), "kernel")
        self.assertIn("Oops", s["text"])

    def test_grep(self):
        self.assertEqual(len(dumpstate.grep(str(self.txt), "anr in")), 1)


if __name__ == "__main__":
    unittest.main()
