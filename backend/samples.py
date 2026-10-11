"""内置 SPSS 示例数据集。

数据取自 IBM SPSS Statistics 27 安装目录自带的简体中文样例
（`Samples/Simplified Chinese/*.sav`），共 120 个真实数据集。
读取时完整保留 SPSS 的变量标签、值标签、测量尺度与显示宽度。
"""
from __future__ import annotations

import datetime
import math
import os
import re
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from .store import DATE, NUMERIC, STRING, STORE, Dataset, Variable

SAMPLES_DIR = Path(__file__).resolve().parent.parent / "samples"

_lock = threading.Lock()
_cache: Optional[List[Dict[str, Any]]] = None


# ---------------------------------------------------------------- 工具

def _parse_format(fmt: str) -> Optional[Tuple[str, int, int]]:
    """解析 SPSS 格式串 → (类型, 宽度, 小数位)。

    F8.2 / COMMA12.2 / DOLLAR8 → 数值；A12 → 字符串；ADATE10 / DATE11 → 日期。
    """
    if not fmt:
        return None
    f = str(fmt).upper().strip()
    if not f:
        return None
    if "DATE" in f or f.startswith("TIME") or "DTIME" in f:
        m = re.search(r"(\d+)", f)
        return DATE, int(m.group(1)) if m else 10, 0
    if f.startswith("A"):
        m = re.match(r"A(\d+)", f)
        return STRING, int(m.group(1)) if m else 8, 0
    m = re.match(r"[A-Z]+(\d+)(?:\.(\d+))?", f)
    if m:
        return NUMERIC, int(m.group(1)), int(m.group(2) or 0)
    return None


def _infer_decimals(s: pd.Series) -> int:
    try:
        vals = pd.to_numeric(s, errors="coerce").dropna()
        if vals.empty:
            return 0
        if (vals == vals.round()).all():
            return 0
        return 2
    except Exception:
        return 0


def _key_str(k: Any) -> str:
    """值标签的键统一成字符串（1 / 1.0 / '1' 都归一到 '1'）。"""
    if isinstance(k, float) and k.is_integer():
        return str(int(k))
    if isinstance(k, (int, np.integer)):
        return str(int(k))
    if isinstance(k, (np.floating,)):
        f = float(k)
        return str(int(f)) if f.is_integer() else str(f)
    return str(k)


def _cell(x: Any) -> Any:
    """把 pandas / numpy 的值转成可 JSON 序列化的单元格值。"""
    if x is None:
        return None
    try:
        if x is pd.NaT or x is pd.NA:
            return None
    except Exception:
        pass
    if isinstance(x, float) and math.isnan(x):
        return None
    if isinstance(x, np.floating):
        f = float(x)
        return None if math.isnan(f) else f
    if isinstance(x, np.integer):
        return int(x)
    if isinstance(x, np.bool_):
        return bool(x)
    if isinstance(x, (pd.Timestamp, datetime.datetime, datetime.date, np.datetime64)):
        try:
            return pd.Timestamp(x).strftime("%Y-%m-%d")
        except Exception:
            return str(x)
    if isinstance(x, str):
        s = x.strip()
        return s or None
    return x


def _is_na(x: Any) -> bool:
    if x is None:
        return True
    try:
        r = pd.isna(x)
        return bool(r) if isinstance(r, (bool, np.bool_)) else False
    except Exception:
        return False


# ---------------------------------------------------------------- 列表

def sample_dir() -> Path:
    return SAMPLES_DIR


def list_samples(force: bool = False) -> List[Dict[str, Any]]:
    """列出全部内置示例数据（带缓存）。"""
    global _cache
    with _lock:
        if _cache is not None and not force:
            return _cache
        out: List[Dict[str, Any]] = []
        if SAMPLES_DIR.is_dir():
            try:
                import pyreadstat
            except ImportError:
                pyreadstat = None
            for p in sorted(SAMPLES_DIR.glob("*.sav"), key=lambda q: q.name.lower()):
                item = {"file": p.name, "title": p.stem, "label": "",
                        "cases": 0, "vars": 0, "size": 0}
                try:
                    item["size"] = p.stat().st_size
                except OSError:
                    pass
                if pyreadstat is not None:
                    try:
                        _, meta = pyreadstat.read_sav(str(p), metadataonly=True)
                        item["cases"] = int(meta.number_rows or 0)
                        item["vars"] = int(meta.number_columns or 0)
                        lbl = meta.file_label
                        if isinstance(lbl, bytes):
                            lbl = lbl.decode("utf-8", errors="replace")
                        item["label"] = (lbl or "").strip()
                    except Exception:
                        pass
                out.append(item)
        _cache = out
        return _cache


# ---------------------------------------------------------------- 读取

def _resolve(filename: str) -> Path:
    name = os.path.basename(str(filename or ""))
    p = (SAMPLES_DIR / name).resolve()
    try:
        p.relative_to(SAMPLES_DIR.resolve())
    except ValueError:
        raise FileNotFoundError(filename)
    if not p.is_file():
        raise FileNotFoundError(filename)
    return p


def load_sav_dataset(filename: str, name: Optional[str] = None) -> Dataset:
    """把某个 .sav 读成一个完整的 Dataset（含变量元数据）。"""
    import pyreadstat

    path = _resolve(filename)
    df, meta = pyreadstat.read_sav(str(path))

    labels = dict(meta.column_names_to_labels or {})
    vlabels = dict(meta.variable_value_labels or {})
    measures = dict(meta.variable_measure or {})
    widths = dict(meta.variable_display_width or {})
    formats = dict(meta.original_variable_types or {})

    ds = STORE.create(name or path.stem)
    ds.variables = []

    for col in df.columns:
        s = df[col]
        fmt = formats.get(col, "")
        parsed = _parse_format(fmt)

        if pd.api.types.is_numeric_dtype(s):
            dtype = NUMERIC
        elif pd.api.types.is_datetime64_any_dtype(s):
            dtype = DATE
        elif parsed and parsed[0] == DATE:
            dtype = DATE
        else:
            dtype = STRING

        width = parsed[1] if parsed else 8
        dec = parsed[2] if parsed else 0
        if dtype == NUMERIC and (parsed is None or parsed[2] == 0):
            dec = _infer_decimals(s)

        label = labels.get(col) or ""
        if str(label) == str(col):
            label = ""

        values: Dict[str, str] = {}
        for k, v in (vlabels.get(col) or {}).items():
            if v is None:
                continue
            values[_key_str(k)] = str(v)

        measure = measures.get(col) or ("scale" if dtype == NUMERIC else "nominal")
        if measure not in ("scale", "ordinal", "nominal"):
            measure = "scale"

        colw = int(widths.get(col) or 8)

        ds.variables.append(Variable(
            name=str(col),
            dtype=dtype,
            width=max(1, int(width)),
            decimals=max(0, int(dec)),
            label=str(label),
            values=values,
            columns=max(5, min(44, colw + 4)),
            align="right" if dtype == NUMERIC else "left",
            measure=measure,
        ))

    ds.records = [
        [_cell(x) for x in row]
        for row in df.itertuples(index=False, name=None)
    ]
    return ds
