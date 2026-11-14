"""Fresh blocking child pipes and bounded output inside the command sandbox."""
import os
import selectors
import subprocess
import sys
process = subprocess.Popen(sys.argv[1:], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, close_fds=True)
selector = selectors.DefaultSelector()
selector.register(process.stdout, selectors.EVENT_READ, 1)
selector.register(process.stderr, selectors.EVENT_READ, 2)
total = 0
while selector.get_map():
    for event, _ in selector.select():
        chunk = os.read(event.fileobj.fileno(), 8192)
        if not chunk:
            selector.unregister(event.fileobj)
            continue
        total += len(chunk)
        if total > 200000:
            process.kill()
            process.wait()
            os.write(2, b'Command output limit exceeded.\n')
            raise SystemExit(90)
        target = sys.stdout.buffer if event.data == 1 else sys.stderr.buffer
        target.write(chunk)
        target.flush()
code = process.wait()
raise SystemExit(code if code >= 0 else 128 - code)
