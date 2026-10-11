"""SPSS 风格 Web 统计分析平台 —— 后端服务。"""
from __future__ import annotations

import base64
import hmac
import io
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Body, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import procedures as P
from . import transforms as T
from .store import NUMERIC, STRING, STORE, Dataset, Variable, export_bytes, import_file

BASE_DIR = Path(__file__).resolve().parent.parent
WEB_DIR = BASE_DIR / "web"

# 可选访问口令：部署到公网时设置这两个环境变量即可开启 HTTP Basic 认证。
# 不设置则完全开放（本地使用）。
AUTH_USER = os.environ.get("SPSS_WEB_USER", "")
AUTH_PASS = os.environ.get("SPSS_WEB_PASS", "")
AUTH_ON = bool(AUTH_USER and AUTH_PASS)

app = FastAPI(title="SPSS Web 统计分析平台", version="1.0.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


@app.middleware("http")
async def basic_auth(request, call_next):
    """设置 SPSS_WEB_USER / SPSS_WEB_PASS 后启用 Basic 认证；/api/health 始终放行。"""
    if not AUTH_ON or request.url.path == "/api/health":
        return await call_next(request)
    header = request.headers.get("authorization", "")
    if header[:6].lower() == "basic ":
        try:
            raw = base64.b64decode(header[6:]).decode("utf-8")
            user, _, pw = raw.partition(":")
        except Exception:
            user, pw = "", ""
        if hmac.compare_digest(user, AUTH_USER) and hmac.compare_digest(pw, AUTH_PASS):
            return await call_next(request)
    return Response(
        status_code=401,
        content="需要登录：请在弹出的对话框中输入访问账号与口令。\n",
        media_type="text/plain; charset=utf-8",
        headers={"WWW-Authenticate": 'Basic realm="SPSS Web", charset="UTF-8"'},
    )


# ---------------------------------------------------------------- 模型

class NewDataset(BaseModel):
    name: Optional[str] = None
    variables: Optional[List[Dict[str, Any]]] = None
    rows: Optional[List[List[Any]]] = None


class CellPatch(BaseModel):
    row: int
    col: int
    value: Any


class CellsPatch(BaseModel):
    cells: List[CellPatch]


class RowInsert(BaseModel):
    index: Optional[int] = None
    values: Optional[List[Any]] = None
    count: int = 1


class AnalyzeReq(BaseModel):
    procedure: str
    params: Dict[str, Any] = {}


class TransformReq(BaseModel):
    transform: str
    params: Dict[str, Any] = {}


class SyntaxReq(BaseModel):
    syntax: str


# ---------------------------------------------------------------- 工具

def _get(ds_id: str) -> Dataset:
    ds = STORE.get(ds_id)
    if not ds:
        raise HTTPException(404, f"数据集不存在：{ds_id}")
    return ds


def _blocks(ds: Dataset, blocks: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "datasetId": ds.id,
        "datasets": STORE.list(),
        "blocks": blocks,
    }


# ---------------------------------------------------------------- 数据集

@app.get("/api/datasets")
def list_datasets():
    return {"datasets": STORE.list()}


@app.post("/api/datasets")
def create_dataset(req: NewDataset):
    ds = STORE.create(req.name)
    if req.variables:
        for v in req.variables:
            ds.variables.append(Variable.from_dict(v))
    if req.rows:
        ds.records = [[_clean_cell(x) for x in r] for r in req.rows]
    return ds.to_dict()


@app.get("/api/datasets/{ds_id}")
def get_dataset(ds_id: str, offset: int = 0, limit: Optional[int] = Query(None)):
    ds = _get(ds_id)
    return ds.to_dict(offset=offset, limit=limit)


@app.delete("/api/datasets/{ds_id}")
def delete_dataset(ds_id: str):
    STORE.remove(ds_id)
    return {"ok": True, "datasets": STORE.list()}


@app.patch("/api/datasets/{ds_id}")
def rename_dataset(ds_id: str, payload: Dict[str, Any] = Body(...)):
    ds = _get(ds_id)
    if payload.get("name"):
        ds.name = payload["name"]
    for key in ("splitVar", "filterVar", "weightVar"):
        if key in payload:
            setattr(ds, key, payload[key])
    return ds.summary()


# ---------------------------------------------------------------- 数据编辑

@app.put("/api/datasets/{ds_id}/cells")
def update_cells(ds_id: str, req: CellsPatch):
    ds = _get(ds_id)
    for c in req.cells:
        while len(ds.records) <= c.row:
            ds.records.append([None] * len(ds.variables))
        if c.col >= len(ds.variables):
            continue
        while len(ds.records[c.row]) < len(ds.variables):
            ds.records[c.row].append(None)
        ds.records[c.row][c.col] = _clean_cell(c.value)
    return {"ok": True, "total": ds.n_cases}


@app.post("/api/datasets/{ds_id}/rows")
def insert_rows(ds_id: str, req: RowInsert):
    ds = _get(ds_id)
    idx = req.index if req.index is not None else len(ds.records)
    for _ in range(max(1, req.count)):
        row = list(req.values) if req.values else [None] * len(ds.variables)
        while len(row) < len(ds.variables):
            row.append(None)
        ds.records.insert(idx, row[: len(ds.variables)] or row)
    return {"ok": True, "total": ds.n_cases}


@app.delete("/api/datasets/{ds_id}/rows")
def delete_rows(ds_id: str, indexes: str = Query(...)):
    ds = _get(ds_id)
    idxs = sorted({int(i) for i in indexes.split(",") if i.strip() != ""}, reverse=True)
    for i in idxs:
        if 0 <= i < len(ds.records):
            ds.records.pop(i)
    return {"ok": True, "total": ds.n_cases}


@app.post("/api/datasets/{ds_id}/variables")
def add_variable(ds_id: str, payload: Dict[str, Any] = Body(...)):
    ds = _get(ds_id)
    name = payload.get("name") or ds.unique_name("VAR")
    if ds.var(name):
        raise HTTPException(400, f"变量已存在：{name}")
    var = Variable.from_dict({**payload, "name": name})
    ds.variables.append(var)
    for row in ds.records:
        row.append(None)
    return {"ok": True, "variables": [v.to_dict() for v in ds.variables]}


@app.put("/api/datasets/{ds_id}/variables/{name}")
def update_variable(ds_id: str, name: str, payload: Dict[str, Any] = Body(...)):
    ds = _get(ds_id)
    var = ds.var(name)
    if not var:
        raise HTTPException(404, f"变量不存在：{name}")
    new_name = payload.get("name")
    if new_name and new_name != name:
        if ds.var(new_name):
            raise HTTPException(400, f"变量名重复：{new_name}")
        var.name = new_name
    for key in ("type", "width", "decimals", "label", "values", "missing", "columns", "align", "measure", "role"):
        if key in payload and payload[key] is not None:
            setattr(var, key, payload[key])
    return {"ok": True, "variables": [v.to_dict() for v in ds.variables]}


@app.delete("/api/datasets/{ds_id}/variables/{name}")
def delete_variable(ds_id: str, name: str):
    ds = _get(ds_id)
    if name not in ds.names:
        raise HTTPException(404, f"变量不存在：{name}")
    j = ds.names.index(name)
    ds.variables.pop(j)
    for row in ds.records:
        if j < len(row):
            row.pop(j)
    return {"ok": True, "variables": [v.to_dict() for v in ds.variables]}


# ---------------------------------------------------------------- 导入导出

@app.post("/api/datasets/{ds_id}/import")
async def import_data(ds_id: str, file: UploadFile = File(...), replace: bool = Query(True)):
    ds = _get(ds_id)
    content = await file.read()
    try:
        df = import_file(file.filename or "data.csv", content)
    except Exception as e:
        raise HTTPException(400, str(e))
    if replace:
        ds.replace_from_dataframe(df, keep_meta=False)
    else:
        for col in df.columns:
            if col not in ds.names:
                ds.variables.append(Variable(str(col), NUMERIC if str(df[col].dtype) != "object" else STRING,
                                             align="right" if str(df[col].dtype) != "object" else "left"))
        for row in df.itertuples(index=False, name=None):
            ds.records.append([_clean_cell(x) for x in row])
    return ds.to_dict()


@app.get("/api/datasets/{ds_id}/export")
def export_data(ds_id: str, format: str = "csv"):
    ds = _get(ds_id)
    try:
        content, mime, fname = export_bytes(ds, format)
    except Exception as e:
        raise HTTPException(400, str(e))
    from urllib.parse import quote
    return Response(content=content, media_type=mime,
                    headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(fname)}"})


# ---------------------------------------------------------------- 分析

@app.post("/api/datasets/{ds_id}/analyze")
def analyze(ds_id: str, req: AnalyzeReq):
    ds = _get(ds_id)
    fn = P.PROCEDURES.get(req.procedure)
    if not fn:
        raise HTTPException(400, f"未知的分析过程：{req.procedure}")
    df = ds.to_dataframe()
    try:
        blocks = fn(df, ds, req.params or {})
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"分析失败：{e}")
    return _blocks(ds, blocks)


@app.post("/api/datasets/{ds_id}/transform")
def transform(ds_id: str, req: TransformReq):
    ds = _get(ds_id)
    fn = T.TRANSFORMS.get(req.transform)
    if not fn:
        raise HTTPException(400, f"未知的转换：{req.transform}")
    df = ds.to_dataframe()
    try:
        new_ds, blocks = fn(df, ds, req.params or {})
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"转换失败：{e}")
    return _blocks(new_ds, blocks)


@app.post("/api/datasets/{ds_id}/syntax")
def run_syntax(ds_id: str, req: SyntaxReq):
    ds = _get(ds_id)
    from .syntax import run_syntax as _run
    try:
        new_ds, blocks = _run(req.syntax, ds)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"语法执行失败：{e}")
    return _blocks(new_ds, blocks)


# ---------------------------------------------------------------- 示例数据

@app.post("/api/samples/{kind}")
def load_sample(kind: str):
    ds = _sample(kind)
    return {"datasetId": ds.id, "dataset": ds.to_dict(), "datasets": STORE.list()}


def _sample(kind: str) -> Dataset:
    import numpy as np
    rng = np.random.default_rng(20241004)

    if kind == "employee":
        n = 120
        ds = STORE.create("员工满意度调查")
        ds.variables = [
            Variable("id", NUMERIC, width=6, decimals=0, label="编号", measure="nominal"),
            Variable("gender", NUMERIC, decimals=0, label="性别", values={"1": "男", "2": "女"}, measure="nominal"),
            Variable("age", NUMERIC, decimals=0, label="年龄", measure="scale"),
            Variable("dept", NUMERIC, decimals=0, label="部门",
                     values={"1": "研发", "2": "市场", "3": "人事", "4": "财务"}, measure="nominal"),
            Variable("edu", NUMERIC, decimals=0, label="学历",
                     values={"1": "大专", "2": "本科", "3": "硕士", "4": "博士"}, measure="ordinal"),
            Variable("tenure", NUMERIC, decimals=1, label="工龄(年)", measure="scale"),
            Variable("salary", NUMERIC, decimals=0, label="月薪(元)", measure="scale"),
            Variable("satisfaction", NUMERIC, decimals=0, label="工作满意度", values={"1": "很不满意", "2": "不满意", "3": "一般", "4": "满意", "5": "很满意"}, measure="ordinal"),
            Variable("engagement", NUMERIC, decimals=1, label="敬业度得分", measure="scale"),
            Variable("overtime", NUMERIC, decimals=1, label="周均加班(小时)", measure="scale"),
            Variable("intent", NUMERIC, decimals=0, label="离职意向", values={"0": "否", "1": "是"}, measure="nominal"),
            Variable("q1", NUMERIC, decimals=0, label="薪酬公平感", measure="ordinal"),
            Variable("q2", NUMERIC, decimals=0, label="上级支持", measure="ordinal"),
            Variable("q3", NUMERIC, decimals=0, label="成长机会", measure="ordinal"),
            Variable("q4", NUMERIC, decimals=0, label="团队氛围", measure="ordinal"),
            Variable("q5", NUMERIC, decimals=0, label="工作自主性", measure="ordinal"),
        ]
        gender = rng.integers(1, 3, n)
        dept = rng.integers(1, 5, n)
        edu = rng.choice([1, 2, 3, 4], n, p=[0.15, 0.55, 0.25, 0.05])
        age = np.clip(rng.normal(33, 7, n), 21, 58).round().astype(int)
        tenure = np.clip(age - rng.integers(21, 26, n), 0, None).round(1)
        base = 6000 + dept * 800 + edu * 900
        salary = np.clip(base + rng.normal(0, 1800, n), 3500, None).round(-2)
        # 5 道量表题共享一个潜在因子，保证因子分析 / 信度分析结果有意义
        latent = rng.normal(0, 1, n)
        q = np.clip(np.round(3.55 + 0.78 * latent[:, None] + rng.normal(0, 0.55, (n, 5))), 1, 5).astype(int)
        satisfaction = np.clip(np.round(q.mean(axis=1) + rng.normal(0, 0.45, n)), 1, 5).astype(int)
        engagement = np.clip(q.mean(axis=1) * 12 + rng.normal(0, 6, n), 0, 100).round(1)
        overtime = np.clip(rng.gamma(2, 3.2, n), 0, 30).round(1)
        logit = -1.2 + 0.35 * (3 - satisfaction) + 0.06 * overtime - 0.03 * (engagement - 55) / 5
        intent = (rng.random(n) < 1 / (1 + np.exp(-logit))).astype(int)
        ds.records = [[int(i + 1), int(gender[i]), int(age[i]), int(dept[i]), int(edu[i]),
                       float(tenure[i]), float(salary[i]), int(satisfaction[i]), float(engagement[i]),
                       float(overtime[i]), int(intent[i])] + [int(x) for x in q[i]] for i in range(n)]
        return ds

    if kind == "students":
        n = 150
        ds = STORE.create("学生成绩数据")
        ds.variables = [
            Variable("sid", NUMERIC, decimals=0, label="学号", measure="nominal"),
            Variable("class", NUMERIC, decimals=0, label="班级",
                     values={"1": "一班", "2": "二班", "3": "三班"}, measure="nominal"),
            Variable("gender", NUMERIC, decimals=0, label="性别", values={"1": "男", "2": "女"}, measure="nominal"),
            Variable("math", NUMERIC, decimals=1, label="数学", measure="scale"),
            Variable("chinese", NUMERIC, decimals=1, label="语文", measure="scale"),
            Variable("english", NUMERIC, decimals=1, label="英语", measure="scale"),
            Variable("study_hours", NUMERIC, decimals=1, label="周学习时长", measure="scale"),
            Variable("sleep_hours", NUMERIC, decimals=1, label="日均睡眠", measure="scale"),
            Variable("score", NUMERIC, decimals=1, label="总评成绩", measure="scale"),
            Variable("pass", NUMERIC, decimals=0, label="是否及格", values={"0": "否", "1": "是"}, measure="nominal"),
        ]
        cls = rng.integers(1, 4, n)
        gender = rng.integers(1, 3, n)
        study = np.clip(rng.normal(14, 5, n), 1, 40).round(1)
        sleep = np.clip(rng.normal(7.2, 1.1, n), 4, 10).round(1)
        base = 40 + study * 1.6 + (sleep - 7) * 2.5
        math = np.clip(base + rng.normal(0, 8, n), 0, 100).round(1)
        chinese = np.clip(base + rng.normal(2, 8, n), 0, 100).round(1)
        english = np.clip(base + rng.normal(-1, 9, n), 0, 100).round(1)
        score = ((math + chinese + english) / 3).round(1)
        pas = (score >= 60).astype(int)
        ds.records = [[int(i + 1), int(cls[i]), int(gender[i]), float(math[i]), float(chinese[i]),
                       float(english[i]), float(study[i]), float(sleep[i]), float(score[i]), int(pas[i])]
                      for i in range(n)]
        return ds

    if kind == "sales":
        ds = STORE.create("月度销售数据")
        ds.variables = [
            Variable("month", STRING, label="月份", align="left", width=10, columns=10, measure="nominal"),
            Variable("region", STRING, label="区域", align="left", width=10, columns=10, measure="nominal"),
            Variable("channel", STRING, label="渠道", align="left", width=10, columns=10, measure="nominal"),
            Variable("sales", NUMERIC, decimals=0, label="销售额", measure="scale"),
            Variable("units", NUMERIC, decimals=0, label="销量", measure="scale"),
            Variable("cost", NUMERIC, decimals=0, label="成本", measure="scale"),
            Variable("profit", NUMERIC, decimals=0, label="利润", measure="scale"),
        ]
        months = [f"2024-{m:02d}" for m in range(1, 13)]
        regions = ["华东", "华南", "华北", "西南"]
        channels = ["线上", "线下", "分销"]
        rows = []
        for m in months:
            for r in regions:
                for c in channels:
                    units = int(max(5, rng.normal(120, 35)))
                    price = {"线上": 320, "线下": 380, "分销": 280}[c]
                    sales = units * price
                    cost = sales * rng.uniform(0.55, 0.8)
                    rows.append([m, r, c, float(round(sales)), float(units), float(round(cost)), float(round(sales - cost))])
        ds.records = rows
        return ds

    raise HTTPException(404, f"未知的示例数据集：{kind}")


@app.get("/api/samples")
def samples():
    return {"samples": [
        {"kind": "employee", "name": "员工满意度调查", "desc": "120 名员工，含性别/部门/学历/满意度/敬业度等 16 个变量"},
        {"kind": "students", "name": "学生成绩数据", "desc": "150 名学生，含班级/性别/三科成绩/学习时长等 10 个变量"},
        {"kind": "sales", "name": "月度销售数据", "desc": "12 个月 × 4 区域 × 3 渠道，含销售额/成本/利润"},
    ]}


# ---------------------------------------------------------------- SPSS 自带示例数据

@app.get("/api/spss-samples")
def spss_samples(refresh: int = 0):
    """列出随包分发的 SPSS 示例数据（.sav）。"""
    from .samples import list_samples, sample_dir
    return {"samples": list_samples(force=bool(refresh)), "dir": str(sample_dir())}


@app.post("/api/spss-samples/{filename}")
def load_spss_sample(filename: str):
    """把某个 SPSS 示例 .sav 载入为当前数据集。"""
    from .samples import load_sav_dataset
    try:
        ds = load_sav_dataset(filename)
    except FileNotFoundError:
        raise HTTPException(404, f"示例数据不存在：{filename}")
    except Exception as e:
        raise HTTPException(400, f"读取示例数据失败：{e}")
    return {"datasetId": ds.id, "dataset": ds.to_dict(), "datasets": STORE.list()}


# ---------------------------------------------------------------- 语法命令定义库

@app.get("/api/syntax/stats")
def syntax_stats():
    """命令定义库的规模统计。"""
    from .syntaxref import stats
    return stats()


@app.get("/api/syntax/commands")
def syntax_commands(q: str = "", supported: int = 0):
    """命令清单（来自 syntax_xml 的 328 份命令定义）。"""
    from .syntaxref import list_commands
    return {"commands": list_commands(q=q, only_supported=bool(supported))}


@app.get("/api/syntax/commands/{name}")
def syntax_command(name: str):
    """单条命令的完整定义：子命令 / 参数 / 枚举值。"""
    from .syntaxref import get_command
    rec = get_command(name)
    if not rec:
        raise HTTPException(404, f"未找到命令定义：{name}")
    return rec


@app.get("/api/syntax/complete")
def syntax_complete(text: str = "", offset: Optional[int] = None):
    """依据光标上下文给出关键字补全候选。"""
    from .syntaxref import complete
    return complete(text, offset)


@app.post("/api/syntax/check")
def syntax_check(req: SyntaxReq):
    """按命令定义静态检查语法，返回逐条诊断。"""
    from .syntaxref import check
    return check(req.syntax)


@app.get("/api/syntax/reference.pdf")
def syntax_reference_pdf():
    """随包分发的《IBM SPSS Statistics 语法参考》手册（PDF）。"""
    from urllib.parse import quote
    path = BASE_DIR / "docs" / "syntaxreference.pdf"
    if not path.exists():
        raise HTTPException(404, "语法参考手册未随包分发")
    name = quote("IBM SPSS Statistics 语法参考手册.pdf")
    return FileResponse(str(path), media_type="application/pdf",
                        headers={"Content-Disposition": f"inline; filename*=UTF-8''{name}"})


def _clean_cell(x: Any) -> Any:
    if x is None:
        return None
    if isinstance(x, str):
        s = x.strip()
        if s == "":
            return None
        try:
            f = float(s)
            return int(f) if f.is_integer() and abs(f) < 1e15 else f
        except ValueError:
            return s
    if isinstance(x, bool):
        return int(x)
    if isinstance(x, float) and x.is_integer():
        return int(x)
    return x


# ---------------------------------------------------------------- 静态资源

if WEB_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")

    @app.get("/")
    def index():
        return FileResponse(str(WEB_DIR / "index.html"))


@app.get("/api/health")
def health():
    return {"ok": True, "datasets": len(STORE.order)}
