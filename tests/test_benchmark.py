import copy
import unittest
from datetime import datetime, timedelta, timezone

from pareto.benchmark import TASKS, public_benchmark, score_bundle
from pareto.domain import ValidationError, validate_record


def bundle():
    result = public_benchmark()["result_template"]
    start = datetime(2026, 11, 3, 5, tzinfo=timezone.utc)
    for index, row in enumerate(result["responses"]):
        row.update(started_at=(start + timedelta(minutes=index)).isoformat(), finished_at=(start + timedelta(minutes=index, seconds=10)).isoformat(), cost_cny=.08, output={"issues": copy.deepcopy(TASKS[index]["expected"])})
    return result


class BenchmarkTests(unittest.TestCase):
    def test_public_prompts_do_not_contain_answers(self):
        benchmark = public_benchmark()
        self.assertEqual(len(benchmark["tasks"]), 8)
        self.assertTrue(all("expected" not in t for t in benchmark["tasks"]))

    def test_perfect_score_and_full_trace(self):
        result = score_bundle(bundle())
        record = result["record"]
        self.assertEqual(record["quality"], 100)
        self.assertEqual(record["cost_cny"], .08)
        self.assertEqual(record["latency_seconds"], 10)
        self.assertEqual(record["sample_size"], 8)
        self.assertEqual(len(record["task_results"]), 8)
        self.assertIn("output", record["task_results"][0])
        self.assertEqual(validate_record(record), record)

    def test_false_positives_penalized(self):
        data = bundle()
        data["responses"][0]["output"]["issues"].append({"line": 2, "category": "sql-injection"})
        result = score_bundle(data)
        self.assertAlmostEqual(result["feedback"][0]["score"], 200 / 3)
        self.assertLess(result["record"]["quality"], 100)

    def test_clean_task_false_positive_zero(self):
        data = bundle()
        data["responses"][-1]["output"] = {"issues": [{"line": 1, "category": "mutable-default"}]}
        self.assertEqual(score_bundle(data)["feedback"][-1]["score"], 0)

    def test_invalid_format_zero_even_on_clean_task(self):
        for output in ("not-json", [], {"issues": "none"}, {"issues": [{"line": True, "category": "x"}]}):
            data = bundle()
            data["responses"][-1]["output"] = output
            result = score_bundle(data)
            self.assertEqual(result["feedback"][-1]["score"], 0)
            self.assertIsNotNone(result["feedback"][-1]["error"])

    def test_cannot_cherry_pick_tasks(self):
        data = bundle()
        data["responses"].pop()
        with self.assertRaises(ValidationError):
            score_bundle(data)

    def test_duplicate_task_rejected(self):
        data = bundle()
        data["responses"][0]["task_id"] = data["responses"][1]["task_id"]
        with self.assertRaises(ValidationError):
            score_bundle(data)

    def test_invalid_timing_and_missing_bill_rejected(self):
        for changes in ({"started_at": None}, {"finished_at": "2026-11-03T05:00:00Z"}, {"cost_cny": None}, {"output": None}):
            data = bundle()
            data["responses"][0].update(changes)
            with self.subTest(changes=changes), self.assertRaises(ValidationError):
                score_bundle(data)

    def test_subscription_scoring(self):
        data = bundle()
        data["config"].update(channel="subscription", monthly_fee_cny=150)
        data["monthly_tasks"] = 300
        for row in data["responses"]:
            row["cost_cny"] = None
        result = score_bundle(data)
        self.assertEqual(result["record"]["cost_cny"], .5)
        self.assertEqual(result["record"]["cost_method"], "subscription-amortized-cny-v1")

    def test_tampered_evidence_rejected(self):
        original = score_bundle(bundle())["record"]
        for field, value in (("quality", 90), ("latency_seconds", 20), ("sample_size", 7)):
            changed = copy.deepcopy(original)
            changed[field] = value
            with self.subTest(field=field), self.assertRaises(ValidationError):
                validate_record(changed)
        changed = copy.deepcopy(original)
        changed["task_results"][0]["score"] = 50
        with self.assertRaises(ValidationError):
            validate_record(changed)
