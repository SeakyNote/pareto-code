"""SQLite persistence and atomic, bounded imports."""

from __future__ import annotations

import csv
import io
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .domain import ValidationError, validate_record

MAX_IMPORT_RECORDS = 500


def parse_import(payload: dict) -> list[dict]:
    if not isinstance(payload, dict):
        raise ValidationError("导入请求必须是对象")
    format_name = payload.get("format", "json")
    content = payload.get("content", payload.get("records"))
    try:
        if format_name == "csv":
            if not isinstance(content, str):
                raise ValidationError("CSV 内容必须是文本")
            reader = csv.DictReader(io.StringIO(content.lstrip("\ufeff")), strict=True)
            if not reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames):
                raise ValidationError("CSV 缺少表头或含重复列名")
            raw_records = []
            for row in reader:
                if None in row:
                    raise ValidationError("CSV 行的列数多于表头，请检查引号")
                if row.get("task_results"):
                    row["task_results"] = json.loads(row["task_results"])
                elif "task_results" in row:
                    del row["task_results"]
                raw_records.append(row)
                if len(raw_records) > MAX_IMPORT_RECORDS:
                    raise ValidationError(f"每次最多导入 {MAX_IMPORT_RECORDS} 条")
        elif format_name == "json":
            raw_records = json.loads(content.lstrip("\ufeff")) if isinstance(content, str) else content
            if isinstance(raw_records, dict):
                raw_records = raw_records.get("records", [raw_records])
        else:
            raise ValidationError("仅支持 json 或 csv")
    except (ValueError, csv.Error, RecursionError) as exc:
        if isinstance(exc, ValidationError):
            raise
        raise ValidationError("内容不是有效的 JSON / CSV 文件") from None
    if not isinstance(raw_records, list) or not 1 <= len(raw_records) <= MAX_IMPORT_RECORDS:
        raise ValidationError(f"需要 1–{MAX_IMPORT_RECORDS} 条记录")
    records = []
    ids = set()
    for index, raw in enumerate(raw_records, 1):
        try:
            record = validate_record(raw)
            if record["id"] in ids:
                raise ValidationError(f"批次内 id 重复：{record['id']}")
            ids.add(record["id"])
            records.append(record)
        except ValidationError as exc:
            raise ValidationError(f"第 {index} 条：{exc}") from None
    return records


class Store:
    def __init__(self, path: str | Path, *, seed: bool = True):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, payload TEXT NOT NULL, imported_at TEXT NOT NULL)")
            connection.execute("CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            seeded = connection.execute("SELECT value FROM metadata WHERE key='seed-version'").fetchone()
            if seed and not seeded:
                data = json.loads((Path(__file__).parent / "data" / "demo.json").read_text(encoding="utf-8"))
                now = datetime.now(timezone.utc).isoformat()
                for raw in data:
                    record = validate_record(raw)
                    connection.execute("INSERT OR IGNORE INTO records VALUES (?, ?, ?)", (record["id"], json.dumps(record, ensure_ascii=False), now))
                connection.execute("INSERT INTO metadata VALUES ('seed-version', '1')")

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.path, timeout=10)
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def records(self) -> list[dict]:
        with self.connect() as connection:
            return [json.loads(row[0]) for row in connection.execute("SELECT payload FROM records ORDER BY id")]

    def import_records(self, records: list[dict], *, dry_run: bool = False) -> dict:
        with self.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            for record in records:
                if connection.execute("SELECT 1 FROM records WHERE id=?", (record["id"],)).fetchone():
                    raise ValidationError(f"id 已存在：{record['id']}。请使用新 ID 保留原快照。")
            if not dry_run:
                now = datetime.now(timezone.utc).isoformat()
                connection.executemany("INSERT INTO records VALUES (?, ?, ?)",
                                       [(r["id"], json.dumps(r, ensure_ascii=False, allow_nan=False), now) for r in records])
        return {"count": len(records), "dry_run": dry_run, "records": records,
                "message": f"{len(records)} 条记录校验通过" if dry_run else f"已导入 {len(records)} 条记录"}
