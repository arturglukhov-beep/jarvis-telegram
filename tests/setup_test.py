import contextlib
import importlib.util
import io
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('jarvis_setup', Path(__file__).resolve().parents[1] / 'scripts/setup.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)

class SetupTest(unittest.TestCase):
    def test_secret_is_private_and_not_printed_and_existing_config_is_preserved(self):
        with tempfile.TemporaryDirectory(prefix='jarvis-setup-') as root:
            directory = Path(root) / 'config'
            output = io.StringIO()
            token = '12345:fake-secret-for-offline-test'
            with patch('sys.stdin.isatty', return_value=True), patch('getpass.getpass', return_value=token), patch('builtins.input', return_value=''), contextlib.redirect_stdout(output):
                setup.main(directory)
                saved = (directory / 'env').read_text()
                with self.assertRaises(SystemExit):
                    setup.main(directory)
                self.assertEqual((directory / 'env').read_text(), saved)
            self.assertNotIn(token, output.getvalue())
            self.assertIn('BOT_TOKEN=' + token, saved)
            self.assertIn('/start ', output.getvalue())
            self.assertEqual(stat.S_IMODE((directory / 'env').stat().st_mode), 0o600)

if __name__ == '__main__':
    unittest.main()
