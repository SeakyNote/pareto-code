"""Local HTTP API and static UI; no runtime dependencies."""

from __future__ import annotations

import argparse
import json
import logging
import mimetypes
import os
import sqlite3
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

from . import __version__
from .benchmark import public_benchmark, score_bundle
from .domain import ValidationError, analyze, catalog
from .store import Store, parse_import

STATIC = Path(__file__).parent / "static"
MAX_BODY = 2 * 1024 * 1024
LOG = logging.getLogger("pareto")


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, store):
        self.store = store
        super().__init__(address, Handler)


class Handler(BaseHTTPRequestHandler):
    server_version = "ParetoCode/" + __version__

    def setup(self):
        super().setup()
        self.connection.settimeout(20)

    def log_message(self, format, *args):
        LOG.info("%s %s", self.address_string(), format % args)

    def headers_common(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        self.send_header("Cache-Control", "no-store")

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.headers_common()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlsplit(self.path)
        try:
            if parsed.path == "/api/health":
                self.send_json({"status": "ok", "version": __version__})
            elif parsed.path == "/api/catalog":
                self.send_json(catalog(self.server.store.records()))
            elif parsed.path == "/api/records":
                kind = parse_qs(parsed.query).get("dataset_kind", [None])[0]
                if kind not in {None, "demo", "measured"}:
                    raise ValidationError("dataset_kind 无效")
                records = self.server.store.records()
                self.send_json({"records": [r for r in records if kind is None or r["dataset_kind"] == kind]})
            elif parsed.path == "/api/benchmark":
                self.send_json(public_benchmark())
            elif parsed.path.startswith("/api/"):
                self.send_json({"error": "接口不存在"}, 404)
            else:
                path = (STATIC / unquote(parsed.path).lstrip("/")).resolve()
                if parsed.path == "/":
                    path = STATIC / "index.html"
                if not path.is_relative_to(STATIC.resolve()) or not path.is_file():
                    self.send_json({"error": "文件不存在"}, 404)
                    return
                body = path.read_bytes()
                self.send_response(200)
                self.headers_common()
                mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
                self.send_header("Content-Type", mime + ("; charset=utf-8" if mime.startswith("text/") or mime == "application/javascript" else ""))
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        except ValidationError as exc:
            self.send_json({"error": str(exc)}, 400)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            LOG.exception("GET failed")
            self.send_json({"error": "读取失败，请检查服务端日志"}, 500)

    def read_json(self):
        # Browser writes are same-origin. CLI clients without Origin remain supported.
        if self.headers.get("Sec-Fetch-Site") == "cross-site":
            raise PermissionError("拒绝跨站写入")
        origin = self.headers.get("Origin")
        if origin:
            parsed_origin = urlsplit(origin)
            if parsed_origin.scheme not in {"http", "https"} or parsed_origin.netloc != self.headers.get("Host"):
                raise PermissionError("写请求必须来自同源页面")
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            raise ValidationError("请求 Content-Type 必须为 application/json")
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValidationError("Content-Length 无效") from None
        if not 0 < size <= MAX_BODY:
            raise ValidationError("请求体必须为 1 字节–2 MiB")
        try:
            data = json.loads(self.rfile.read(size), parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
        except (ValueError, UnicodeDecodeError, RecursionError):
            raise ValidationError("请求体必须是有效 JSON，且不能包含 NaN / Infinity") from None
        if not isinstance(data, dict):
            raise ValidationError("请求体必须是 JSON 对象")
        return data

    def do_POST(self):
        try:
            data = self.read_json()
            path = urlsplit(self.path).path
            if path == "/api/analyze":
                result = analyze(self.server.store.records(), data)
            elif path == "/api/import":
                if not isinstance(data.get("dry_run", False), bool):
                    raise ValidationError("dry_run 必须是布尔值")
                result = self.server.store.import_records(parse_import(data), dry_run=data.get("dry_run", False))
            elif path == "/api/benchmark/score":
                result = score_bundle(data)
            else:
                self.send_json({"error": "接口不存在"}, 404)
                return
            self.send_json(result)
        except ValidationError as exc:
            self.send_json({"error": str(exc)}, 400)
        except PermissionError as exc:
            self.send_json({"error": str(exc)}, 403)
        except sqlite3.Error:
            LOG.exception("Database failed")
            self.send_json({"error": "数据库写入失败，请重试并检查服务端日志"}, 503)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            LOG.exception("POST failed")
            self.send_json({"error": "处理失败，请检查服务端日志"}, 500)


def main():
    parser = argparse.ArgumentParser(description="Pareto Code · AI 效费比选型工作台")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--db", default=os.environ.get("PARETO_DB", "var/pareto.sqlite3"))
    parser.add_argument("--no-demo", action="store_true", help="首次创建数据库时不导入演示数据")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    server = Server((args.host, args.port), Store(args.db, seed=not args.no_demo))
    print(f"\n  Pareto Code v{__version__}\n  http://{args.host}:{server.server_port}\n  数据库：{Path(args.db).resolve()}\n", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止。")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
