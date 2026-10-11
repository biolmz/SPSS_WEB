"""输出块构造工具 + 通用统计辅助函数。"""
from __future__ import annotations

import math
from typing import Any, Dict, Iterable, List, Optional

import numpy as np
import pandas as pd

from .store import Variable, fmt_num


# ---------------- 输出块 ----------------

def title(text: str, level: int = 1) -> Dict[str, Any]:
    return {"type": "title", "text": text, "level": level}


def subtitle(text: str) -> Dict[str, Any]:
    return {"type": "subtitle", "text": text}


def text_block(text: str) -> Dict[str, Any]:
    return {"type": "text", "text": text}


def note(text: str) -> Dict[str, Any]:
    return {"type": "note", "text": text}


def table(
    ttl: str,
    header: List[List[Any]],
    rows: List[List[Any]],
    row_header: int = 0,
    notes: Optional[List[str]] = None,
    subtitle_text: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "type": "table",
        "title": ttl,
        "subtitle": subtitle_text,
        "header": header,
        "rows": rows,
        "rowHeader": row_header,
        "notes": notes or [],
    }


def chart(c_type: str, spec: Dict[str, Any], ttl: str = "") -> Dict[str, Any]:
    spec = dict(spec)
    spec.setdefault("type", c_type)
    return {"type": "chart", "title": ttl, "spec": spec}


def num(x: Any, d: int = 2) -> str:
    return fmt_num(x, d)


def pval(p: Any) -> str:
    if p is None:
        return "."
    try:
        f = float(p)
    except (TypeError, ValueError):
        return "."
    if math.isnan(f):
        return "."
    if f < 0.001:
        return ".000"
    return f"{f:.3f}"


# ---------------- 数据辅助 ----------------

def clean_numeric(df: pd.DataFrame, name: str) -> pd.Series:
    if name not in df.columns:
        return pd.Series(dtype="float64")
    return pd.to_numeric(df[name], errors="coerce")


def paired_clean(df: pd.DataFrame, a: str, b: str) -> (pd.Series, pd.Series):
    x = clean_numeric(df, a)
    y = clean_numeric(df, b)
    m = x.notna() & y.notna()
    return x[m], y[m]


def label_of(var: Optional[Variable], name: str) -> str:
    if var and var.label:
        return var.label
    return name


def value_label(var: Optional[Variable], v: Any) -> str:
    if var is None:
        return str(v)
    key = None
    for k in var.values:
        try:
            if abs(float(k) - float(v)) < 1e-9:
                key = k
                break
        except (TypeError, ValueError):
            if str(k) == str(v):
                key = k
                break
    if key is not None:
        return var.values[key]
    return str(v)


def group_labels(var: Optional[Variable], values: Iterable[Any]) -> Dict[Any, str]:
    return {v: value_label(var, v) for v in values}


def describe_series(s: pd.Series) -> Dict[str, float]:
    s = pd.to_numeric(s, errors="coerce").dropna()
    n = len(s)
    if n == 0:
        return {}
    out = {
        "N": n,
        "Mean": float(s.mean()),
        "SEMean": float(s.sem()) if n > 1 else np.nan,
        "Median": float(s.median()),
        "StdDev": float(s.std(ddof=1)) if n > 1 else np.nan,
        "Variance": float(s.var(ddof=1)) if n > 1 else np.nan,
        "Range": float(s.max() - s.min()),
        "Minimum": float(s.min()),
        "Maximum": float(s.max()),
        "Sum": float(s.sum()),
        "Skewness": float(s.skew()) if n > 2 else np.nan,
        "Kurtosis": float(s.kurt()) if n > 3 else np.nan,
    }
    return out


def std_error_skew(s: pd.Series) -> float:
    s = pd.to_numeric(s, errors="coerce").dropna()
    n = len(s)
    if n < 3:
        return np.nan
    skew = float(s.skew())
    return math.sqrt(6.0 * n * (n - 1) / ((n - 2) * (n + 1) * (n + 3)))


def std_error_kurt(s: pd.Series) -> float:
    s = pd.to_numeric(s, errors="coerce").dropna()
    n = len(s)
    if n < 4:
        return np.nan
    return 2.0 * math.sqrt(6.0 * (n * n - 5 * n + 2) / ((n - 7) * (n - 9) * (n - 11))) if n > 11 else np.nan


def quartiles(s: pd.Series) -> Dict[str, float]:
    s = pd.to_numeric(s, errors="coerce").dropna()
    if len(s) == 0:
        return {}
    return {
        "p5": float(s.quantile(0.05)),
        "p10": float(s.quantile(0.10)),
        "q1": float(s.quantile(0.25)),
        "q2": float(s.quantile(0.50)),
        "q3": float(s.quantile(0.75)),
        "p90": float(s.quantile(0.90)),
        "p95": float(s.quantile(0.95)),
        "iqr": float(s.quantile(0.75) - s.quantile(0.25)),
    }


def histogram_spec(s: pd.Series, name: str, bins: int = 10) -> Dict[str, Any]:
    s = pd.to_numeric(s, errors="coerce").dropna()
    if len(s) == 0:
        return {}
    counts, edges = np.histogram(s.to_numpy(), bins=min(bins, max(3, int(math.sqrt(len(s))) + 1)))
    items = []
    for i, c in enumerate(counts):
        items.append({"label": f"{edges[i]:.2f}", "value": int(c),
                      "lo": float(edges[i]), "hi": float(edges[i + 1])})
    return {"type": "histogram", "title": f"直方图 – {name}", "series": items,
            "xLabel": name, "yLabel": "频率", "mean": float(s.mean()), "std": float(s.std(ddof=1)) if len(s) > 1 else 0}


def label_lookup(labels: Optional[Dict[Any, str]], k: Any) -> Optional[str]:
    """容忍键类型不一致（1 vs '1' vs 1.0）的值标签查找。"""
    if not labels:
        return None
    if k in labels:
        return labels[k]
    s = str(k)
    if s in labels:
        return labels[s]
    try:
        f = float(k)
        if f.is_integer() and str(int(f)) in labels:
            return labels[str(int(f))]
    except (TypeError, ValueError):
        pass
    for key in labels:
        try:
            if abs(float(key) - float(k)) < 1e-9:
                return labels[key]
        except (TypeError, ValueError):
            continue
    return None


def bar_spec(counts: pd.Series, name: str, labels: Optional[Dict[Any, str]] = None) -> Dict[str, Any]:
    items = []
    for k, v in counts.items():
        lab = label_lookup(labels, k) or str(k)
        items.append({"label": lab, "value": int(v)})
    return {"type": "bar", "title": f"条形图 – {name}", "series": items,
            "xLabel": name, "yLabel": "频率"}


def pie_spec(counts: pd.Series, name: str, labels: Optional[Dict[Any, str]] = None) -> Dict[str, Any]:
    items = []
    for k, v in counts.items():
        lab = label_lookup(labels, k) or str(k)
        items.append({"label": lab, "value": int(v)})
    return {"type": "pie", "title": f"饼图 – {name}", "series": items}


def box_spec(groups: Dict[str, pd.Series], y_label: str = "") -> Dict[str, Any]:
    data = []
    for gname, s in groups.items():
        s = pd.to_numeric(s, errors="coerce").dropna()
        if len(s) == 0:
            continue
        q1, q2, q3 = s.quantile(0.25), s.quantile(0.5), s.quantile(0.75)
        iqr = q3 - q1
        lo = s[s >= q1 - 1.5 * iqr].min()
        hi = s[s <= q3 + 1.5 * iqr].max()
        data.append({
            "label": gname, "min": float(lo), "q1": float(q1), "median": float(q2),
            "q3": float(q3), "max": float(hi),
            "outliers": [float(x) for x in s[(s < lo) | (s > hi)]][:50],
        })
    return {"type": "box", "title": "箱线图", "series": data, "yLabel": y_label}


def scatter_spec(x: pd.Series, y: pd.Series, xlab: str, ylab: str,
                 fit: bool = True, groups: Optional[pd.Series] = None,
                 group_labels_map: Optional[Dict[Any, str]] = None) -> Dict[str, Any]:
    m = x.notna() & y.notna()
    pts = [[float(a), float(b)] for a, b in zip(x[m], y[m])]
    spec: Dict[str, Any] = {"type": "scatter", "title": f"散点图 {xlab} × {ylab}",
                            "points": pts, "xLabel": xlab, "yLabel": ylab}
    if fit and len(pts) >= 2:
        xs = np.array([p[0] for p in pts])
        ys = np.array([p[1] for p in pts])
        try:
            b1, b0 = np.polyfit(xs, ys, 1)
            x0, x1 = float(xs.min()), float(xs.max())
            spec["fit"] = [[x0, float(b0 + b1 * x0)], [x1, float(b0 + b1 * x1)]]
        except Exception:
            pass
    if groups is not None:
        gm = m & groups.notna()
        cats = list(pd.unique(groups[gm]))
        series = []
        for c in cats:
            sel = gm & (groups == c)
            lab = group_labels_map.get(c, str(c)) if group_labels_map else str(c)
            series.append({"name": lab,
                           "points": [[float(a), float(b)] for a, b in zip(x[sel], y[sel])]})
        spec["groups"] = series
        spec.pop("points", None)
    return spec


def qq_spec(s: pd.Series, name: str) -> Dict[str, Any]:
    s = pd.to_numeric(s, errors="coerce").dropna().sort_values()
    n = len(s)
    if n < 3:
        return {}
    from scipy import stats as st
    probs = (np.arange(1, n + 1) - 0.375) / (n + 0.25)
    theo = st.norm.ppf(probs)
    mean, sd = float(s.mean()), float(s.std(ddof=1))
    theo_scaled = theo * sd + mean
    pts = [[float(t), float(o)] for t, o in zip(theo_scaled, s)]
    lo = min(min(p) for p in zip(*pts)) if pts else 0
    hi = max(max(p) for p in zip(*pts)) if pts else 1
    return {"type": "qq", "title": f"正态 Q-Q 图 – {name}", "points": pts,
            "line": [[lo, lo], [hi, hi]], "xLabel": "观测值", "yLabel": "期望正态值"}


def errorbar_spec(groups: Dict[str, pd.Series], y_label: str = "均值") -> Dict[str, Any]:
    items = []
    for gname, s in groups.items():
        s = pd.to_numeric(s, errors="coerce").dropna()
        if len(s) == 0:
            continue
        m = float(s.mean())
        ci = 1.96 * float(s.std(ddof=1)) / math.sqrt(len(s)) if len(s) > 1 else 0.0
        items.append({"label": gname, "mean": m, "lo": m - ci, "hi": m + ci, "n": int(len(s))})
    return {"type": "errorbar", "title": "均值 95% 置信区间", "series": items, "yLabel": y_label}


def line_spec(labels: List[str], values: List[float], ttl: str = "",
              x_label: str = "", y_label: str = "") -> Dict[str, Any]:
    return {"type": "line", "title": ttl, "labels": labels, "values": values,
            "xLabel": x_label, "yLabel": y_label}


def fmt_cell(v: Any, decimals: int = 2) -> str:
    if v is None:
        return "."
    if isinstance(v, str):
        return v
    if isinstance(v, bool):
        return "是" if v else "否"
    if isinstance(v, (int, np.integer)):
        return str(int(v))
    return fmt_num(float(v), decimals)
