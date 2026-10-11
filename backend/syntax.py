"""SPSS 语法解析与执行（常用命令子集）。"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from . import procedures as P
from . import transforms as T
from .output import note, table, text_block, title
from .store import NUMERIC, STRING, STORE, Dataset, Variable


# 本引擎已实现的命令，取值是 SPSS 命令定义（syntax_xml/*.xml）里的 `Command/@Name`。
# 供 backend/syntaxref.py 在「语法参考」里标注「已实现 / 仅参考定义」。
SUPPORTED = {
    "FREQUENCIES", "DESCRIPTIVES", "CROSSTABS", "MEANS", "EXAMINE",
    "T-TEST", "ONEWAY", "CORRELATIONS", "NPAR TESTS", "REGRESSION",
    "LOGISTIC REGRESSION", "FACTOR", "RELIABILITY",
    "COMPUTE", "RECODE", "SORT CASES", "SELECT IF", "FILTER", "USE",
    "SPLIT FILE", "WEIGHT", "AGGREGATE",
    "VARIABLE LABELS", "VARIABLE LEVEL", "VALUE LABELS", "MISSING VALUES",
    "GRAPH", "LIST",
}


# ---------------- 词法 ----------------

def split_commands(text: str) -> List[str]:
    """按 SPSS 规则切分命令：命令以行尾的句点结束。"""
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    cmds, buf = [], []
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        if line.startswith("*") or line.upper().startswith("COMMENT"):
            # 注释直到句点
            if line.endswith("."):
                continue
            buf = []
            continue
        buf.append(line)
        joined = " ".join(buf)
        if _ends_command(joined):
            cmds.append(joined)
            buf = []
    if buf:
        cmds.append(" ".join(buf))
    return cmds


def _ends_command(s: str) -> bool:
    s = s.rstrip()
    if not s.endswith("."):
        return False
    # 排除小数结尾：如 0.5.
    return True


def split_subcommands(cmd: str) -> List[str]:
    return [p.strip() for p in re.split(r"/", cmd) if p.strip()]


def parse_kv(sub: str) -> (Optional[str], str):
    m = re.match(r"^([A-Za-z][A-Za-z0-9_ ]*?)\s*=\s*(.*)$", sub, flags=re.S)
    if m:
        return m.group(1).strip().upper(), m.group(2).strip()
    return None, sub


def tokenize(s: str) -> List[str]:
    return re.findall(r"'[^']*'|\"[^\"]*\"|[^\s]+", s)


def unquote(t: str) -> str:
    if len(t) >= 2 and t[0] == t[-1] and t[0] in "'\"":
        return t[1:-1]
    return t


def expand_vars(tokens: List[str], ds: Dataset) -> List[str]:
    """展开 `v1 TO v5` 形式并过滤注释。"""
    out: List[str] = []
    toks = [t for t in tokens if t.upper() not in ("WITH", "BY", "ALL")]
    i = 0
    names = ds.names
    while i < len(toks):
        t = toks[i]
        if t.upper() == "TO" and out and i + 1 < len(toks):
            a, b = out[-1], toks[i + 1]
            if a in names and b in names:
                ia, ib = names.index(a), names.index(b)
                lo, hi = min(ia, ib), max(ia, ib)
                out.extend(names[lo:hi + 1])
            i += 2
            continue
        out.append(t)
        i += 1
    seen, res = set(), []
    for v in out:
        if v in names and v not in seen:
            seen.add(v)
            res.append(v)
    return res


def find_vars(tokens: List[str], ds: Dataset) -> List[str]:
    return [t for t in tokens if t in ds.names]


# ---------------- 执行 ----------------

def run_syntax(text: str, ds: Dataset) -> Tuple[Dataset, List[Dict[str, Any]]]:
    blocks: List[Dict[str, Any]] = []
    current = ds
    cmds = split_commands(text)
    if not cmds:
        return ds, [note("没有可执行的命令。")]
    for raw in cmds:
        try:
            current, b = _exec_command(raw, current)
            blocks.extend(b)
        except Exception as e:  # 单条命令失败不影响其他
            blocks.append(note(f"命令执行失败：{raw[:80]}... → {e}"))
    return current, blocks


def _exec_command(cmd: str, ds: Dataset) -> (Dataset, List[Dict[str, Any]]):
    body = cmd.strip()
    if body.endswith("."):
        body = body[:-1]
    m = re.match(r"^([A-Za-z][A-Za-z0-9]*)", body)
    if not m:
        return ds, []
    name = m.group(1).upper()
    rest = body[m.end():].strip()
    subs = split_subcommands(rest) if rest else []
    pos = rest

    df = ds.to_dataframe()

    # ---- 频率
    if name in ("FREQUENCIES", "FREQ"):
        params = _collect(subs, pos)
        variables = expand_vars(params.get("VARIABLES", []), ds)
        stat = {}
        for k in params.get("STATISTICS", []):
            ku = k.upper()
            stat[{"MEAN": "mean", "MEDIAN": "median", "MODE": "mode", "STDDEV": "std",
                  "VARIANCE": "variance", "RANGE": "range", "MINIMUM": "min", "MAXIMUM": "max",
                  "SUM": "sum", "SEMEAN": "seMean", "SKEWNESS": "skew", "KURTOSIS": "kurt"}.get(ku, "")] = True
        charts = {}
        for key in params:
            if key and "BAR" in key:
                charts["bar"] = True
            if key and "PIE" in key:
                charts["pie"] = True
            if key and "HIST" in key:
                charts["histogram"] = True
        for k in params.get(None, []):
            ku = k.upper()
            if "BARCHART" in ku:
                charts["bar"] = True
            if "PIECHART" in ku:
                charts["pie"] = True
            if "HISTOGRAM" in ku:
                charts["histogram"] = True
        return ds, P.frequencies(df, ds, {"variables": variables, "statistics": stat, "charts": charts})

    # ---- 描述
    if name in ("DESCRIPTIVES", "DESC"):
        params = _collect(subs, pos)
        variables = expand_vars(params.get("VARIABLES", []), ds)
        opts = {"mean": True, "std": True}
        for k in params.get("STATISTICS", []):
            ku = k.upper()
            if ku == "MEAN": opts["mean"] = True
            if ku in ("STDDEV",): opts["std"] = True
            if ku == "VARIANCE": opts["variance"] = True
            if ku == "RANGE": opts["range"] = True
            if ku == "MINIMUM": opts["min"] = True
            if ku == "MAXIMUM": opts["max"] = True
            if ku == "SUM": opts["sum"] = True
            if ku == "SEMEAN": opts["seMean"] = True
            if ku == "SKEWNESS": opts["skew"] = True
            if ku == "KURTOSIS": opts["kurt"] = True
        return ds, P.descriptives(df, ds, {"variables": variables, "options": opts})

    # ---- 交叉表
    if name in ("CROSSTABS", "CROSSTAB"):
        params = _collect(subs, pos)
        tables = params.get("TABLES", [])
        rows, cols = [], []
        txt = " ".join(tables)
        if " BY " in txt.upper():
            idx = txt.upper().index(" BY ")
            rows = find_vars(tokenize(txt[:idx]), ds)
            cols = find_vars(tokenize(txt[idx + 4:]), ds)
        stat = {}
        for k in params.get("STATISTICS", []):
            ku = k.upper()
            if ku in ("CHISQ", "CHI2"): stat["chi2"] = True
            if ku == "PHI": stat["phi"] = True
            if ku == "ALL": stat.update({"chi2": True, "phi": True})
        cells = {}
        for c in params.get("CELLS", []):
            cu = c.upper()
            if cu in ("COUNT", "OBSERVED"): cells["observed"] = True
            if cu == "EXPECTED": cells["expected"] = True
            if cu in ("ROW", "ROWPERCENT"): cells["rowPct"] = True
            if cu in ("COLUMN", "COLPCT"): cells["colPct"] = True
            if cu == "TOTAL": cells["totalPct"] = True
        if not cells:
            cells = {"observed": True}
        return ds, P.crosstabs(df, ds, {"rows": rows, "cols": cols, "statistics": stat, "cells": cells})

    # ---- 均值
    if name == "MEANS":
        params = _collect(subs, pos)
        tables = " ".join(params.get("TABLES", []))
        deps, inds = [], []
        if " BY " in tables.upper():
            i = tables.upper().index(" BY ")
            deps = find_vars(tokenize(tables[:i]), ds)
            inds = find_vars(tokenize(tables[i + 4:]), ds)
        else:
            deps = find_vars(tokenize(tables), ds)
        return ds, P.means(df, ds, {"dependents": deps, "independents": inds})

    # ---- 探索
    if name == "EXAMINE":
        params = _collect(subs, pos)
        vtxt = " ".join(params.get("VARIABLES", []))
        deps, facs = [], []
        if " BY " in vtxt.upper():
            i = vtxt.upper().index(" BY ")
            deps = find_vars(tokenize(vtxt[:i]), ds)
            facs = find_vars(tokenize(vtxt[i + 4:]), ds)
        else:
            deps = find_vars(tokenize(vtxt), ds)
        plots = {}
        ptxt = " ".join(params.get("PLOT", [])).upper()
        plots["boxplot"] = "BOXPLOT" in ptxt or not ptxt
        plots["histogram"] = "HISTOGRAM" in ptxt or not ptxt
        plots["normality"] = "NPPLOT" in ptxt or "QQ" in ptxt
        return ds, P.explore(df, ds, {"dependents": deps, "factors": facs, "plots": plots})

    # ---- T 检验
    if name in ("T-TEST", "TTEST"):
        params = _collect(subs, pos)
        if "PAIRS" in params:
            ptxt = " ".join(params["PAIRS"])
            pairs = []
            toks = [t for t in tokenize(ptxt) if t.upper() not in ("PAIRED", "WITH")]
            left, right = [], []
            if "WITH" in [t.upper() for t in tokenize(ptxt)]:
                idx = [t.upper() for t in tokenize(ptxt)].index("WITH")
                left = find_vars(tokenize(ptxt)[:idx], ds)
                right = find_vars(tokenize(ptxt)[idx + 1:], ds)
                pairs = [[a, b] for a, b in zip(left, right)]
            return ds, P.ttest_paired(df, ds, {"pairs": pairs})
        if "GROUPS" in params:
            gtxt = " ".join(params["GROUPS"])
            gm = re.match(r"([A-Za-z_][\w]*)\s*\(([^)]*)\)", gtxt)
            gname, gvals = None, []
            if gm:
                gname = gm.group(1)
                gvals = [float(x) if _isnum(x) else x for x in gm.group(2).split()]
            tvars = expand_vars(params.get("VARIABLES", []), ds)
            return ds, P.ttest_ind(df, ds, {"testVars": tvars, "groupVar": gname, "groupValues": gvals})
        tv = 0.0
        if "TESTVAL" in params:
            try:
                tv = float(" ".join(params["TESTVAL"]))
            except ValueError:
                pass
        tvars = expand_vars(params.get("VARIABLES", []), ds)
        return ds, P.ttest_one(df, ds, {"variables": tvars, "testValue": tv})

    # ---- 单因素方差分析
    if name == "ONEWAY":
        m2 = re.match(r"^([A-Za-z_][\w]*)\s+BY\s+([A-Za-z_][\w]*)", pos, flags=re.I)
        params = _collect(subs, pos)
        dep = fac = None
        if m2:
            dep, fac = m2.group(1), m2.group(2)
        return ds, P.anova_oneway(df, ds, {
            "dependent": dep, "factor": fac,
            "descriptives": True,
            "homogeneity": "HOMOGENEITY" in " ".join(params.get("STATISTICS", [])).upper() or True,
            "posthoc": bool(params.get("POSTHOC")),
        })

    # ---- 相关
    if name in ("CORRELATIONS", "CORR"):
        params = _collect(subs, pos)
        variables = expand_vars(params.get("VARIABLES", []), ds)
        return ds, P.correlation(df, ds, {"variables": variables, "method": "pearson", "matrix": True})

    if name in ("NONPAR", "NPAR"):
        params = _collect(subs, pos)
        allkeys = " ".join(k or "" for k in params.keys()).upper()
        variables = expand_vars(params.get("VARIABLES", []), ds)
        if "CHISQUARE" in allkeys or "CHISQ" in allkeys:
            return ds, P.nonparam(df, ds, {"kind": "chisquare", "variable": variables[0] if variables else None})
        if "BINOMIAL" in allkeys:
            return ds, P.nonparam(df, ds, {"kind": "binomial", "variable": variables[0] if variables else None})
        if "RUNS" in allkeys:
            return ds, P.nonparam(df, ds, {"kind": "runs", "variable": variables[0] if variables else None})
        if "KRUSKAL" in allkeys:
            return ds, P.nonparam(df, ds, {"kind": "kruskal", "variable": variables[0] if variables else None,
                                           "factor": variables[1] if len(variables) > 1 else None})
        if "MANN" in allkeys or "M-W" in allkeys:
            return ds, P.nonparam(df, ds, {"kind": "mannwhitney", "variable": variables[0] if variables else None})
        return ds, P.nonparam(df, ds, {"kind": "chisquare", "variable": variables[0] if variables else None})

    # ---- 线性回归
    if name == "REGRESSION":
        params = _collect(subs, pos)
        dep = None
        if "DEPENDENT" in params:
            dep = find_vars(params["DEPENDENT"], ds)
            dep = dep[0] if dep else None
        inds = []
        for key in ("METHOD", "ENTER"):
            if key in params:
                inds = find_vars(params[key], ds)
        if not inds and None in params:
            inds = find_vars(params[None], ds)
        return ds, P.regression_linear(df, ds, {"dependent": dep, "independents": inds})

    if name == "LOGISTIC":
        params = _collect(subs, pos)
        vtxt = " ".join(params.get("VARIABLES", []))
        dep, inds = None, []
        if " WITH " in vtxt.upper():
            i = vtxt.upper().index(" WITH ")
            d = find_vars(tokenize(vtxt[:i]), ds)
            dep = d[0] if d else None
            inds = find_vars(tokenize(vtxt[i + 6:]), ds)
        for key in ("METHOD", "ENTER"):
            if key in params and not inds:
                inds = find_vars(params[key], ds)
        return ds, P.regression_logistic(df, ds, {"dependent": dep, "independents": inds})

    # ---- 因子分析
    if name == "FACTOR":
        params = _collect(subs, pos)
        variables = expand_vars(params.get("VARIABLES", []), ds)
        rotation = "varimax" if "VARIMAX" in " ".join(params.get("ROTATION", [])).upper() else "none"
        return ds, P.factor_analysis(df, ds, {"variables": variables, "rotation": rotation})

    # ---- 信度
    if name == "RELIABILITY":
        params = _collect(subs, pos)
        variables = expand_vars(params.get("VARIABLES", []), ds)
        return ds, P.reliability(df, ds, {"items": variables})

    # ---- 计算变量
    if name == "COMPUTE":
        m3 = re.match(r"^([A-Za-z_][\w]*)\s*=\s*(.+)$", pos, flags=re.S)
        if not m3:
            return ds, [note("COMPUTE 语法错误。")]
        target, expr = m3.group(1), m3.group(2)
        cond = None
        mm = re.search(r"IF\s*\((.+)\)\s*$", expr, flags=re.I | re.S)
        if mm:
            expr = expr[: mm.start()].strip()
            cond = mm.group(1)
        nds, b = T.compute(df, ds, {"target": target, "expression": expr, "condition": cond})
        return nds, b

    # ---- 重新编码
    if name == "RECODE":
        return _do_recode(pos, ds)

    # ---- 排序
    if name == "SORT":
        m4 = re.search(r"BY\s+(.+)$", pos, flags=re.I | re.S)
        specs = []
        if m4:
            txt = m4.group(1)
            for vm in re.finditer(r"([A-Za-z_][\w]*)(\s*\((A|D)\))?", txt, flags=re.I):
                nm = vm.group(1)
                if nm in ds.names:
                    specs.append({"name": nm, "order": "desc" if (vm.group(3) or "").upper() == "D" else "asc"})
        nds, b = T.sort_cases(df, ds, {"variables": specs})
        return nds, b

    # ---- 选择个案
    if name == "SELECT":
        if pos.upper().startswith("IF"):
            cond = pos[2:].strip()
            cond = cond.strip("()")
            nds, b = T.select_cases(df, ds, {"mode": "condition", "condition": cond})
            return nds, b
        if "ALL" in pos.upper():
            return T.select_cases(df, ds, {"mode": "all"})

    if name == "FILTER":
        if "OFF" in pos.upper():
            return T.select_cases(df, ds, {"mode": "all"})

    if name == "USE":
        return T.select_cases(df, ds, {"mode": "all"})

    # ---- 拆分文件
    if name == "SPLIT":
        if "OFF" in pos.upper():
            return T.split_file(df, ds, {"off": True})
        m5 = re.search(r"BY\s+(.+)$", pos, flags=re.I | re.S)
        vs = find_vars(tokenize(m5.group(1)), ds) if m5 else []
        return T.split_file(df, ds, {"variables": vs})

    # ---- 加权
    if name == "WEIGHT":
        if "OFF" in pos.upper():
            return T.weight_cases(df, ds, {"off": True})
        m6 = re.search(r"BY\s+([A-Za-z_][\w]*)", pos, flags=re.I)
        return T.weight_cases(df, ds, {"variable": m6.group(1) if m6 else None})

    # ---- 汇总
    if name == "AGGREGATE":
        params = _collect(subs, pos)
        breaks = find_vars(params.get("BREAK", []), ds)
        aggs = []
        for key, val in params.items():
            if key in ("BREAK", "OUTFILE", "MODE", "VARIABLES", None):
                continue
            fn = val.split()[0].upper() if val else "MEAN"
            m7 = re.search(r"\(([^)]*)\)", val or "")
            src = find_vars(tokenize(m7.group(1)), ds) if m7 else []
            aggs.append({"var": src[0] if src else None, "func": fn.lower(), "name": key})
        return T.aggregate(df, ds, {"breakVars": breaks, "aggregates": aggs, "toNew": True})

    # ---- 变量标签
    if name == "VARIABLE":
        blocks = []
        for sub in subs:
            if sub.upper().startswith("LABELS"):
                txt = sub[6:].strip()
                for vm in re.finditer(r"([A-Za-z_][\w]*)\s+'([^']*)'", txt):
                    v = ds.var(vm.group(1))
                    if v:
                        v.label = vm.group(2)
                        blocks.append(note(f"变量 {vm.group(1)} 标签设为「{vm.group(2)}」"))
            if sub.upper().startswith("LEVEL"):
                txt = sub[5:].strip()
                for vm in re.finditer(r"([A-Za-z_][\w]*)\s*\((NOMINAL|ORDINAL|SCALE)\)", txt, flags=re.I):
                    v = ds.var(vm.group(1))
                    if v:
                        v.measure = vm.group(2).lower()
        return ds, blocks or [note("已更新变量属性。")]

    if name == "VALUE":
        blocks = []
        for sub in subs:
            if sub.upper().startswith("LABELS"):
                txt = sub[6:].strip()
                first = re.match(r"^([A-Za-z_][\w]*)", txt)
                if first:
                    v = ds.var(first.group(1))
                    if v:
                        rest = txt[first.end():]
                        for vm in re.finditer(r"(\S+)\s+'([^']*)'", rest):
                            v.values[str(_num_or_str(vm.group(1)))] = vm.group(2)
                        blocks.append(note(f"已为 {first.group(1)} 设置值标签。"))
        return ds, blocks or [note("已更新值标签。")]

    if name == "MISSING":
        blocks = []
        for sub in subs:
            if sub.upper().startswith("VALUES"):
                txt = sub[6:].strip()
                for vm in re.finditer(r"([A-Za-z_][\w]*)\s*\(([^)]*)\)", txt):
                    v = ds.var(vm.group(1))
                    if v:
                        vals = [_num_or_str(x) for x in vm.group(2).split()]
                        v.missing = {"discrete": vals}
                        blocks.append(note(f"{vm.group(1)} 缺失值设为 {vals}"))
        return ds, blocks or [note("已更新缺失值。")]

    # ---- 图形
    if name in ("GRAPH", "CHART"):
        params = _collect(subs, pos)
        txt = " ".join(f"{k}={v}" if k else v for k, v in params.items()).upper()
        variables = find_vars(tokenize(rest), ds)
        if "PIE" in txt:
            return ds, P.chart_proc(df, ds, {"kind": "pie", "variable": variables[0] if variables else None})
        if "HIST" in txt:
            return ds, P.chart_proc(df, ds, {"kind": "histogram", "variable": variables[0] if variables else None})
        if "SCATTER" in txt or "POINT" in txt:
            return ds, P.chart_proc(df, ds, {"kind": "scatter", "x": variables[0] if variables else None,
                                             "y": variables[1] if len(variables) > 1 else None})
        if "BOX" in txt:
            return ds, P.chart_proc(df, ds, {"kind": "box", "variable": variables[0] if variables else None})
        if "LINE" in txt:
            return ds, P.chart_proc(df, ds, {"kind": "line", "x": variables[0] if variables else None,
                                             "y": variables[1] if len(variables) > 1 else None})
        return ds, P.chart_proc(df, ds, {"kind": "bar", "variable": variables[0] if variables else None})

    if name == "LIST":
        variables = expand_vars(tokenize(rest.replace("VARIABLES=", "")), ds) or ds.names[:10]
        sub = df[variables].head(50)
        return ds, [title("个案列表"),
                    table("数据列表", [variables], [[str(x) for x in row] for row in sub.itertuples(index=False, name=None)])]

    return ds, [note(f"暂不支持的命令：{name}（已忽略）")]


def _num_or_str(t: str) -> Any:
    t = unquote(t)
    try:
        return float(t)
    except ValueError:
        return t


def _isnum(t: str) -> bool:
    try:
        float(t)
        return True
    except ValueError:
        return False


def _do_recode(pos: str, ds: Dataset) -> (Dataset, List[Dict[str, Any]]):
    m = re.match(r"^(.+?)(\s+INTO\s+([A-Za-z_][\w]*))?\s*$", pos, flags=re.I | re.S)
    target = None
    body = pos
    mi = re.search(r"\s+INTO\s+([A-Za-z_][\w]*)", pos, flags=re.I)
    if mi:
        target = mi.group(1)
        body = pos[: mi.start()].strip()
    src = body.split()[0] if body.split() else None
    rules = []
    else_mode = "copy"
    else_value = None
    for gm in re.finditer(r"\(([^)]*)\)", body):
        inner = gm.group(1).strip()
        if "=" not in inner:
            continue
        left, right = [x.strip() for x in inner.split("=", 1)]
        right_up = right.upper()
        if right_up in ("COPY",):
            else_mode = "copy"
            continue
        if right_up in ("SYSMIS", "MISSING"):
            else_mode = "sysmis"
            continue
        try:
            newv = float(right)
        except ValueError:
            newv = right
        if left.upper() == "ELSE":
            else_mode = "value"
            else_value = newv
            continue
        if left.upper().startswith("LO"):
            lo = re.sub(r"^LO\s*", "", left, flags=re.I).strip()
            try:
                rules.append({"type": "rangeLo", "to": float(lo), "value": newv})
            except ValueError:
                pass
        elif left.upper().startswith("HI"):
            hi = re.sub(r"^HI\s*", "", left, flags=re.I).strip()
            try:
                rules.append({"type": "rangeHi", "from": float(hi), "value": newv})
            except ValueError:
                pass
        elif "THRU" in left.upper():
            parts = re.split(r"\s+THRU\s+", left, flags=re.I)
            try:
                rules.append({"type": "range", "from": float(parts[0]), "to": float(parts[1]), "value": newv})
            except (ValueError, IndexError):
                pass
        else:
            vals = [x for x in left.split() if _isnum(x)]
            if vals:
                rules.append({"type": "single", "from": [float(v) for v in vals], "value": newv})
    df = ds.to_dataframe()
    return T.recode(df, ds, {"source": src, "target": target or src, "rules": rules,
                             "elseMode": else_mode, "elseValue": else_value})


def _collect(subs: List[str], pos: str) -> Dict[Optional[str], List[str]]:
    """把子命令解析为 {KEY: [tokens]}；无键的放入 None。"""
    out: Dict[Optional[str], List[str]] = {}
    for sub in subs:
        key, val = parse_kv(sub)
        toks = tokenize(val)
        if key:
            out.setdefault(key, []).extend(toks)
        else:
            out.setdefault(None, []).extend(toks)
    return out
