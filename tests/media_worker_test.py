import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import wave

PYTHON = Path('/home/agent/.local/share/jarvis-telegram/voice-venv/bin/python3')
WORKER = Path(__file__).resolve().parents[1] / 'scripts/media_worker.py'
MODEL = '/home/agent/.local/share/jarvis-telegram/voice-models/base'

@unittest.skipUnless(PYTHON.exists(), 'Local media runtime is not installed')
class MediaWorkerTest(unittest.TestCase):
    def run_worker(self, kind, path):
        env = {key: os.environ[key] for key in ['PATH', 'HOME'] if key in os.environ}
        env.update(HF_HUB_OFFLINE='1', OPENBLAS_NUM_THREADS='2', OMP_NUM_THREADS='2', PYTHONDONTWRITEBYTECODE='1')
        return subprocess.run([str(PYTHON), str(WORKER), kind, str(path), MODEL], env=env, capture_output=True, text=True, timeout=30)

    def test_pdf_text_is_extracted_without_running_embedded_code(self):
        content = b'BT /F1 12 Tf 20 100 Td (Hello Jarvis) Tj ET'
        objects = [b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>', b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', b'<< /Length ' + str(len(content)).encode() + b' >>\nstream\n' + content + b'\nendstream', b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
        data = b'%PDF-1.4\n'
        offsets = []
        for i, obj in enumerate(objects, 1):
            offsets.append(len(data))
            data += str(i).encode() + b' 0 obj\n' + obj + b'\nendobj\n'
        xref = len(data)
        data += b'xref\n0 6\n0000000000 65535 f \n' + b''.join(f'{n:010d} 00000 n \n'.encode() for n in offsets)
        data += b'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + str(xref).encode() + b'\n%%EOF\n'
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'sample.pdf'
            path.write_bytes(data)
            result = self.run_worker('pdf', path)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('Hello Jarvis', json.loads(result.stdout)['text'])

    def test_audio_actual_duration_is_checked_even_when_metadata_lies(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'long.wav'
            with wave.open(str(path), 'wb') as out:
                out.setnchannels(1)
                out.setsampwidth(2)
                out.setframerate(8000)
                out.writeframes(b'\x00\x00' * 8000 * 121)
            result = self.run_worker('voice', path)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('duration limit', result.stderr)

if __name__ == '__main__':
    unittest.main()
