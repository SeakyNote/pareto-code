import copy
import json
import random
import unittest
from pathlib import Path

from pareto.domain import ValidationError, analyze, catalog, dominates, frontier, group_id, validate_record

DEMO = json.loads((Path(__file__).parents[1] / "pareto/data/demo.json").read_text())


def record(id="test-a", **changes):
    result = copy.deepcopy(DEMO[0])
    result.update(id=id, model=id)
    result.update(changes)
    return validate_record(result)


class FrontierTests(unittest.TestCase):
    def test_strict_dominance(self):
        a = record(quality=90, cost_cny=.1, latency_seconds=10)
        b = record("b", quality=80, cost_cny=.2, latency_seconds=20)
        self.assertTrue(dominates(a, b))
        self.assertFalse(dominates(b, a))
        self.assertEqual(frontier([a, b]), [a])

    def test_equal_points_do_not_dominate(self):
        a = record()
        b = record("b", quality=a["quality"], cost_cny=a["cost_cny"], latency_seconds=a["latency_seconds"])
        self.assertFalse(dominates(a, b))
        self.assertEqual(len(frontier([a, b])), 2)

    def test_third_dimension_protects_fast_configuration(self):
        a = record(quality=90, cost_cny=.1, latency_seconds=50)
        b = record("fast", quality=80, cost_cny=.2, latency_seconds=5)
        self.assertEqual(len(frontier([a, b])), 2)

    def test_empty_and_single(self):
        self.assertEqual(frontier([]), [])
        self.assertEqual(len(frontier([record()])), 1)

    def test_randomized_properties(self):
        rng = random.Random(2026)
        rows = [record(str(i), quality=rng.randrange(100), cost_cny=rng.randrange(10), latency_seconds=rng.randrange(1, 100)) for i in range(80)]
        selected = frontier(rows)
        for item in selected:
            self.assertFalse(any(dominates(other, item) for other in rows))
        for item in rows:
            if item not in selected:
                self.assertTrue(any(dominates(other, item) for other in selected))
        self.assertEqual({r["id"] for r in selected}, {r["id"] for r in frontier(list(reversed(rows)))})


class AnalysisTests(unittest.TestCase):
    def test_demo_complete_loop(self):
        result = analyze(DEMO, {"budget_cny": .5, "max_latency_seconds": 60, "min_quality": 80, "baseline_id": "demo-gpt-legacy"})
        self.assertEqual(result["summary"], {"comparable": 12, "feasible": 6, "frontier": 8, "excluded": 2})
        self.assertEqual(len(result["recommendations"]), 3)
        for recommendation in result["recommendations"]:
            candidate = next(r for r in result["records"] if r["id"] == recommendation["record_id"])
            self.assertTrue(candidate["feasible"])
            self.assertTrue(candidate["is_frontier"])
        self.assertAlmostEqual(result["savings"]["monthly_cny"], 130)
        self.assertEqual(result["savings"]["record_id"], "demo-qwen-high")

    def test_exact_boundary_is_feasible(self):
        row = record(quality=80, cost_cny=0, latency_seconds=10)
        result = analyze([row], {"budget_cny": 0, "max_latency_seconds": 10, "min_quality": 80})
        self.assertEqual(result["summary"]["feasible"], 1)
        self.assertEqual(result["savings"]["percent"], 0)

    def test_no_silent_constraint_relaxation(self):
        result = analyze([record(quality=80, cost_cny=.2, latency_seconds=10)], {"budget_cny": .1, "min_quality": 80})
        self.assertEqual(result["recommendations"], [])
        self.assertEqual(result["suggestions"], [{"field": "budget_cny", "value": .2, "label": "仅放宽费用上限即可有解"}])
        self.assertIsNone(result["savings"])

    def test_multiple_failing_constraints_do_not_suggest_one_as_sufficient(self):
        result = analyze([record(quality=70, cost_cny=.2, latency_seconds=100)], {"budget_cny": .1, "min_quality": 80, "max_latency_seconds": 50})
        self.assertEqual(result["suggestions"], [])

    def test_unbounded_constraints(self):
        result = analyze([record()], {"budget_cny": None, "max_latency_seconds": None})
        self.assertEqual(result["summary"]["feasible"], 1)

    def test_empty_real_dataset(self):
        result = analyze(DEMO, {"dataset_kind": "measured"})
        self.assertEqual(result["records"], [])
        self.assertIsNone(result["group"])
        self.assertIsNone(result["savings"])

    def test_data_kinds_are_isolated(self):
        measured = record("real", dataset_kind="measured", source_type="self-built")
        result = analyze(DEMO + [measured], {"dataset_kind": "measured"})
        self.assertEqual([r["id"] for r in result["records"]], ["real"])

    def test_groups_are_not_mixed(self):
        a = record()
        b = record("other", score_method="different-v1", quality=100, cost_cny=0, latency_seconds=1)
        result = analyze([a, b], {"group_id": group_id(a)})
        self.assertEqual(result["frontier_ids"], [a["id"]])
        self.assertEqual(len(result["excluded"]), 1)

    def test_unknown_or_cross_channel_group_rejected(self):
        with self.assertRaises(ValidationError):
            analyze(DEMO, {"group_id": "does-not-exist"})
        subscription = next(r for r in DEMO if r["channel"] == "subscription")
        with self.assertRaises(ValidationError):
            analyze(DEMO, {"group_id": group_id(subscription), "channel": "api"})

    def test_missing_metric_is_excluded_not_zero(self):
        result = analyze([record(latency_seconds=None)], {})
        self.assertEqual(result["records"], [])
        self.assertIn("缺少完整任务耗时", result["excluded"][0]["reasons"])

    def test_first_token_latency_cannot_be_used_for_selection(self):
        result = analyze([record(latency_method="first-token-v1")], {})
        self.assertEqual(result["records"], [])
        self.assertIn("完整任务执行时间", result["excluded"][0]["reasons"][0])

    def test_latest_snapshot_by_absolute_time(self):
        a = record("old", model="same", measured_at="2026-11-03T12:00:00+08:00")
        b = record("new", model="same", measured_at="2026-11-03T05:00:00Z")
        result = analyze([a, b], {})
        self.assertEqual([r["id"] for r in result["records"]], ["new"])
        self.assertEqual(len(result["excluded"]), 1)
        self.assertEqual(catalog([a, b])["groups"][0]["latest_at"], b["measured_at"])

    def test_incomplete_new_snapshot_does_not_fall_back(self):
        a = record("old", model="same", measured_at="2026-11-01T00:00:00Z")
        b = record("new", model="same", measured_at="2026-11-02T00:00:00Z", cost_cny=None)
        result = analyze([a, b], {})
        self.assertEqual(result["records"], [])
        self.assertEqual(result["summary"]["excluded"], 2)

    def test_subscription_recalculated_from_monthly_volume(self):
        a = analyze(DEMO, {"channel": "subscription", "monthly_tasks": 100})
        b = analyze(DEMO, {"channel": "subscription", "monthly_tasks": 1000})
        self.assertEqual(a["summary"]["comparable"], 4)
        for r in a["records"]:
            other = next(s for s in b["records"] if s["id"] == r["id"])
            self.assertAlmostEqual(r["cost_cny"], other["cost_cny"] * 10)
            self.assertAlmostEqual(r["cost_cny"] * 100, r["monthly_fee_cny"])

    def test_savings_never_degrades_quality(self):
        high = record("high", quality=95, cost_cny=1, latency_seconds=20)
        cheap = record("cheap", quality=80, cost_cny=.1, latency_seconds=20)
        result = analyze([high, cheap], {"baseline_id": "high", "budget_cny": .5})
        self.assertIsNone(result["savings"])

    def test_degenerate_regret_is_zero(self):
        result = analyze([record()], {})
        self.assertTrue(all(r["max_regret"] == 0 for r in result["recommendations"]))

    def test_invalid_constraints(self):
        for changes in ({"budget_cny": -1}, {"budget_cny": float("nan")}, {"max_latency_seconds": "x"}, {"min_quality": 101}, {"monthly_tasks": 0}, {"monthly_tasks": 1.5}, {"channel": "all"}, {"dataset_kind": "all"}):
            with self.subTest(changes=changes), self.assertRaises(ValidationError):
                analyze(DEMO, changes)


class RecordValidationTests(unittest.TestCase):
    def test_non_finite_metrics_rejected(self):
        for value in (float("nan"), float("inf"), "Infinity", True, -1, "not-number"):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                record(cost_cny=value)

    def test_quality_range_and_latency(self):
        for changes in ({"quality": 101}, {"quality": -1}, {"latency_seconds": 0}, {"sample_size": 0}, {"sample_size": 1.5}):
            with self.subTest(changes=changes), self.assertRaises(ValidationError):
                record(**changes)

    def test_nullable_metrics_allowed(self):
        r = record(quality=None, cost_cny="", latency_seconds=None)
        self.assertIsNone(r["quality"])
        self.assertIsNone(r["cost_cny"])

    def test_builtin_suite_cannot_skip_tasks_in_aggregate_import(self):
        with self.assertRaises(ValidationError):
            record(sample_size=7)
        self.assertEqual(record(sample_size=16)["sample_size"], 16)

    def test_required_provenance_and_timezone(self):
        for changes in ({"source_name": ""}, {"measured_at": "2026-11-03"}, {"model_version": None}, {"cost_notes": ""}, {"id": "unsafe/../../id"}):
            with self.subTest(changes=changes), self.assertRaises(ValidationError):
                record(**changes)

    def test_synthetic_cannot_be_passed_off_as_measured(self):
        with self.assertRaises(ValidationError):
            record(dataset_kind="measured")
        with self.assertRaises(ValidationError):
            record(source_type="self-built")

    def test_third_party_requires_valid_url(self):
        for url in ("", "javascript:alert(1)", "https://", "https://user:password@example.com/"):
            with self.subTest(url=url), self.assertRaises(ValidationError):
                record(dataset_kind="measured", source_type="third-party", source_url=url)
        self.assertEqual(record(dataset_kind="measured", source_type="third-party", source_url="https://example.com/snapshot")["source_type"], "third-party")

    def test_cost_method_channel_consistency(self):
        with self.assertRaises(ValidationError):
            record(cost_method="subscription-amortized-cny-v1")
        with self.assertRaises(ValidationError):
            record(channel="subscription", cost_method="subscription-amortized-cny-v1", monthly_fee_cny=None)
