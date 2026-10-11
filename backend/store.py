"""数据集存储层：变量元数据 + 个案数据 + 会话级数据集管理。

内部用 pandas.DataFrame 做计算，对外暴露 SPSS 风格的数据结构：
- 变量 (Variable)：名称/类型/宽度/小数位/标签/值标签/缺失值/列宽/对齐/测量尺度/角色
- 个案 (case)：一行观测值
"""
from __future__ import annotations

import io
import math
import uuid
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

NUMERIC = "numeric"
STRING = "string"
DATE = "date"

MEASURES = ("scale", "ordinal", "nominal")
ALIGNS = ("left", "right", "center")


def _is_missing(v: Any) -> bool:
    if v is None:
        return True
    if isinstance(v, float) and math.isnan(v):
        return True
    if isinstance(v, str) and v.strip() == "":
        return True
    return False


class Variable:
    """单个变量（列）的元数据。"""

    def __init__(
        self,
        name: str,
        dtype: str = NUMERIC,
        width: int = 8,
        decimals: int = 2,
        label: str = "",
        values: Optional[Dict[str, str]] = None,
        missing: Optional[Dict[str, Any]] = None,
        columns: int = 8,
        align: str = "right",
        measure: str = "scale",
        role: str = "input",
    ):
        self.name = name
        self.dtype = dtype if dtype in (NUMERIC, STRING, DATE) else NUMERIC
        self.width = int(width)
        self.decimals = int(decimals)
        self.label = label or ""
        self.values = values or {}          # {值: 标签}
        self.missing = missing or {}        # {"discrete":[...], "range":[lo,hi], "lo":x, "hi":x}
        self.columns = int(columns)
        self.align = align if align in ALIGNS else "right"
        self.measure = measure if measure in MEASURES else "scale"
        self.role = role or "input"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "type": self.dtype,
            "width": self.width,
            "decimals": self.decimals,
            "label": self.label,
            "values": self.values,
            "missing": self.missing,
            "columns": self.columns,
            "align": self.align,
            "measure": self.measure,
            "role": self.role,
        }

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "Variable":
        return Variable(
            name=d.get("name", "VAR"),
            dtype=d.get("type", NUMERIC),
            width=d.get("width", 8),
            decimals=d.get("decimals", 2),
            label=d.get("label", ""),
            values=d.get("values") or {},
            missing=d.get("missing") or {},
            columns=d.get("columns", 8),
            align=d.get("align", "right"),
            measure=d.get("measure", "scale"),
            role=d.get("role", "input"),
        )

    def user_missing_set(self) -> set:
        """返回离散型用户缺失值集合。"""
        out = set()
        for v in self.missing.get("discrete", []) or []:
            out.add(_coerce(v, self.dtype))
        rng = self.missing.get("range")
        if rng and len(rng) == 2:
            pass  # 区间缺失在 mask 中单独处理
        return out


def _coerce(v: Any, dtype: str) -> Any:
    if dtype == NUMERIC:
        try:
            return float(v)
        except (TypeError, ValueError):
            return np.nan
    return "" if v is None else str(v)


def fmt_num(x: Any, decimals: int = 2) -> str:
    """按 SPSS 风格格式化数字。"""
    if x is None:
        return "."
    if isinstance(x, str):
        return x
    try:
        f = float(x)
    except (TypeError, ValueError):
        return str(x)
    if math.isnan(f):
        return "."
    if math.isinf(f):
        return "inf" if f > 0 else "-inf"
    if decimals is None:
        decimals = 2
    if abs(f) >= 1e6 or (f != 0 and abs(f) < 1e-4):
        return f"{f:.{max(decimals,3)}e}"
    return f"{f:.{decimals}f}"


def fmt_p(p: Any, decimals: int = 3) -> str:
    """p 值格式：小于 0.001 时显示 .000。"""
    if p is None:
        return "."
    try:
        f = float(p)
    except (TypeError, ValueError):
        return str(p)
    if math.isnan(f):
        return "."
    if f < 0.001:
        return "." + "0" * decimals
    return f"{f:.{decimals}f}".lstrip("0") if False else f"{f:.{decimals}f}"


class Dataset:
    """一个数据集。"""

    def __init__(self, name: str = "数据集1", ds_id: Optional[str] = None):
        self.id = ds_id or ("ds_" + uuid.uuid4().hex[:10])
        self.name = name
        self.variables: List[Variable] = []
        self.records: List[List[Any]] = []     # 行 × 列
        self.filter_var: Optional[str] = None  # 筛选变量名（0/1）
        self.split_var: Optional[str] = None
        self.weight_var: Optional[str] = None
        self.created = pd.Timestamp.now().isoformat()

    # ---------- 基础 ----------
    def var(self, name: str) -> Optional[Variable]:
        for v in self.variables:
            if v.name == name:
                return v
        return None

    @property
    def n_cases(self) -> int:
        return len(self.records)

    @property
    def names(self) -> List[str]:
        return [v.name for v in self.variables]

    def unique_name(self, base: str = "VAR") -> str:
        existing = {v.name.upper() for v in self.variables}
        if base.upper() not in existing:
            return base
        i = 1
        while f"{base}{i:05d}".upper() in existing:
            i += 1
        return f"{base}{i:05d}"

    # ---------- 与 DataFrame 互转 ----------
    def to_dataframe(self, apply_filter: bool = True) -> pd.DataFrame:
        cols = self.names
        if not cols:
            return pd.DataFrame()
        data = {}
        for j, v in enumerate(self.variables):
            col = [r[j] if j < len(r) else None for r in self.records]
            if v.dtype == NUMERIC:
                ser = pd.Series([np.nan if _is_missing(x) else _safe_float(x) for x in col], dtype="float64")
                # 用户缺失值 -> NaN
                um = v.user_missing_set()
                if um:
                    ser = ser.mask(ser.isin(list(um)))
                rng = v.missing.get("range")
                if rng and len(rng) == 2:
                    lo, hi = _safe_float(rng[0]), _safe_float(rng[1])
                    ser = ser.mask((ser >= lo) & (ser <= hi))
                data[v.name] = ser
            else:
                data[v.name] = pd.Series([None if _is_missing(x) else str(x) for x in col], dtype="object")
        df = pd.DataFrame(data)
        if apply_filter and self.filter_var and self.filter_var in df.columns:
            df = df[df[self.filter_var].fillna(0) != 0]
        return df

    def replace_from_dataframe(self, df: pd.DataFrame, keep_meta: bool = True):
        """用 DataFrame 整体替换数据，尽量保留原有变量元数据。"""
        old = {v.name: v for v in self.variables} if keep_meta else {}
        self.variables = []
        self.records = []
        for col in df.columns:
            s = df[col]
            if col in old:
                v = old[col]
                if pd.api.types.is_numeric_dtype(s):
                    v.dtype = NUMERIC
            else:
                if pd.api.types.is_numeric_dtype(s):
                    v = Variable(str(col), NUMERIC)
                else:
                    v = Variable(str(col), STRING, align="left", measure="nominal", width=12, columns=12)
            self.variables.append(v)
        self.records = [
            [_cell(x) for x in row] for row in df.itertuples(index=False, name=None)
        ]

    # ---------- 序列化 ----------
    def summary(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "nCases": self.n_cases,
            "nVars": len(self.variables),
            "splitVar": self.split_var,
            "filterVar": self.filter_var,
            "weightVar": self.weight_var,
        }

    def to_dict(self, offset: int = 0, limit: Optional[int] = None) -> Dict[str, Any]:
        rows = self.records
        total = len(rows)
        if limit is None:
            page = rows[offset:]
        else:
            page = rows[offset: offset + limit]
        return {
            "id": self.id,
            "name": self.name,
            "variables": [v.to_dict() for v in self.variables],
            "rows": page,
            "total": total,
            "offset": offset,
            "splitVar": self.split_var,
            "filterVar": self.filter_var,
            "weightVar": self.weight_var,
        }


def _safe_float(x: Any) -> float:
    try:
        return float(x)
    except (TypeError, ValueError):
        return np.nan


def _cell(x: Any) -> Any:
    if x is None:
        return None
    if isinstance(x, float) and math.isnan(x):
        return None
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, (np.floating,)):
        f = float(x)
        return None if math.isnan(f) else f
    if isinstance(x, (np.bool_,)):
        return bool(x)
    if isinstance(x, pd.Timestamp):
        return x.strftime("%Y-%m-%d")
    return x


class Store:
    """进程内的数据集仓库。"""

    def __init__(self):
        self.datasets: Dict[str, Dataset] = {}
        self.order: List[str] = []

    def create(self, name: Optional[str] = None) -> Dataset:
        name = name or f"数据集{len(self.order) + 1}"
        ds = Dataset(name)
        self.datasets[ds.id] = ds
        self.order.append(ds.id)
        return ds

    def get(self, ds_id: str) -> Optional[Dataset]:
        return self.datasets.get(ds_id)

    def remove(self, ds_id: str):
        self.datasets.pop(ds_id, None)
        if ds_id in self.order:
            self.order.remove(ds_id)

    def list(self) -> List[Dict[str, Any]]:
        return [self.datasets[i].summary() for i in self.order if i in self.datasets]


STORE = Store()


# ---------------- 导入 / 导出 ----------------

def import_file(filename: str, content: bytes) -> pd.DataFrame:
    low = filename.lower()
    if low.endswith(".csv") or low.endswith(".txt") or low.endswith(".tsv"):
        text = content.decode("utf-8-sig", errors="replace")
        sep = "\t" if low.endswith(".tsv") else None
        if sep is None:
            first = text.splitlines()[0] if text.splitlines() else ""
            sep = ";" if first.count(";") > first.count(",") else ","
        df = pd.read_csv(io.StringIO(text), sep=sep, engine="python")
        # 去掉全空列
        df = df.dropna(axis=1, how="all")
        return df
    if low.endswith(".xlsx") or low.endswith(".xls") or low.endswith(".xlsm"):
        return pd.read_excel(io.BytesIO(content))
    if low.endswith(".sav"):
        try:
            import pyreadstat
            df, _meta = pyreadstat.read_sav(io.BytesIO(content))
            return df
        except ImportError as e:
            raise RuntimeError("读取 .sav 需要 pyreadstat 库") from e
    raise RuntimeError(f"不支持的文件类型：{filename}")


def export_bytes(ds: Dataset, fmt: str) -> (bytes, str, str):
    """返回 (内容, 媒体类型, 建议文件名)。"""
    df = ds.to_dataframe(apply_filter=False)
    # 应用值标签导出（字符串型更贴近 SPSS 结果，这里保留原始值）
    if fmt == "csv":
        buf = io.StringIO()
        df.to_csv(buf, index=False, encoding="utf-8-sig")
        return buf.getvalue().encode("utf-8-sig"), "text/csv", f"{ds.name}.csv"
    if fmt == "xlsx":
        bio = io.BytesIO()
        with pd.ExcelWriter(bio, engine="openpyxl") as w:
            df.to_excel(w, index=False, sheet_name="数据")
        return bio.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", f"{ds.name}.xlsx"
    raise RuntimeError(f"不支持的导出格式：{fmt}")
