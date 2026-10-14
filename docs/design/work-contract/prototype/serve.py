"""Serve the throwaway prototype with an explicit local, read-only JSON fixture."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("fixture", type=Path)
parser.add_argument("--port", type=int, default=8771)
args = parser.parse_args()
fixture = args.fixture.resolve(strict=True)
if not fixture.is_file():
    parser.error("fixture must be a JSON file")
prototype = Path(__file__).resolve().parent

with TemporaryDirectory(prefix="work-contract-preview-") as temporary:
    root = Path(temporary)
    (root / "index.html").symlink_to(prototype / "index.html")
    (root / "component").symlink_to(prototype.parent, target_is_directory=True)
    (root / "compact-data.json").symlink_to(fixture)
    handler = partial(SimpleHTTPRequestHandler, directory=root)
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"http://127.0.0.1:{args.port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
