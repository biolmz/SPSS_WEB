"""数据转换：计算变量、重新编码、排序、筛选、拆分、汇总、转置、加权。"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from .output import chart, label_of, note, num, table, title
from .store import NUMERIC, STRING, Dataset, Variable

# 计算变量可用的函数命名空间
SAFE_FUNCS: Dict[str, Any] = {
    "abs": np.abs, "sqrt": np.sqrt, "exp": np.exp, "ln": np.log, "lg": np.log10,
    "log": np.log, "log10": np.log10, "sin": np.sin, "cos": np.cos, "tan": np.tan,
    "arcsin": np.arcsin, "arccos": np.arccos, "arctan": np.arctan,
    "floor": np.floor, "ceil": np.ceil, "round": np.round, "sign": np.sign,
    "min": lambda *a: _rowfun(np.minimum, a), "max": lambda *a: _rowfun(np.maximum, a),
    "sum": lambda *a: _rowsum(a), "mean": lambda *a: _rowmean(a),
    "sd": lambda *a: _rowsd(a), "variance": lambda *a: _rowvar(a),
    "mod": np.mod, "trunc": np.trunc, "missing": lambda x: pd.isna(x),
    "notmissing": lambda x: ~pd.isna(x), "range": lambda *a: _rowrange(a),
    "sqrt2": np.sqrt, "any": lambda *a: _rowany(a), "all": lambda *a: _rowall(a),
    "sysmis": np.nan, "pi": math.pi,
    "if": lambda c, a, b: np.where(c, a, b),
    "_if": lambda c, a, b: np.where(c, a, b),
    "mod2": np.mod,
}


def _stack(args) -> np.ndarray:
    arrays = []
    for a in args:
        arr = np.asarray(a, dtype="float64")
        if arr.ndim == 0:
            arrays.append(np.full(1, float(arr)))
        else:
            arrays.append(arr)
    return np.vstack(arrays)


def _rowfun(fn, args):
    m = _stack(args)
    return fn.reduce(m, axis=0)


def _rowsum(args):
    return np.nansum(_stack(args), axis=0)


def _rowmean(args):
    return np.nanmean(_stack(args), axis=0)


def _rowsd(args):
    return np.nanstd(_stack(args), axis=0, ddof=1)


def _rowvar(args):
    return np.nanvar(_stack(args), axis=0, ddof=1)


def _rowrange(args):
    m = _stack(args)
    return np.nanmax(m, axis=0) - np.nanmin(m, axis=0)


def _rowany(args):
    m = _stack(args)
    return np.nanmax(m, axis=0) > 0


def _rowall(args):
    m = _stack(args)
    return np.nanmin(m, axis=0) > 0


def evaluate_expression(df: pd.DataFrame, expr: str) -> np.ndarray:
    """在受限命名空间中计算表达式。"""
    ns: Dict[str, Any] = dict(SAFE_FUNCS)
    for c in df.columns:
        ns[_sanitize(c)] = pd.to_numeric(df[c], errors="coerce").to_numpy(dtype="float64")
    env = {"__builtins__": {}, "np": np, "pd": pd, "ns": ns}
    expr_py = _translate(expr, list(df.columns))
    try:
        val = eval(expr_py, env, ns)  # noqa: S307 - 受限命名空间，本地工具
    except Exception as e:
        raise ValueError(f"表达式无法计算：{e}")
    arr = np.asarray(val, dtype="float64")
    if arr.ndim == 0:
        arr = np.full(len(df), float(arr))
    return arr


def _sanitize(name: str) -> str:
    out = []
    for ch in name:
        out.append(ch if (ch.isalnum() or ch == "_") else "_")
    s = "".join(out)
    if s and s[0].isdigit():
        s = "V_" + s
    return s


def _translate(expr: str, columns: List[str]) -> str:
    """把 SPSS 风格表达式转成 Python：变量名加引号、AND/OR/NOT 转小写运算符。"""
    import re
    out = expr
    # 逻辑运算符
    out = re.sub(r"\bAND\b", "&", out, flags=re.I)
    out = re.sub(r"\bOR\b", "|", out, flags=re.I)
    out = re.sub(r"\bNOT\b", "~", out, flags=re.I)
    out = out.replace("^", "**")
    out = re.sub(r"(?<![<>=!])<>", "!=", out)
    out = re.sub(r"(?<![<>=!])=(?!=)", "==", out)
    # if(...) 是 Python 关键字，转成 _if(...)
    out = re.sub(r"\bif\s*\(", "_if(", out, flags=re.I)
    # 变量名替换（按长度降序，避免前缀冲突）
    for c in sorted(columns, key=len, reverse=True):
        pat = r"(?<![\w.])" + re.escape(c) + r"(?![\w])"
        out = re.sub(pat, f"ns['{_sanitize(c)}']", out)
    return out


# ---------------- 计算变量 ----------------

def compute(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> (Dataset, List[Dict[str, Any]]):
    target = p.get("target") or ds.unique_name("VAR")
    expr = p.get("expression") or ""
    label = p.get("label") or ""
    dtype = p.get("type", NUMERIC)
    cond = p.get("condition")
    out = [title("计算变量")]

    arr = evaluate_expression(df, expr)
    if cond:
        mask = evaluate_expression(df, cond).astype(bool)
        base = np.full(len(df), np.nan)
        if p.get("conditionMode") == "if" and p.get("elseExpr"):
            else_arr = evaluate_expression(df, p["elseExpr"])
            base = np.where(mask, arr, else_arr)
            arr = base
        else:
            arr = np.where(mask, arr, np.nan)

    if dtype == STRING:
        values = [None if (isinstance(x, float) and math.isnan(x)) else str(x) for x in arr]
        var = Variable(target, STRING, align="left", measure="nominal", width=12, columns=12, label=label)
    else:
        values = [None if (isinstance(x, float) and math.isnan(x)) else float(x) for x in arr]
        var = Variable(target, NUMERIC, label=label)
        var.decimals = int(p.get("decimals", 2))

    existing = ds.var(target)
    if existing:
        j = ds.names.index(target)
        for i, row in enumerate(ds.records):
            row[j] = values[i] if i < len(values) else None
    else:
        ds.variables.append(var)
        for i, row in enumerate(ds.records):
            row.append(values[i] if i < len(values) else None)
    out.append(note(f"已创建/更新变量 {target}。"))
    return ds, out


# ---------------- 重新编码 ----------------

def recode(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> (Dataset, List[Dict[str, Any]]):
    source = p.get("source")
    target = p.get("target") or source
    rules = p.get("rules") or []
    else_mode = p.get("elseMode", "copy")
    else_value = p.get("elseValue")
    label = p.get("label") or ""
    out = [title("重新编码为不同变量")]

    s = pd.to_numeric(df[source], errors="coerce")
    result = pd.Series(np.nan, index=s.index, dtype="float64")
    for r in rules:
        rtype = r.get("type", "single")
        newv = r.get("value")
        newv = float(newv) if newv not in (None, "") else np.nan
        if rtype == "single":
            for f in r.get("from", []) if isinstance(r.get("from"), list) else [r.get("from")]:
                result = result.mask(s == float(f), newv)
        elif rtype == "range":
            lo, hi = float(r.get("from")), float(r.get("to"))
            result = result.mask((s >= lo) & (s <= hi), newv)
        elif rtype == "rangeLo":
            hi = float(r.get("to"))
            result = result.mask(s <= hi, newv)
        elif rtype == "rangeHi":
            lo = float(r.get("from"))
            result = result.mask(s >= lo, newv)
    if else_mode == "copy":
        result = result.where(result.notna(), s)
    elif else_mode == "value":
        result = result.fillna(float(else_value) if else_value not in (None, "") else np.nan)
    # else_mode == 'sysmis' -> 保持 NaN

    values = [None if (isinstance(x, float) and math.isnan(x)) else float(x) for x in result]
    var = Variable(target, NUMERIC, label=label or f"重新编码自 {source}")
    var.values = p.get("valueLabels") or {}
    if target == source:
        j = ds.names.index(source)
        for i, row in enumerate(ds.records):
            row[j] = values[i] if i < len(values) else None
    else:
        ds.variables.append(var)
        for i, row in enumerate(ds.records):
            row.append(values[i] if i < len(values) else None)
    out.append(note(f"已生成变量 {target}。"))
    return ds, out


def auto_recode(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> (Dataset, List[Dict[str, Any]]):
    """将字符串/分类变量自动编码为 1..k 的整数。"""
    source = p.get("source")
    target = p.get("target") or f"{source}_n"
    s = df[source]
    cats = list(pd.unique(s.dropna()))
    try:
        cats = sorted(cats)
    except TypeError:
        cats = [str(c) for c in cats]
    mapping = {c: i + 1 for i, c in enumerate(cats)}
    values = [mapping.get(v, None) for v in s]
    var = Variable(target, NUMERIC, label=f"自动编码自 {source}",
                   values={str(v): str(k) for k, v in mapping.items()})
    ds.variables.append(var)
    for i, row in enumerate(ds.records):
        row.append(values[i] if i < len(values) else None)
    return ds, [title("自动重新编码"), table("编码对照", [["原值", "新值"]],
                                          [[str(k), str(v)] for k, v in mapping.items()], row_header=1)]


# ---------------- 排序 ----------------

def sort_cases(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> (Dataset, List[Dict[str, Any]]):
    specs = p.get("variables") or []
    if not specs:
        return ds, [title("排序个案"), note("未指定排序变量。")]
    df2 = df.copy()
    names = [s["name"] for s in specs]
    asc = [s.get("order", "asc") == "asc" for s in specs]
    # 用临时索引保留原始顺序
    df2 = df2.reset_index(drop=True)
    order = pd.DataFrame({f"__k{i}": pd.to_numeric(df2[n], errors="coerce") if ds.var(n) and ds.var(n).dtype == NUMERIC
                          else df2[n].astype(str) for i, n in enumerate(names)})
    order["__idx"] = range(len(df2))
    order = order.sort_values(by=[f"__k{i}" for i in range(len(names))], ascending=asc,
                              kind="mergesort", na_position="last")
    idx = list(order["__idx"])
    ds.records = [ds.records[i] for i in idx]
    return ds, [title("排序个案"),
                note("已按 " + "、".join(f"{n}({'升序' if a else '降序'})" for n, a in zip(names, asc)) + " 排序。")]


# ---------------- 选择个案 ----------------

def select_cases(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> (Dataset, List[Dict[str, Any]]):
    mode = p.get("mode", "all")
    fname = "__filter_$"
    out = [title("选择个案")]
    if mode == "all":
        ds.filter_var = None
        if fname in ds.names:
            j = ds.names.index(fname)
            ds.variables.pop(j)
            for row in ds.records:
                row.pop(j)
        out.append(note("已选择全部个案。"))
        return ds, out

    if mode == "condition":
        expr = p.get("condition") or ""
        mask = evaluate_expression(df, expr).astype(bool)
    elif mode == "random":
        frac = float(p.get("fraction", 0.5))
        rng = np.random.default_rng(p.get("seed") or None)
        mask = rng.random(len(df)) < frac
    elif mode == "range":
        lo, hi = int(p.get("from", 1)), int(p.get("to", len(df)))
        mask = np.zeros(len(df), dtype=bool)
        mask[max(0, lo - 1): max(0, hi)] = True
    elif mode == "filter":
        base = p.get("filterVar")
        mask = pd.to_numeric(df[base], errors="coerce").fillna(0).to_numpy() != 0
    else:
        mask = np.ones(len(df), dtype=bool)

    # 把 filter 写回（原始行序）
    full = np.zeros(len(ds.records), dtype=bool)
    df_index = df.index.to_numpy() if hasattr(df.index, "to_numpy") else np.arange(len(df))
    for k, v in enumerate(mask):
        if k < len(full):
            full[k] = bool(v)
    vals = [1 if b else 0 for b in full]

    if fname in ds.names:
        j = ds.names.index(fname)
        for i, row in enumerate(ds.records):
            row[j] = vals[i]
    else:
        ds.variables.append(Variable(fname, NUMERIC, label="筛选状态", measure="nominal", columns=8))
        for i, row in enumerate(ds.records):
            row.append(vals[i])
    ds.filter_var = fname
    out.append(note(f"已筛选个案：{int(full.sum())} / {len(full)} 被选中。"))
    return ds, out


# ---------------- 拆分文件 ----------------

def split_file(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> (Dataset, List[Dict[str, Any]]):
    if p.get("off"):
        ds.split_var = None
        return ds, [title("拆分文件"), note("已关闭拆分。")]
    vars_ = p.get("variables") or []
    ds.split_var = vars_[0] if vars_ else None
    return ds, [title("拆分文件"), note("已按 " + "、".join(vars_) + " 拆分。" if vars_ else "未指定变量。")]


def weight_cases(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> (Dataset, List[Dict[str, Any]]):
    if p.get("off"):
        ds.weight_var = None
        return ds, [title("加权个案"), note("已关闭加权。")]
    ds.weight_var = p.get("variable")
    return ds, [title("加权个案"), note(f"已按 {ds.weight_var} 加权。")]


# ---------------- 汇总 ----------------

AGG_FUNCS = {
    "mean": lambda s: s.mean(), "sum": lambda s: s.sum(), "min": lambda s: s.min(),
    "max": lambda s: s.max(), "sd": lambda s: s.std(ddof=1), "var": lambda s: s.var(ddof=1),
    "n": lambda s: s.count(), "nmiss": lambda s: s.isna().sum(),
    "median": lambda s: s.median(), "first": lambda s: s.iloc[0] if len(s) else np.nan,
    "last": lambda s: s.iloc[-1] if len(s) else np.nan,
}


def aggregate(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> (Dataset, List[Dict[str, Any]]):
    breaks = p.get("breakVars") or []
    aggs = p.get("aggregates") or []
    to_new = p.get("toNew", True)
    out = [title("汇总数据")]
    if not aggs:
        return ds, out + [note("未指定汇总函数。")]

    rows = []
    if breaks:
        grouped = df.groupby(breaks, dropna=False, sort=True)
    else:
        grouped = [("总体", df)]
    for key, sub in (grouped if breaks else grouped):
        row = list(key) if isinstance(key, tuple) else [key]
        for a in aggs:
            col = a.get("var")
            fn = AGG_FUNCS.get(a.get("func", "mean"), AGG_FUNCS["mean"])
            s = pd.to_numeric(sub[col], errors="coerce") if ds.var(col) and ds.var(col).dtype == NUMERIC \
                else sub[col]
            try:
                row.append(fn(s))
            except Exception:
                row.append(np.nan)
        rows.append(row)

    new_vars = [ds.var(b) or Variable(b) for b in breaks]
    for a in aggs:
        v = Variable(a.get("name") or f"{a.get('var')}_{a.get('func')}", NUMERIC,
                     label=f"{a.get('func')}({a.get('var')})")
        new_vars.append(v)

    if to_new:
        nds = Dataset(name=p.get("name") or (ds.name + "_汇总"))
        nds.variables = new_vars
        nds.records = [[_clean(x) for x in r] for r in rows]
        from .store import STORE
        STORE.datasets[nds.id] = nds
        STORE.order.append(nds.id)
        out.append(note(f"已创建新数据集「{nds.name}」，共 {len(rows)} 行。"))
        out.append(table("汇总结果", [[v.label or v.name for v in new_vars]],
                         [_fmt(r) for r in nds.records], row_header=len(breaks)))
        return nds, out
    return ds, out + [note("未创建新数据集。")]


def _clean(x):
    if x is None:
        return None
    if isinstance(x, float) and math.isnan(x):
        return None
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, (np.floating,)):
        return float(x)
    if isinstance(x, (np.bool_,)):
        return bool(x)
    return x


def _fmt(r):
    return ["." if (isinstance(x, float) and math.isnan(x)) or x is None else str(x) for x in r]


# ---------------- 转置 ----------------

def transpose(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> (Dataset, List[Dict[str, Any]]):
    name_var = p.get("nameVar")
    if name_var and name_var in df.columns:
        t = df.set_index(name_var).T
        t.columns = [str(c) for c in t.columns]
    else:
        t = df.T
        t.columns = [f"V{i+1}" for i in range(t.shape[1])]
    t = t.reset_index().rename(columns={"index": "变量"})
    nds = Dataset(name=p.get("name") or (ds.name + "_转置"))
    nds.replace_from_dataframe(t, keep_meta=False)
    from .store import STORE
    STORE.datasets[nds.id] = nds
    STORE.order.append(nds.id)
    return nds, [title("转置"), note(f"已创建转置数据集「{nds.name}」：{nds.n_cases} 行 × {len(nds.variables)} 列。")]


# ---------------- 定义变量属性（快捷） ----------------

def define_var(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> (Dataset, List[Dict[str, Any]]):
    name = p.get("name")
    var = ds.var(name)
    if not var:
        return ds, [title("定义变量"), note("变量不存在。")]
    for key in ("label", "measure", "decimals", "columns", "align", "width", "role"):
        if key in p and p[key] is not None:
            setattr(var, key, p[key])
    if "values" in p and p["values"] is not None:
        var.values = p["values"]
    if "missing" in p and p["missing"] is not None:
        var.missing = p["missing"]
    return ds, [title("定义变量"), note(f"已更新变量 {name} 的属性。")]


TRANSFORMS = {
    "compute": compute,
    "recode": recode,
    "auto_recode": auto_recode,
    "sort": sort_cases,
    "select": select_cases,
    "split": split_file,
    "weight": weight_cases,
    "aggregate": aggregate,
    "transpose": transpose,
    "define": define_var,
}
