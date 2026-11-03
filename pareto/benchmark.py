"""A narrow, reproducible Python code-review benchmark. Never executes generated code."""

from __future__ import annotations

import json
from decimal import Decimal

from .domain import DEFAULTS, ValidationError, integer, number, timestamp, validate_record

TASKS = [
    {"id": "review-01", "title": "收集任务标签", "instruction": "每次未传入 tags 时，应创建独立列表。定位会导致不同调用之间共享状态的问题。",
     "code": "def add_tag(tag, tags=[]):\n    tags.append(tag)\n    return tags", "expected": [{"line": 1, "category": "mutable-default"}]},
    {"id": "review-02", "title": "查询员工信息", "instruction": "name 来自不可信的用户输入。检查 SQL 注入风险。数据库连接 conn 由调用方管理。",
     "code": "def find_user(conn, name):\n    query = f\"SELECT * FROM users WHERE name = '{name}'\"\n    return conn.execute(query).fetchall()", "expected": [{"line": 2, "category": "sql-injection"}]},
    {"id": "review-03", "title": "合计项目工时", "instruction": "values 是普通的有限数字列表，包括空列表。找出数组访问边界问题。",
     "code": "def total_hours(values):\n    total = 0\n    for i in range(len(values) + 1):\n        total += values[i]\n    return total", "expected": [{"line": 3, "category": "off-by-one"}]},
    {"id": "review-04", "title": "异步读取用户", "instruction": "client.fetch_user 是 async 函数。load_user 被 await 后应直接返回用户字典，而非协程对象。",
     "code": "async def load_user(client, uid):\n    return client.fetch_user(uid)", "expected": [{"line": 2, "category": "missing-await"}]},
    {"id": "review-05", "title": "读取审查说明", "instruction": "path 是可信的本地文本文件。检查文件句柄生命周期，必须在返回或异常时显式保证关闭。",
     "code": "def read_notes(path):\n    handle = open(path, encoding='utf-8')\n    return handle.read()", "expected": [{"line": 2, "category": "resource-leak"}]},
    {"id": "review-06", "title": "处理上传内容", "instruction": "payload 是不可信的外部上传字节。检查反序列化导致代码执行的风险。",
     "code": "import pickle\n\ndef decode_upload(payload):\n    return pickle.loads(payload)", "expected": [{"line": 4, "category": "unsafe-deserialization"}]},
    {"id": "review-07", "title": "计算平均值", "instruction": "values 是有限数字组成的普通列表。空列表返回 0 符合需求；无需改变该约定。仅报告真实缺陷。",
     "code": "def average(values):\n    if not values:\n        return 0\n    return sum(values) / len(values)", "expected": []},
    {"id": "review-08", "title": "读取偏好设置", "instruction": "config 是普通 dict，theme 的值允许为 None。仅在键不存在时返回 'light' 符合需求。仅报告真实缺陷。",
     "code": "def get_theme(config):\n    return config.get('theme', 'light')", "expected": []},
]
CATEGORIES = ["mutable-default", "sql-injection", "off-by-one", "missing-await", "resource-leak", "unsafe-deserialization"]
RESPONSE_INSTRUCTION = ('请仅返回 JSON 对象 {"issues": [{"line": 1, "category": "mutable-default"}]}。'
                        'line 从 1 开始，定位问题根因行；没有缺陷时 issues 为 []。不要报告风格偏好。允许的 category：' + ", ".join(CATEGORIES))


def public_benchmark() -> dict:
    return {"id": "code-review-v1", "name": "Python 代码审查 · v1", "score_method": "issue-f1-v1",
            "description": "8 道微型缺陷定位任务，含 2 道无缺陷任务。每题 F1 的均值 × 100；格式无效记 0 分。仅衡量此固定任务集。",
            "response_instruction": RESPONSE_INSTRUCTION, "categories": CATEGORIES,
            "tasks": [{k: v for k, v in task.items() if k != "expected"} for task in TASKS],
            "result_template": {"config": {"id": "my-review-run-001", "model": "填写模型名", "model_version": "填写明确版本", "agent": "填写 Agent 或直接对话",
                "reasoning": "填写推理强度", "provider": "填写渠道供应商", "channel": "api", "dataset_kind": "measured", "source_type": "self-built",
                "source_name": "内部代码审查实测", "source_url": "", "cost_notes": "填写真实账单人民币费用的统计方式（含推理、缓存、汇率等）", "notes": ""},
                "responses": [{"task_id": t["id"], "started_at": None, "finished_at": None, "cost_cny": None, "output": None} for t in TASKS]}}


def parse_prediction(output, task: dict) -> tuple[list[dict], str | None]:
    try:
        if isinstance(output, str):
            if len(output) > 16000:
                raise ValueError
            output = json.loads(output)
        if not isinstance(output, dict) or not isinstance(output.get("issues"), list) or len(output["issues"]) > 100:
            raise ValueError
        issues = []
        seen = set()
        for issue in output["issues"]:
            if not isinstance(issue, dict):
                raise ValueError
            line = integer(issue.get("line"), "缺陷行号", maximum=10000)
            category = issue.get("category")
            if not isinstance(category, str) or not category or len(category) > 100:
                raise ValueError
            pair = (line, category)
            if pair in seen:
                raise ValueError
            seen.add(pair)
            issues.append({"line": line, "category": category})
        return issues, None
    except (ValueError, TypeError, RecursionError):
        return [], "响应不符合 JSON issues 格式，本题记 0 分"


def score_bundle(bundle: dict) -> dict:
    if not isinstance(bundle, dict) or not isinstance(bundle.get("config"), dict):
        raise ValidationError("需要 config 对象与 responses 数组；请下载结果模板")
    responses = bundle.get("responses")
    if not isinstance(responses, list) or len(responses) != len(TASKS):
        raise ValidationError(f"必须提交完整 {len(TASKS)} 道任务的响应，不能选择性报告高分任务")
    by_id = {}
    for row in responses:
        if not isinstance(row, dict) or row.get("task_id") not in {t["id"] for t in TASKS} or row["task_id"] in by_id:
            raise ValidationError("任务 ID 未知或重复")
        by_id[row["task_id"]] = row
    config = dict(bundle["config"])
    channel = config.get("channel", "api")
    if channel not in {"api", "subscription"}:
        raise ValidationError("channel 必须是 api 或 subscription")
    monthly_fee = number(config.get("monthly_fee_cny"), "订阅月费", nullable=channel == "api")
    monthly_tasks = integer(bundle.get("monthly_tasks", 500), "摊销月任务量")
    feedback = []
    costs = []
    finishes = []
    for task in TASKS:
        row = by_id[task["id"]]
        start = timestamp(row.get("started_at"), f"{task['id']} started_at")
        finish = timestamp(row.get("finished_at"), f"{task['id']} finished_at")
        duration = (finish - start).total_seconds()
        if not 0 < duration <= 86400:
            raise ValidationError(f"{task['id']} 必须记录 0–86400 秒之间的完整执行时间")
        if row.get("output") is None:
            raise ValidationError(f"{task['id']} 缺少 output；实际失败响应请填原始响应文本，不要删掉该题")
        raw_output = row["output"] if isinstance(row["output"], str) else json.dumps(row["output"], ensure_ascii=False)
        if len(raw_output) > 64000:
            raise ValidationError(f"{task['id']} 单题原始响应最多 64000 字")
        cost = number(row.get("cost_cny"), f"{task['id']} 账单费用") if channel == "api" else monthly_fee / monthly_tasks
        costs.append(Decimal(str(cost)))
        finishes.append(finish)
        prediction, error = parse_prediction(row["output"], task)
        actual = {(p["line"], p["category"]) for p in prediction}
        expected = {(p["line"], p["category"]) for p in task["expected"]}
        tp = len(actual & expected)
        score = (2 * tp / (len(actual) + len(expected)) if actual or expected else 1) if not error else 0
        feedback.append({"task_id": task["id"], "score": score * 100, "duration_seconds": duration, "cost_cny": cost,
                         "predicted": prediction, "expected": task["expected"], "error": error,
                         "started_at": start.isoformat(), "finished_at": finish.isoformat(), "output": raw_output})
    config.update(DEFAULTS)
    config.update(quality=sum(f["score"] for f in feedback) / len(TASKS), cost_cny=float(sum(costs) / len(TASKS)),
                  latency_seconds=sum(f["duration_seconds"] for f in feedback) / len(TASKS), sample_size=len(TASKS),
                  measured_at=max(finishes).isoformat(), cost_method="api-billed-cny-v1" if channel == "api" else "subscription-amortized-cny-v1",
                  task_results=feedback)
    config.setdefault("monthly_fee_cny", None)
    record = validate_record(config)
    return {"record": record, "feedback": feedback, "message": "规则评分完成；确认来源和费用口径后可导入"}


def validate_evidence(evidence) -> list[dict]:
    if not isinstance(evidence, list) or len(evidence) != len(TASKS):
        raise ValidationError("task_results 必须包含完整 8 题的评分证据")
    ids = set()
    result = []
    for row in evidence:
        if not isinstance(row, dict) or row.get("task_id") not in {t["id"] for t in TASKS} or row["task_id"] in ids:
            raise ValidationError("评分证据任务 ID 无效或重复")
        ids.add(row["task_id"])
        item = {"task_id": row["task_id"], "score": number(row.get("score"), "逐题分数", maximum=100),
                "duration_seconds": number(row.get("duration_seconds"), "逐题耗时", minimum=0.000001, maximum=86400),
                "cost_cny": number(row.get("cost_cny"), "逐题费用")}
        for field in ("started_at", "finished_at"):
            item[field] = timestamp(row.get(field), field).isoformat()
        duration = (timestamp(item["finished_at"], "finished_at") - timestamp(item["started_at"], "started_at")).total_seconds()
        if abs(duration - item["duration_seconds"]) > 1e-8:
            raise ValidationError("评分证据的起止时间与耗时不一致")
        for field in ("predicted", "expected"):
            parsed, error = parse_prediction({"issues": row.get(field)}, {})
            if error:
                raise ValidationError("评分证据缺陷列表格式无效")
            item[field] = parsed
        item["error"] = str(row.get("error") or "")[:200] or None
        output = row.get("output")
        if not isinstance(output, str) or len(output) > 64000:
            raise ValidationError("评分证据需要不超过 64000 字的原始 output 文本")
        item["output"] = output
        task = next(t for t in TASKS if t["id"] == item["task_id"])
        prediction, error = parse_prediction(output, task)
        actual = {(p["line"], p["category"]) for p in prediction}
        expected = {(p["line"], p["category"]) for p in task["expected"]}
        score = (2 * len(actual & expected) / (len(actual) + len(expected)) if actual or expected else 1) * 100 if not error else 0
        if prediction != item["predicted"] or item["expected"] != task["expected"] or abs(score - item["score"]) > 1e-8 or error != item["error"]:
            raise ValidationError("评分证据与原始响应的规则评分不一致")
        result.append(item)
    return result
