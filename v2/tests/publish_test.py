"""Run: python3 -m unittest discover -s v2/tests -p '*_test.py'."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'prepare_publish.py'


class PublishTest(unittest.TestCase):
    def tool(self):
        spec = importlib.util.spec_from_file_location('prepare_publish', SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_export_excludes_private_files_and_history(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'site'
            self.tool().prepare(target)
            names = [p.relative_to(target).as_posix() for p in target.rglob('*')]
            self.assertIn('v2/index.html', names)
            self.assertIn('.github/workflows/pages.yml', names)
            self.assertNotIn('v2/audio-manifest.json', names)
            self.assertNotIn('.git', names)
            self.assertFalse(any(Path(n).suffix.lower() in ('.wav', '.mp3', '.m4a') for n in names))
            self.assertIn('audioManifest: ""', (target / 'v2/config.js').read_text())

    def test_export_refuses_existing_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / 'keep.txt'
            marker.write_text('keep')
            with self.assertRaises(FileExistsError):
                self.tool().prepare(Path(directory))
            self.assertEqual(marker.read_text(), 'keep')


if __name__ == '__main__':
    unittest.main()
