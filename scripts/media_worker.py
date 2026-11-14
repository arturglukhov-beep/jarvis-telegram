"""Bounded, local-only media parsing; no Telegram credentials in this process."""
import json
import os
from pathlib import Path
import resource
import sys
resource.setrlimit(resource.RLIMIT_CPU, (120, 120))
resource.setrlimit(resource.RLIMIT_AS, (3 * 1024**3, 3 * 1024**3))
resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
kind, filename, model_path = sys.argv[1:4]
path = Path(filename)
if not path.is_file() or path.is_symlink() or path.stat().st_size > 5_000_000:
    raise SystemExit('Invalid media file')
if kind == 'pdf':
    from pypdf import PdfReader
    reader = PdfReader(path)
    if reader.is_encrypted or len(reader.pages) > 30:
        raise SystemExit('PDF is encrypted or too long')
    text = ''
    for page in reader.pages:
        text += (page.extract_text() or '') + '\n'
        if len(text) > 64000:
            raise SystemExit('PDF text limit')
    if not text.strip():
        raise SystemExit('PDF has no extractable text; send its pages as photos')
elif kind == 'voice':
    import av
    import numpy as np
    import onnxruntime
    onnxruntime.disable_telemetry_events()
    from faster_whisper import WhisperModel
    chunks = []
    total = 0
    with av.open(str(path)) as container:
        resampler = av.AudioResampler(format='s16', layout='mono', rate=16000)
        for frame in container.decode(audio=0):
            for out in resampler.resample(frame):
                data = out.to_ndarray().flatten()
                total += len(data)
                if total > 120 * 16000:
                    raise SystemExit('Audio duration limit')
                chunks.append(data)
    if not chunks:
        raise SystemExit('Empty audio')
    audio = np.concatenate(chunks).astype(np.float32) / 32768.0
    model = WhisperModel(model_path, device='cpu', compute_type='int8', cpu_threads=2, num_workers=1, local_files_only=True)
    segments, _ = model.transcribe(audio, beam_size=1, vad_filter=True)
    text = ' '.join(s.text.strip() for s in segments).strip()
    if not text:
        raise SystemExit('No speech detected')
else:
    raise SystemExit('Unknown media mode')
print(json.dumps({'text': text}, ensure_ascii=False))
