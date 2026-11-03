import json
import logging
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from pareto.server import Server
from pareto.store import Store
from tests.test_benchmark import bundle
from tests.test_domain import record


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        logging.getLogger("pareto").setLevel(logging.CRITICAL)
        cls.temp = tempfile.TemporaryDirectory()
        cls.server = Server(("127.0.0.1", 0), Store(Path(cls.temp.name) / "api.sqlite3"))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.temp.cleanup()

    def request(self, path, body=None, headers=None, raw=None):
        data = raw if raw is not None else json.dumps(body).encode() if body is not None else None
        request = Request(self.base + path, data=data, headers=headers or ({"Content-Type": "application/json"} if data else {}))
        try:
            response = urlopen(request, timeout=5)
        except HTTPError as exc:
            response = exc
        with response:
            return response.status, response.headers, response.read()

    def test_health(self):
        status, headers, body = self.request("/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["status"], "ok")
        self.assertIn("nosniff", headers["X-Content-Type-Options"])

    def test_static_assets(self):
        for path in ("/", "/app.js", "/style.css", "/favicon.svg"):
            status, _, body = self.request(path)
            self.assertEqual(status, 200)
            self.assertTrue(body)

    def test_traversal_and_unknown_routes(self):
        for path in ("/../domain.py", "/%2e%2e/domain.py", "/api/nope", "/missing.html"):
            self.assertEqual(self.request(path)[0], 404)

    def test_analyze(self):
        status, _, body = self.request("/api/analyze", {"min_quality": 80})
        self.assertEqual(status, 200)
        self.assertEqual(len(json.loads(body)["recommendations"]), 3)

    def test_json_errors_are_400(self):
        for raw in (b"oops", b"[]", b'{"budget_cny": NaN}', b'{"budget_cny": Infinity}'):
            self.assertEqual(self.request("/api/analyze", raw=raw)[0], 400)

    def test_wrong_content_type_rejected(self):
        status, _, _ = self.request("/api/analyze", {}, {"Content-Type": "text/plain"})
        self.assertEqual(status, 400)

    def test_cross_origin_write_rejected(self):
        for headers in ({"Origin": "https://elsewhere.example"}, {"Sec-Fetch-Site": "cross-site"}):
            status, _, _ = self.request("/api/import", {"records": [record("cross-origin")]}, {"Content-Type": "application/json", **headers})
            self.assertEqual(status, 403)

    def test_import_dry_run_and_real_persist(self):
        row = record("http-import", dataset_kind="measured", source_type="self-built")
        for dry_run in (True, False):
            status, _, body = self.request("/api/import", {"records": [row], "dry_run": dry_run})
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body)["dry_run"], dry_run)
        self.assertEqual(self.request("/api/import", {"records": [row]})[0], 400)
        _, _, body = self.request("/api/records?dataset_kind=measured")
        self.assertIn(row, json.loads(body)["records"])

    def test_dry_run_type_must_be_boolean(self):
        self.assertEqual(self.request("/api/import", {"records": [record()], "dry_run": "false"})[0], 400)

    def test_benchmark_score_endpoint(self):
        status, _, body = self.request("/api/benchmark/score", bundle())
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["record"]["quality"], 100)

    def test_catalog_and_invalid_dataset(self):
        self.assertEqual(self.request("/api/catalog")[0], 200)
        self.assertEqual(self.request("/api/records?dataset_kind=unknown")[0], 400)
