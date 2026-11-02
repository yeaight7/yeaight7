import http.server
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "cache-streak.py"


class Handler(http.server.BaseHTTPRequestHandler):
    status = 200
    body = b""

    def do_GET(self):
        self.send_response(self.status)
        self.end_headers()
        self.wfile.write(self.body)

    def log_message(self, *_args):
        pass


class CacheStreakTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def run_cache(self, status, body):
        Handler.status, Handler.body = status, body
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "streak.svg"
            target.write_text("last good card", encoding="utf-8")
            result = subprocess.run(
                [sys.executable, str(SCRIPT), f"http://127.0.0.1:{self.server.server_port}/", str(target)],
                capture_output=True, text=True,
                env={**os.environ, "STREAK_RETRY_DELAY": "0"},
            )
            return result, target.read_text(encoding="utf-8")

    def test_unavailable_service_preserves_last_good_card(self):
        result, card = self.run_cache(503, b"unavailable")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(card, "last good card")
        self.assertIn("warning", result.stderr.lower())

    def test_invalid_response_preserves_last_good_card(self):
        result, card = self.run_cache(200, b"<html>not a card</html>")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(card, "last good card")

    def test_valid_svg_replaces_card(self):
        result, card = self.run_cache(200, b'<svg xmlns="http://www.w3.org/2000/svg"><text>updated</text></svg>')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("updated", card)


if __name__ == "__main__":
    unittest.main()
