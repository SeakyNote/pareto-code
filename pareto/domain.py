"""Validation and deterministic multi-objective selection (no network calls)."""

from __future__ import annotations

import hashlib
import math
import re
from datetime import datetime
from typing import Any

SCENARIOS = [{"id": "code-review", "name": "代码开发 · Python 代码审查", "description": "缺陷定位与误报控制 · 固定任务集"}]
GROUP_FIELDS = ("scenario", "suite", "score_method", "latency_method", "cost_method", "channel", "dataset_kind")
CONFIG_FIELDS = ("model", "model_version", "agent", "reasoning", "provider")
TEXT_FIELDS = ("id", *GROUP_FIELDS, *CONFIG_FIELDS, "source_name", "source_type", "measured_at", "cost_notes")
DEFAULTS = {"scenario": "code-review", "suite": "code-review-v1", "score_method": "issue-f1-v1", "latency_method": "end-to-end-v1"}


class ValidationError(ValueError):
    pass


def number(value: Any, name: str, *, minimum: float = 0, maximum: float = 1e12, nullable: bool = False) -> float | None:
    if nullable and (value is None or value == ""):
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise ValidationError(f"{name} 必须是有效数字")
    try:
        result = float(value)
    except (ValueError, OverflowError):
        raise ValidationError(f"{name} 必须是有效数字") from None
    if not math.isfinite(result) or result < minimum or result > maximum:
        raise ValidationError(f"{name} 必须在 {minimum:g}–{maximum:g} 之间")
    return result


def integer(value: Any, name: str, *, minimum: int = 1, maximum: int = 1_000_000) -> int:
    result = number(value, name, minimum=minimum, maximum=maximum)
    if result != int(result):
        raise ValidationError(f"{name} 必须是整数")
    return int(result)


def timestamp(value: Any, name: str) -> datetime:
    try:
        if not isinstance(value, str):
            raise ValueError
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if result.tzinfo is None or result.utcoffset() is None:
            raise ValueError
        return result
    except (ValueError, TypeError):
        raise ValidationError(f"{name} 必须是含时区的 ISO 8601 时间") from None


def validate_record(raw: Any) -> dict:
    if not isinstance(raw, dict):
        raise ValidationError("每条记录必须是 JSON 对象")
    record: dict = {}
    for key in TEXT_FIELDS:
        value = raw.get(key)
        if not isinstance(value, str) or not value.strip() or len(value) > (1500 if key == "cost_notes" else 200):
            raise ValidationError(f"{key} 为必填文本，长度不合法")
        record[key] = value.strip()
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,99}", record["id"]):
        raise ValidationError("id 仅允许 1–100 位字母、数字、点、下划线或连字符")
    if record["scenario"] not in {s["id"] for s in SCENARIOS}:
        raise ValidationError("MVP 当前仅支持 code-review 场景")
    if record["channel"] not in {"api", "subscription"}:
        raise ValidationError("channel 必须是 api 或 subscription")
    if record["dataset_kind"] not in {"demo", "measured"}:
        raise ValidationError("dataset_kind 必须是 demo 或 measured")
    if record["source_type"] not in {"synthetic", "self-built", "third-party"}:
        raise ValidationError("source_type 必须是 synthetic、self-built 或 third-party")
    if (record["source_type"] == "synthetic") != (record["dataset_kind"] == "demo"):
        raise ValidationError("合成来源必须标为 demo，真实数据不得使用 synthetic 来源")
    if record["cost_method"] != {"api": "api-billed-cny-v1", "subscription": "subscription-amortized-cny-v1"}[record["channel"]]:
        raise ValidationError("成本口径必须与使用渠道对应")
    timestamp(record["measured_at"], "measured_at")
    record["quality"] = number(raw.get("quality"), "quality", maximum=100, nullable=True)
    record["cost_cny"] = number(raw.get("cost_cny"), "cost_cny", nullable=True)
    record["latency_seconds"] = number(raw.get("latency_seconds"), "latency_seconds", minimum=0.000001, maximum=86400, nullable=True)
    record["sample_size"] = integer(raw.get("sample_size"), "sample_size")
    if record["suite"] == "code-review-v1" and record["score_method"] == "issue-f1-v1" and record["sample_size"] % 8:
        raise ValidationError("code-review-v1 必须完整覆盖 8 题；重复评测的样本量必须是 8 的倍数")
    record["monthly_fee_cny"] = number(raw.get("monthly_fee_cny"), "monthly_fee_cny", nullable=True)
    if record["channel"] == "subscription" and record["monthly_fee_cny"] is None:
        raise ValidationError("订阅渠道需要 monthly_fee_cny 才能按任务量摊销")
    if record["channel"] == "api" and record["monthly_fee_cny"] is not None:
        raise ValidationError("API 渠道不可填写订阅月费")
    for key in ("source_url", "notes"):
        value = raw.get(key, "")
        if not isinstance(value, str) or len(value) > 3000:
            raise ValidationError(f"{key} 必须是最多 3000 字的文本")
        record[key] = value
    if record["source_url"]:
        from urllib.parse import urlsplit
        try:
            url = urlsplit(record["source_url"])
            if url.scheme not in {"http", "https"} or not url.hostname or url.username or url.password:
                raise ValueError
        except ValueError:
            raise ValidationError("source_url 必须是无账号信息的 http(s) 地址") from None
    if record["source_type"] == "third-party" and not record["source_url"]:
        raise ValidationError("第三方数据必须填写可追溯的 source_url")
    if "task_results" in raw:
        # Only retain bounded, validated scorer evidence; arbitrary imported payloads are not trusted.
        from .benchmark import validate_evidence
        record["task_results"] = validate_evidence(raw["task_results"])
        if any(record[key] != value for key, value in DEFAULTS.items()):
            raise ValidationError("内置逐题证据只能用于 code-review-v1 的固定评分口径")
        evidence = record["task_results"]
        if record["sample_size"] != len(evidence):
            raise ValidationError("样本量与逐题证据数量不一致")
        for metric, field in (("quality", "score"), ("cost_cny", "cost_cny"), ("latency_seconds", "duration_seconds")):
            mean = sum(row[field] for row in evidence) / len(evidence)
            if record[metric] is None or not math.isclose(record[metric], mean, rel_tol=1e-9, abs_tol=1e-8):
                raise ValidationError(f"{metric} 与逐题证据汇总不一致")
        if timestamp(record["measured_at"], "measured_at") != max(timestamp(row["finished_at"], "finished_at") for row in evidence):
            raise ValidationError("评测时间必须等于逐题证据的最后完成时间")
    return record


def group_id(record: dict) -> str:
    key = "\x1f".join(record[field] for field in GROUP_FIELDS)
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def dominates(a: dict, b: dict) -> bool:
    return (a["quality"] >= b["quality"] and a["cost_cny"] <= b["cost_cny"] and a["latency_seconds"] <= b["latency_seconds"]
            and (a["quality"] > b["quality"] or a["cost_cny"] < b["cost_cny"] or a["latency_seconds"] < b["latency_seconds"]))


def frontier(records: list[dict]) -> list[dict]:
    return [b for b in records if not any(dominates(a, b) for a in records)]


def catalog(records: list[dict]) -> dict:
    groups: dict[str, dict] = {}
    for record in records:
        key = group_id(record)
        if key not in groups:
            groups[key] = {field: record[field] for field in GROUP_FIELDS}
            groups[key].update(id=key, count=0, latest_at=record["measured_at"])
        group = groups[key]
        group["count"] += 1
        if timestamp(record["measured_at"], "measured_at") > timestamp(group["latest_at"], "latest_at"):
            group["latest_at"] = record["measured_at"]
    return {"scenarios": SCENARIOS, "groups": sorted(groups.values(), key=lambda g: (g["dataset_kind"], g["channel"], g["suite"])),
            "counts": {kind: sum(r["dataset_kind"] == kind for r in records) for kind in ("demo", "measured")}}


def analyze(records: list[dict], request: dict) -> dict:
    if not isinstance(request, dict):
        raise ValidationError("选型参数必须是对象")
    kind = request.get("dataset_kind", "demo")
    channel = request.get("channel", "api")
    if kind not in {"demo", "measured"} or channel not in {"api", "subscription"}:
        raise ValidationError("数据类型或渠道无效")
    budget = number(request.get("budget_cny"), "单任务费用上限", nullable=True)
    max_time = number(request.get("max_latency_seconds"), "任务耗时上限", maximum=86400, nullable=True)
    min_quality = number(request.get("min_quality", 0), "最低效果", maximum=100)
    monthly_tasks = integer(request.get("monthly_tasks", 500), "预计月任务量")
    scoped = [dict(r) for r in records if r["dataset_kind"] == kind and r["channel"] == channel]
    available = catalog(scoped)["groups"]
    selected_group = request.get("group_id")
    if selected_group is None and available:
        selected_group = sorted(available, key=lambda g: (-g["count"], g["id"]))[0]["id"]
    if selected_group is not None and selected_group not in {g["id"] for g in available}:
        raise ValidationError("比较组不存在，或与所选渠道、数据性质不一致")
    excluded = []
    eligible = []
    candidates = []
    scoped.sort(key=lambda r: (timestamp(r["measured_at"], "measured_at"), r["id"]), reverse=True)
    seen: set[tuple] = set()
    for record in scoped:
        reasons = []
        if group_id(record) != selected_group:
            reasons.append("任务集或评分、费用、耗时口径与当前比较组不同")
        else:
            if record["latency_method"] != "end-to-end-v1":
                reasons.append("耗时口径不是已对齐的完整任务执行时间，暂不参与比较")
            identity = tuple(record[f] for f in CONFIG_FIELDS)
            if identity in seen:
                reasons.append("同配置已有更新快照，历史记录保留供追溯")
            seen.add(identity)
            if channel == "subscription":
                record["cost_cny"] = record["monthly_fee_cny"] / monthly_tasks
            for metric, label in (("quality", "任务效果"), ("cost_cny", "单任务费用"), ("latency_seconds", "完整任务耗时")):
                if record[metric] is None:
                    reasons.append(f"缺少{label}")
        if reasons:
            excluded.append({"record": record, "reasons": reasons})
            continue
        candidates.append(record)
    full_frontier = frontier(candidates)
    front_ids = {r["id"] for r in full_frontier}
    for record in candidates:
        violations = []
        if budget is not None and record["cost_cny"] > budget:
            violations.append("超出费用上限")
        if max_time is not None and record["latency_seconds"] > max_time:
            violations.append("超出耗时上限")
        if record["quality"] < min_quality:
            violations.append("未达到效果底线")
        record["is_frontier"] = record["id"] in front_ids
        record["feasible"] = not violations
        record["violations"] = violations
        record["dominated_by"] = [a["id"] for a in candidates if dominates(a, record)]
        if not violations:
            eligible.append(record)
    feasible_frontier = frontier(eligible)
    recommendations = []
    if feasible_frontier:
        spans = {k: (min(r[k] for r in feasible_frontier), max(r[k] for r in feasible_frontier))
                 for k in ("quality", "cost_cny", "latency_seconds")}

        def regret(r: dict) -> float:
            values = []
            for k, (low, high) in spans.items():
                values.append(0 if high == low else ((high - r[k]) if k == "quality" else (r[k] - low)) / (high - low))
            return max(values)

        ranked = (
            ("economy", "省钱优先", min(feasible_frontier, key=lambda r: (r["cost_cny"], -r["quality"], r["latency_seconds"], r["id"]))),
            ("balanced", "均衡推荐", min(feasible_frontier, key=lambda r: (regret(r), -r["quality"], r["cost_cny"], r["latency_seconds"], r["id"]))),
            ("quality", "效果优先", min(feasible_frontier, key=lambda r: (-r["quality"], r["cost_cny"], r["latency_seconds"], r["id"])))
        )
        for role, label, record in ranked:
            reason = {"economy": "满足全部约束的前沿配置中，平均每任务费用最低。", "balanced": "在效果、费用与耗时三个目标中，最大归一化遗憾最小。", "quality": "满足全部约束的前沿配置中，任务效果得分最高。"}[role]
            recommendations.append({"role": role, "label": label, "record_id": record["id"], "reason": reason, "max_regret": regret(record)})
    baseline = next((r for r in candidates if r["id"] == request.get("baseline_id")), None)
    if baseline is None and candidates:
        baseline = max(candidates, key=lambda r: (r["quality"], -r["cost_cny"], -r["latency_seconds"], r["id"]))
    savings = None
    if baseline:
        alternatives = [r for r in eligible if r["quality"] >= baseline["quality"]]
        if alternatives:
            best = min(alternatives, key=lambda r: (r["cost_cny"], r["latency_seconds"], -r["quality"], r["id"]))
            delta = baseline["cost_cny"] - best["cost_cny"]
            savings = {"record_id": best["id"], "monthly_cny": max(0, delta * monthly_tasks),
                       "percent": max(0, delta / baseline["cost_cny"] * 100) if baseline["cost_cny"] else 0,
                       "baseline_monthly_cny": baseline["cost_cny"] * monthly_tasks,
                       "recommended_monthly_cny": best["cost_cny"] * monthly_tasks,
                       "quality_floor": baseline["quality"]}
    suggestions = []
    if not eligible and candidates:
        # Relax one condition at a time; never imply an individually sufficient relaxation if it is not.
        if budget is not None:
            pool = [r for r in candidates if r["quality"] >= min_quality and (max_time is None or r["latency_seconds"] <= max_time)]
            if pool:
                suggestions.append({"field": "budget_cny", "value": min(r["cost_cny"] for r in pool), "label": "仅放宽费用上限即可有解"})
        if max_time is not None:
            pool = [r for r in candidates if r["quality"] >= min_quality and (budget is None or r["cost_cny"] <= budget)]
            if pool:
                suggestions.append({"field": "max_latency_seconds", "value": min(r["latency_seconds"] for r in pool), "label": "仅放宽耗时上限即可有解"})
        pool = [r for r in candidates if (budget is None or r["cost_cny"] <= budget) and (max_time is None or r["latency_seconds"] <= max_time)]
        if pool:
            suggestions.append({"field": "min_quality", "value": max(r["quality"] for r in pool), "label": "仅调整效果底线即可有解"})
    return {"group": next((g for g in available if g["id"] == selected_group), None),
            "constraints": {"budget_cny": budget, "max_latency_seconds": max_time, "min_quality": min_quality, "monthly_tasks": monthly_tasks},
            "records": sorted(candidates, key=lambda r: (-r["quality"], r["cost_cny"], r["id"])),
            "frontier_ids": sorted(front_ids), "feasible_frontier_ids": [r["id"] for r in feasible_frontier],
            "excluded": excluded, "recommendations": recommendations, "baseline_id": baseline["id"] if baseline else None,
            "savings": savings, "suggestions": suggestions,
            "summary": {"comparable": len(candidates), "feasible": len(eligible), "frontier": len(full_frontier), "excluded": len(excluded)}}
