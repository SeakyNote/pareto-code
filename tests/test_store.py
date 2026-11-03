import csv
import io
import json
import tempfile
import unittest
from pathlib import Path

from pareto.domain import ValidationError
from pareto.store import Store, parse_import
from tests.test_domain import record


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = Store(Path(self.temp.name) / "data.sqlite3", seed=False)

    def test_seed_is_idempotent(self):
        path = Path(self.temp.name) / "seed.sqlite3"
        first = Store(path)
        self.assertEqual(len(first.records()), 18)
        self.assertEqual(len(Store(path).records()), 18)

    def test_dry_run_does_not_write(self):
        result = self.store.import_records([record()], dry_run=True)
        self.assertTrue(result["dry_run"])
        self.assertEqual(self.store.records(), [])

    def test_import_persists(self):
        self.store.import_records([record()])
        self.assertEqual(self.store.records(), [record()])
        self.assertEqual(Store(self.store.path, seed=False).records(), [record()])

    def test_batch_failure_is_atomic(self):
        self.store.import_records([record("exists")])
        with self.assertRaises(ValidationError):
            self.store.import_records([record("new"), record("exists")])
        self.assertEqual([r["id"] for r in self.store.records()], ["exists"])

    def test_json_list_object_wrapper_and_bom(self):
        for content in ([record()], record(), {"records": [record()]}, "\ufeff" + json.dumps([record()])):
            self.assertEqual(parse_import({"content": content}), [record()])

    def test_csv_round_trip_and_bom(self):
        row = record(notes='多行\n中文, "引号"')
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=list(row))
        writer.writeheader()
        writer.writerow(row)
        parsed = parse_import({"format": "csv", "content": "\ufeff" + output.getvalue()})
        self.assertEqual(parsed, [row])

    def test_duplicate_ids_rejected(self):
        with self.assertRaisesRegex(ValidationError, "重复"):
            parse_import({"records": [record(), record()]})

    def test_invalid_batch_reports_row(self):
        bad = dict(record(), quality=999)
        with self.assertRaisesRegex(ValidationError, "第 2 条"):
            parse_import({"records": [record(), bad]})

    def test_invalid_import_formats(self):
        for payload in ({"content": "oops"}, {"records": []}, {"records": 1}, {"content": "[]", "format": "xml"}, {"format": "csv", "content": "id,id\nx,x"}, {"format": "csv", "content": "id\na,b"}):
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                parse_import(payload)

    def test_import_limit(self):
        with self.assertRaises(ValidationError):
            parse_import({"records": [record(str(i)) for i in range(501)]})
