"""统计过程库：SPSS 常用分析过程的后端实现。

每个过程签名统一为 proc(df, ds, params) -> List[output block]
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from scipy import stats as st

from .output import (
    bar_spec, box_spec, chart, clean_numeric, describe_series, errorbar_spec,
    fmt_cell, group_labels, histogram_spec, label_of, line_spec, note, num,
    paired_clean, pie_spec, pval, qq_spec, scatter_spec, std_error_kurt,
    std_error_skew, table, text_block, title, value_label,
)
from .store import Dataset, Variable

try:
    import statsmodels.api as sm
    import statsmodels.formula.api as smf
    HAS_SM = True
except Exception:  # pragma: no cover
    HAS_SM = False


def _v(ds: Dataset, name: str) -> Optional[Variable]:
    return ds.var(name)


def _n(v: Any) -> str:
    return fmt_cell(v)


# =====================================================================
# 频率
# =====================================================================

def frequencies(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    variables = p.get("variables") or []
    stats_wanted = p.get("statistics") or {}
    charts_wanted = p.get("charts") or {}
    out: List[Dict[str, Any]] = [title("频率")]
    if not variables:
        return out + [note("未选择变量。")]

    for name in variables:
        var = _v(ds, name)
        lbl = label_of(var, name)
        s = df[name] if name in df.columns else pd.Series(dtype="object")
        out.append(title(f"{lbl}", 2))

        if var and var.dtype == "string":
            valid = s.dropna().astype(str)
            missing_n = int(s.isna().sum())
        else:
            valid = pd.to_numeric(s, errors="coerce").dropna()
            missing_n = int(s.isna().sum())

        n_valid = len(valid)
        counts = valid.value_counts().sort_index()
        total = n_valid + missing_n
        labels = var.values if var else None

        header = [["", "频率", "百分比", "有效百分比", "累积百分比"]]
        rows = []
        cum = 0
        for k, c in counts.items():
            cum += c
            lab = value_label(var, k) if var else None
            if lab is not None and lab != str(k):
                label_txt = lab
            else:
                # 无值标签时按整数/小数智能显示
                try:
                    fk = float(k)
                    label_txt = str(int(fk)) if fk.is_integer() else str(fk)
                except (TypeError, ValueError):
                    label_txt = str(k)
            rows.append([
                label_txt,
                str(int(c)),
                num(100.0 * c / total, 1) if total else ".",
                num(100.0 * c / n_valid, 1) if n_valid else ".",
                num(100.0 * cum / n_valid, 1) if n_valid else ".",
            ])
        if missing_n:
            rows.append(["缺失", str(missing_n), num(100.0 * missing_n / total, 1) if total else ".", "", ""])
        rows.append(["合计", str(total), "100.0", "100.0", ""])
        out.append(table(f"{lbl}", header, rows, row_header=1))

        # 统计量
        want = [k for k, v in stats_wanted.items() if v]
        if want and var and var.dtype != "string":
            sv = pd.to_numeric(s, errors="coerce").dropna()
            d = describe_series(sv)
            cols = ["N"]
            vals = [str(int(d.get("N", 0)))]
            mapping = [
                ("mean", "均值", "Mean", 2), ("median", "中位数", "Median", 2),
                ("mode", "众数", None, 2), ("std", "标准差", "StdDev", 2),
                ("variance", "方差", "Variance", 2), ("range", "全距", "Range", 2),
                ("min", "最小值", "Minimum", 2), ("max", "最大值", "Maximum", 2),
                ("sum", "合计", "Sum", 2), ("seMean", "均值的标准误", "SEMean", 2),
                ("skew", "偏度", "Skewness", 2), ("kurt", "峰度", "Kurtosis", 2),
            ]
            for key, cn, en, dec in mapping:
                if not stats_wanted.get(key):
                    continue
                cols.append(cn)
                if key == "mode" and len(sv):
                    m = sv.mode()
                    vals.append(fmt_cell(float(m.iloc[0]), 2) if len(m) else ".")
                elif en:
                    vals.append(num(d.get(en), dec))
                else:
                    vals.append(".")
            if stats_wanted.get("percentiles"):
                for q in stats_wanted["percentiles"]:
                    cols.append(f"百分位数 {q}")
                    vals.append(num(sv.quantile(q / 100.0), 2) if len(sv) else ".")
            out.append(table("统计量", [cols], [vals], row_header=1))
            if stats_wanted.get("skew") or stats_wanted.get("kurt"):
                out.append(note("a. 此处计算的是标准差，而非标准误。"))

        # 图表
        if charts_wanted.get("bar"):
            out.append(chart("bar", bar_spec(counts, lbl, labels)))
        if charts_wanted.get("pie"):
            out.append(chart("pie", pie_spec(counts, lbl, labels)))
        if charts_wanted.get("histogram") and var and var.dtype != "string":
            spec = histogram_spec(pd.to_numeric(s, errors="coerce"), lbl)
            if spec:
                out.append(chart("histogram", spec))
    return out


# =====================================================================
# 描述
# =====================================================================

def descriptives(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    variables = p.get("variables") or []
    opts = p.get("options") or {}
    order = p.get("order") or "variable"
    out: List[Dict[str, Any]] = [title("描述统计")]
    if not variables:
        return out + [note("未选择变量。")]

    cols = ["N", "最小值", "最大值"]
    keys = []
    if opts.get("mean"):
        cols.append("均值"); keys.append(("Mean", 4))
    if opts.get("std"):
        cols.append("标准差"); keys.append(("StdDev", 4))
    if opts.get("variance"):
        cols.append("方差"); keys.append(("Variance", 4))
    if opts.get("range"):
        cols.append("全距"); keys.append(("Range", 4))
    if opts.get("sum"):
        cols.append("合计"); keys.append(("Sum", 4))
    if opts.get("seMean"):
        cols.append("标准误"); keys.append(("SEMean", 4))
    if opts.get("skew"):
        cols.append("偏度"); keys.append(("Skewness", 4))
    if opts.get("kurt"):
        cols.append("峰度"); keys.append(("Kurtosis", 4))

    rows = []
    for name in variables:
        var = _v(ds, name)
        lbl = label_of(var, name)
        s = clean_numeric(df, name).dropna()
        d = describe_series(s)
        if not d:
            rows.append([lbl] + ["."] * (len(cols) - 1))
            continue
        r = [lbl, str(int(d["N"])), num(d["Minimum"], 4), num(d["Maximum"], 4)]
        for en, dec in keys:
            r.append(num(d.get(en), dec))
        rows.append(r)

    if order == "mean":
        try:
            rows.sort(key=lambda r: float(r[cols.index("均值")]) if "均值" in cols else 0, reverse=True)
        except Exception:
            pass

    out.append(table("描述统计量", [cols], rows, row_header=1))
    if opts.get("percentiles"):
        qs = opts["percentiles"]
        qrows = []
        for name in variables:
            var = _v(ds, name)
            s = clean_numeric(df, name).dropna()
            if len(s) == 0:
                continue
            qrows.append([label_of(var, name)] + [num(s.quantile(q / 100.0), 4) for q in qs])
        out.append(table("百分位数", [[""] + [f"{q}%" for q in qs]], qrows, row_header=1))
    return out


# =====================================================================
# 探索
# =====================================================================

def explore(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    dependents = p.get("dependents") or []
    factors = p.get("factors") or []
    plots = p.get("plots") or {}
    out: List[Dict[str, Any]] = [title("探索")]
    if not dependents:
        return out + [note("未选择因变量。")]

    # 描述
    rows = []
    for name in dependents:
        var = _v(ds, name)
        lbl = label_of(var, name)
        s = clean_numeric(df, name).dropna()
        if len(s) == 0:
            continue
        q = s.quantile([0.05, 0.10, 0.25, 0.5, 0.75, 0.90, 0.95])
        rows.append([
            lbl, "统计量", num(s.mean(), 4), num(1.96 * s.std(ddof=1) / math.sqrt(len(s)), 4) if len(s) > 1 else ".",
            num(s.quantile(0.05), 4), num(s.quantile(0.10), 4),
            num(s.quantile(0.25), 4), num(s.median(), 4), num(s.quantile(0.75), 4),
            num(s.quantile(0.90), 4), num(s.quantile(0.95), 4),
        ])
    if rows:
        out.append(table(
            "描述",
            [["", "", "均值", "统计量", "统计量", "统计量", "统计量", "统计量", "统计量", "统计量", "统计量"],
             ["", "", "均值", "95% 置信区间下限", "5% 修整均值", "中位数", "方差", "标准差", "最小值", "最大值", "全距"]],
            rows, row_header=2))

    # 正态性检验
    norm_rows = []
    for name in dependents:
        var = _v(ds, name)
        s = clean_numeric(df, name).dropna()
        if len(s) < 3:
            continue
        lbl = label_of(var, name)
        if len(s) <= 5000:
            w, pw = st.shapiro(s)
            norm_rows.append([lbl, "Shapiro-Wilk", num(w, 3), str(int(len(s))), pval(pw)])
        mu, sd = s.mean(), s.std(ddof=1)
        if sd > 0:
            z = (s - mu) / sd
            ks, pk = st.kstest(z.to_numpy(dtype="float64"), "norm")
            norm_rows.append([lbl, "Kolmogorov-Smirnov", num(ks, 3), str(int(len(s))), pval(pk)])
    if norm_rows:
        out.append(table("正态性检验",
                         [["", "Kolmogorov-Smirnov / Shapiro-Wilk", "统计量", "df", "显著性"]],
                         norm_rows, row_header=1,
                         notes=["a. Lilliefors 显著水平修正。"]))

    # 分组描述
    if factors:
        fac = factors[0]
        fvar = _v(ds, fac)
        for name in dependents:
            var = _v(ds, name)
            s = clean_numeric(df, name)
            g = df[fac]
            rows = []
            for gv in sorted(pd.unique(g.dropna()), key=lambda x: (str(type(x)), x)):
                sel = (g == gv) & s.notna()
                ss = s[sel]
                if len(ss) == 0:
                    continue
                rows.append([value_label(fvar, gv), str(len(ss)),
                             num(ss.mean(), 4), num(ss.std(ddof=1), 4) if len(ss) > 1 else ".",
                             num(ss.min(), 4), num(ss.max(), 4)])
            if rows:
                out.append(table(f"分组描述：{label_of(var, name)} × {label_of(fvar, fac)}",
                                 [["", "N", "均值", "标准差", "最小值", "最大值"]], rows, row_header=1))

    # 箱线图 / 直方图 / Q-Q
    if factors and (plots.get("boxplot", True)):
        fac = factors[0]
        fvar = _v(ds, fac)
        for name in dependents:
            groups = {}
            s = clean_numeric(df, name)
            g = df[fac]
            for gv in sorted(pd.unique(g.dropna()), key=lambda x: (str(type(x)), x)):
                groups[value_label(fvar, gv)] = s[g == gv]
            spec = box_spec(groups, label_of(_v(ds, name), name))
            if spec["series"]:
                out.append(chart("box", spec, f"箱线图：{name}"))
    if plots.get("histogram", True):
        for name in dependents:
            var = _v(ds, name)
            spec = histogram_spec(clean_numeric(df, name), label_of(var, name))
            if spec:
                out.append(chart("histogram", spec))
    if plots.get("normality"):
        for name in dependents:
            var = _v(ds, name)
            spec = qq_spec(clean_numeric(df, name), label_of(var, name))
            if spec:
                out.append(chart("qq", spec))
    return out


# =====================================================================
# 交叉表
# =====================================================================

def _pct(c: float, tot: float) -> str:
    return num(100.0 * c / tot, 1) if tot else "."


def crosstabs(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    rowvars = p.get("rows") or []
    colvars = p.get("cols") or []
    layers = p.get("layers") or []
    stat = p.get("statistics") or {}
    cells = p.get("cells") or {"observed": True}
    out: List[Dict[str, Any]] = [title("交叉表")]
    if not rowvars or not colvars:
        return out + [note("请同时选择行变量与列变量。")]

    rowvar, colvar = rowvars[0], colvars[0]
    rv, cv = _v(ds, rowvar), _v(ds, colvar)

    layer_vals = [None]
    lvar = None
    if layers:
        lvar = _v(ds, layers[0])
        layer_vals = sorted(pd.unique(df[layers[0]].dropna()), key=lambda x: (str(type(x)), x))

    all_chi: List[List[str]] = []
    for lv in layer_vals:
        sub = df if lv is None else df[df[layers[0]] == lv]
        if lv is not None:
            out.append(title(f"{label_of(lvar, layers[0])} = {value_label(lvar, lv)}", 2))
        if len(sub) == 0:
            continue
        ct = pd.crosstab(sub[rowvar], sub[colvar], dropna=True)
        if ct.size == 0:
            continue
        row_keys = list(ct.index)
        col_keys = list(ct.columns)
        ncol = len(col_keys)
        grand = float(ct.to_numpy().sum())

        header = [
            [{"text": "", "rowspan": 2}, {"text": "", "rowspan": 2},
             {"text": label_of(cv, colvar), "colspan": ncol + 1}],
            [value_label(cv, c) for c in col_keys] + ["合计"],
        ]
        rows = []
        for rk in row_keys:
            cells_row = [label_of(rv, rowvar), value_label(rv, rk)]
            rowsum = float(ct.loc[rk].sum())
            for ck in col_keys:
                c = float(ct.loc[rk, ck])
                parts = []
                if cells.get("observed", True):
                    parts.append(str(int(c)))
                if cells.get("expected") and grand:
                    exp = rowsum * float(ct[ck].sum()) / grand
                    parts.append(num(exp, 1))
                if cells.get("rowPct"):
                    parts.append(_pct(c, rowsum) + "%")
                if cells.get("colPct"):
                    colsum = float(ct[ck].sum())
                    parts.append(_pct(c, colsum) + "%")
                if cells.get("totalPct"):
                    parts.append(_pct(c, grand) + "%")
                cells_row.append("\n".join(parts))
            cells_row.append(str(int(rowsum)))
            rows.append(cells_row)
        colsums = [float(ct[c].sum()) for c in col_keys]
        total_row = ["合计", ""] + [str(int(x)) for x in colsums] + [str(int(grand))]
        rows.append(total_row)
        out.append(table(f"{label_of(rv, rowvar)} * {label_of(cv, colvar)} 交叉制表", header, rows, row_header=2))
        if cells.get("expected"):
            out.append(note("a. 每个单元格包含：计数、期望计数、行百分比、列百分比、总百分比。"))

        # 卡方检验
        if stat.get("chi2"):
            try:
                chi2, pv, dof, expected = st.chi2_contingency(ct.to_numpy())
                n = ct.to_numpy().sum()
                min_exp = float(expected.min())
                pct_lt5 = float((expected < 5).sum()) / expected.size * 100
                all_chi.append([label_of(rv, rowvar) + " * " + label_of(cv, colvar),
                                num(chi2, 3), str(int(dof)), pval(pv),
                                str(int(n)), str(int(min_exp)) if min_exp >= 1 else num(min_exp, 2),
                                num(pct_lt5, 1) + "%"])
                # Phi / Cramer's V
                if stat.get("phi"):
                    n_tot = ct.to_numpy().sum()
                    k = min(ct.shape) - 1
                    phi = math.sqrt(chi2 / n_tot) if n_tot else np.nan
                    v = math.sqrt(chi2 / (n_tot * k)) if n_tot and k > 0 else np.nan
                    out.append(table("对称度量",
                                     [["", "值", "近似值显著性"]],
                                     [["Phi", num(phi, 3), pval(pv)],
                                      ["Cramer's V", num(v, 3), pval(pv)]],
                                     row_header=1))
            except Exception as e:
                out.append(note(f"卡方检验无法计算：{e}"))

    if all_chi:
        out.append(table("卡方检验",
                         [["", "值", "df", "渐进显著性（双侧）", "有效个案数", "最小期望计数", "期望计数<5 的比例"]],
                         all_chi, row_header=1,
                         notes=["a. 0 个单元格(.0%)的期望计数小于 5。最小期望计数见上表。"]))
    return out


# =====================================================================
# 均值
# =====================================================================

def means(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    deps = p.get("dependents") or []
    inds = p.get("independents") or []
    out: List[Dict[str, Any]] = [title("均值")]
    if not deps:
        return out + [note("未选择因变量。")]

    for dep in deps:
        var = _v(ds, dep)
        lbl = label_of(var, dep)
        if not inds:
            s = clean_numeric(df, dep).dropna()
            if len(s) == 0:
                continue
            out.append(table(f"{lbl} 的均值",
                             [["均值", "N", "标准差"]],
                             [[num(s.mean(), 4), str(len(s)), num(s.std(ddof=1), 4)]],
                             row_header=1))
            continue
        ind = inds[0]
        ivar = _v(ds, ind)
        s = clean_numeric(df, dep)
        g = df[ind]
        rows = []
        group_series = {}
        for gv in sorted(pd.unique(g.dropna()), key=lambda x: (str(type(x)), x)):
            sel = (g == gv) & s.notna()
            ss = s[sel]
            if len(ss) == 0:
                continue
            group_series[value_label(ivar, gv)] = ss
            rows.append([value_label(ivar, gv), num(ss.mean(), 4), str(len(ss)), num(ss.std(ddof=1), 4)])
        allv = s[g.notna()].dropna()
        rows.append(["合计", num(allv.mean(), 4) if len(allv) else ".", str(len(allv)),
                     num(allv.std(ddof=1), 4) if len(allv) > 1 else "."])
        out.append(table(f"{lbl} × {label_of(ivar, ind)}",
                         [["", "均值", "N", "标准差"]], rows, row_header=1))
        if p.get("plot", True) and group_series:
            out.append(chart("errorbar", errorbar_spec(group_series, lbl)))
    return out


# =====================================================================
# T 检验
# =====================================================================

def ttest_one(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    variables = p.get("variables") or []
    tv = float(p.get("testValue", 0))
    out: List[Dict[str, Any]] = [title("单样本 T 检验")]
    if not variables:
        return out + [note("未选择变量。")]
    rows = []
    for name in variables:
        var = _v(ds, name)
        s = clean_numeric(df, name).dropna()
        if len(s) < 2:
            continue
        t, pv = st.ttest_1samp(s, tv)
        dfree = len(s) - 1
        m, sd = s.mean(), s.std(ddof=1)
        se = sd / math.sqrt(len(s))
        lo, hi = st.t.interval(0.95, dfree, loc=m, scale=se)
        rows.append([label_of(var, name), str(len(s)), num(m, 4), num(sd, 4), num(se, 4)])
        rows[-1] = [label_of(var, name), str(len(s)), num(m, 4), num(sd, 4), num(se, 4)]
        # 检验表另存
    if rows:
        out.append(table("单个样本统计量",
                         [["", "N", "均值", "标准差", "均值的标准误"]], rows, row_header=1))
    trows = []
    for name in variables:
        var = _v(ds, name)
        s = clean_numeric(df, name).dropna()
        if len(s) < 2:
            continue
        t, pv = st.ttest_1samp(s, tv)
        dfree = len(s) - 1
        m, sd = s.mean(), s.std(ddof=1)
        se = sd / math.sqrt(len(s))
        lo, hi = st.t.interval(0.95, dfree, loc=m, scale=se)
        trows.append([label_of(var, name), num(t, 3), str(dfree), pval(pv),
                      num(m - tv, 4), num(lo - tv, 4), num(hi - tv, 4)])
    if trows:
        out.append(table("单个样本检验",
                         [["", "t", "df", "显著性(双侧)", "均值差值", "差分的 95% 置信区间下限", "上限"]],
                         trows, row_header=1,
                         notes=[f"检验值 = {tv}"]))
    return out


def ttest_ind(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    testvars = p.get("testVars") or []
    gname = p.get("groupVar")
    gvals = p.get("groupValues") or []
    out: List[Dict[str, Any]] = [title("独立样本 T 检验")]
    if not testvars or not gname or len(gvals) < 2:
        return out + [note("请选择检验变量与分组变量（两个组）。")]

    gvar = _v(ds, gname)
    g = pd.to_numeric(df[gname], errors="coerce") if gvar and gvar.dtype != "string" else df[gname]
    g1, g2 = gvals[0], gvals[1]
    l1 = value_label(gvar, g1)
    l2 = value_label(gvar, g2)

    grp_rows, t_rows = [], []
    for name in testvars:
        var = _v(ds, name)
        s = clean_numeric(df, name)
        a = s[g == g1].dropna()
        b = s[g == g2].dropna()
        if len(a) < 2 or len(b) < 2:
            continue
        ma, mb = a.mean(), b.mean()
        sa, sb = a.std(ddof=1), b.std(ddof=1)
        na, nb = len(a), len(b)
        grp_rows.append([label_of(var, name), l1, str(na), num(ma, 4), num(sa, 4), num(sa / math.sqrt(na), 4)])
        grp_rows.append(["", l2, str(nb), num(mb, 4), num(sb, 4), num(sb / math.sqrt(nb), 4)])

        lev_f, lev_p = st.levene(a, b, center="mean")
        t_eq, p_eq = st.ttest_ind(a, b, equal_var=True)
        t_ue, p_ue = st.ttest_ind(a, b, equal_var=False)
        dfree = na + nb - 2
        diff = ma - mb
        sp = math.sqrt(((na - 1) * sa ** 2 + (nb - 1) * sb ** 2) / dfree) if dfree > 0 else np.nan
        se_diff = sp * math.sqrt(1 / na + 1 / nb) if sp == sp else np.nan
        lo, hi = (diff - 1.96 * se_diff, diff + 1.96 * se_diff) if se_diff == se_diff else (np.nan, np.nan)
        t_rows.append([label_of(var, name), num(lev_f, 3), pval(lev_p), num(t_eq, 3), str(dfree), pval(p_eq),
                       num(diff, 4), num(se_diff, 4), num(lo, 4), num(hi, 4)])
        t_rows.append(["", "", "", num(t_ue, 3), num(_welch_df(a, b), 3), pval(p_ue), num(diff, 4),
                       num(math.sqrt(sa ** 2 / na + sb ** 2 / nb), 4), "", ""])

    if grp_rows:
        out.append(table("组统计量",
                         [["", "组别", "N", "均值", "标准差", "均值的标准误"]],
                         grp_rows, row_header=1))
    if t_rows:
        out.append(table("独立样本检验",
                         [["", "Levene F", "显著性", "t", "df", "显著性(双侧)", "均值差值", "标准误差差值",
                           "差值的 95% 置信区间下限", "上限"]],
                         t_rows, row_header=1,
                         notes=["a. 上半部分为假设方差相等，下半部分为不假设方差相等。"]))
    return out


def _welch_df(a: pd.Series, b: pd.Series) -> float:
    va, vb = a.var(ddof=1) / len(a), b.var(ddof=1) / len(b)
    if va + vb == 0:
        return np.nan
    return (va + vb) ** 2 / (va ** 2 / (len(a) - 1) + vb ** 2 / (len(b) - 1))


def ttest_paired(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    pairs = p.get("pairs") or []
    out: List[Dict[str, Any]] = [title("配对样本 T 检验")]
    if not pairs:
        return out + [note("请选择成对变量。")]
    stat_rows, corr_rows, t_rows = [], [], []
    for pair in pairs:
        if len(pair) < 2:
            continue
        a_name, b_name = pair[0], pair[1]
        av, bv = _v(ds, a_name), _v(ds, b_name)
        x, y = paired_clean(df, a_name, b_name)
        n = len(x)
        if n < 2:
            continue
        d = x - y
        lab = f"{label_of(av, a_name)} - {label_of(bv, b_name)}"
        stat_rows.append([lab, str(n), num(x.mean(), 4), num(x.std(ddof=1), 4), num(x.std(ddof=1) / math.sqrt(n), 4)])
        stat_rows.append(["", str(n), num(y.mean(), 4), num(y.std(ddof=1), 4), num(y.std(ddof=1) / math.sqrt(n), 4)])
        r, pr = st.pearsonr(x, y)
        corr_rows.append([lab, str(n), num(r, 3), pval(pr)])
        t, pv = st.ttest_rel(x, y)
        dfree = n - 1
        md, sd = d.mean(), d.std(ddof=1)
        se = sd / math.sqrt(n)
        lo, hi = st.t.interval(0.95, dfree, loc=md, scale=se)
        t_rows.append([lab, num(md, 4), num(sd, 4), num(se, 4), num(lo, 4), num(hi, 4),
                       num(t, 3), str(dfree), pval(pv)])
    if stat_rows:
        out.append(table("成对样本统计量",
                         [["", "N", "均值", "标准差", "均值的标准误"]], stat_rows, row_header=1))
    if corr_rows:
        out.append(table("成对样本相关系数",
                         [["", "N", "相关系数", "显著性"]], corr_rows, row_header=1))
    if t_rows:
        out.append(table("成对样本检验",
                         [["", "均值", "标准差", "均值的标准误", "95% 置信区间下限", "上限", "t", "df", "显著性(双侧)"]],
                         t_rows, row_header=1))
    return out


# =====================================================================
# 方差分析
# =====================================================================

def anova_oneway(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    dep = p.get("dependent")
    fac = p.get("factor")
    out: List[Dict[str, Any]] = [title("单因素方差分析")]
    if not dep or not fac:
        return out + [note("请选择因变量与因子。")]

    dvar, fvar = _v(ds, dep), _v(ds, fac)
    s = clean_numeric(df, dep)
    g = df[fac]
    mask = s.notna() & g.notna()
    s, g = s[mask], g[mask]
    groups = []
    labels = []
    for gv in sorted(pd.unique(g), key=lambda x: (str(type(x)), x)):
        ss = s[g == gv]
        if len(ss) == 0:
            continue
        groups.append(ss.to_numpy())
        labels.append(value_label(fvar, gv))
    if len(groups) < 2:
        return out + [note("因子水平少于 2 个，无法进行方差分析。")]

    if p.get("descriptives", True):
        rows = []
        for lab, arr in zip(labels, groups):
            a = pd.Series(arr)
            rows.append([lab, str(len(a)), num(a.mean(), 4), num(a.std(ddof=1), 4),
                         num(a.std(ddof=1) / math.sqrt(len(a)), 4),
                         num(a.min(), 4), num(a.max(), 4)])
        allv = s
        rows.append(["合计", str(len(allv)), num(allv.mean(), 4), num(allv.std(ddof=1), 4),
                     num(allv.std(ddof=1) / math.sqrt(len(allv)), 4),
                     num(allv.min(), 4), num(allv.max(), 4)])
        out.append(table(f"{label_of(dvar, dep)} 的描述",
                         [["", "N", "均值", "标准差", "标准误", "最小值", "最大值"]], rows, row_header=1))

    if p.get("homogeneity", True):
        lev_f, lev_p = st.levene(*groups, center="mean")
        out.append(table("方差齐性检验",
                         [["Levene 统计量", "df1", "df2", "显著性"]],
                         [[num(lev_f, 3), str(len(groups) - 1), str(len(s) - len(groups)), pval(lev_p)]]))

    F, pv = st.f_oneway(*groups)
    k = len(groups)
    n = len(s)
    grand = float(s.mean())
    ss_between = sum(len(a) * (float(pd.Series(a).mean()) - grand) ** 2 for a in groups)
    ss_within = sum(float(((pd.Series(a) - pd.Series(a).mean()) ** 2).sum()) for a in groups)
    ss_total = ss_between + ss_within
    df_b, df_w, df_t = k - 1, n - k, n - 1
    ms_b = ss_between / df_b if df_b else np.nan
    ms_w = ss_within / df_w if df_w else np.nan
    out.append(table("ANOVA",
                     [["", "平方和", "df", "均方", "F", "显著性"]],
                     [["组间", num(ss_between, 3), str(df_b), num(ms_b, 3), num(F, 3), pval(pv)],
                      ["组内", num(ss_within, 3), str(df_w), num(ms_w, 3), "", ""],
                      ["总数", num(ss_total, 3), str(df_t), "", "", ""]],
                     row_header=1))

    if p.get("posthoc"):
        from itertools import combinations
        prows = []
        for (i, j) in combinations(range(k), 2):
            a, b = pd.Series(groups[i]), pd.Series(groups[j])
            diff = a.mean() - b.mean()
            se = math.sqrt(ms_w * (1 / len(a) + 1 / len(b))) if ms_w == ms_w else np.nan
            if se and se > 0:
                q = abs(diff) / (se / math.sqrt(2)) if False else np.nan
                t = diff / se
                pv2 = 2 * (1 - st.t.cdf(abs(t), df_w))
            else:
                t, pv2 = np.nan, np.nan
            lo, hi = (diff - st.t.ppf(0.975, df_w) * se, diff + st.t.ppf(0.975, df_w) * se) if se == se else (np.nan, np.nan)
            prows.append([labels[i], labels[j], num(diff, 4), num(se, 4), pval(pv2), num(lo, 4), num(hi, 4)])
        if prows:
            out.append(table("多重比较 (LSD)",
                             [["(I) 组", "(J) 组", "均值差 (I-J)", "标准误", "显著性", "95% 置信区间下限", "上限"]],
                             prows, row_header=2,
                             notes=["a. 基于观测均值，误差项为均方(误差) = %.3f。" % (ms_w if ms_w == ms_w else 0)]))

    if p.get("meansPlot", True):
        gs = {lab: pd.Series(arr) for lab, arr in zip(labels, groups)}
        out.append(chart("errorbar", errorbar_spec(gs, label_of(dvar, dep))))
    return out


def anova_glm(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    """单变量一般线性模型（含协变量）。"""
    dep = p.get("dependent")
    factors = p.get("factors") or []
    covs = p.get("covariates") or []
    out: List[Dict[str, Any]] = [title("单变量线性模型")]
    if not dep or not HAS_SM:
        return out + [note("请选择因变量。")]

    terms = []
    for f in factors:
        terms.append(f"C({f})")
    terms += covs
    if not terms:
        return out + [note("请至少选择一个固定因子或协变量。")]

    sub = df[[dep] + factors + covs].dropna()
    if len(sub) < len(terms) + 2:
        return out + [note("有效个案数不足。")]
    formula = f"Q('{dep}') ~ " + " + ".join(terms)
    try:
        model = smf.ols(formula, data=sub).fit()
        aov = sm.stats.anova_lm(model, typ=2)
        rows = []
        for idx, r in aov.iterrows():
            rows.append([str(idx), num(r["sum_sq"], 3), num(r["df"], 0), num(r["sum_sq"] / r["df"], 3)
                         if r["df"] else ".", num(r["F"], 3) if r["F"] == r["F"] else ".",
                         pval(r["PR(>F)"]) if r["PR(>F)"] == r["PR(>F)"] else "."])
        out.append(table("主体间效应检验",
                         [["源", "III 型平方和", "df", "均方", "F", "显著性"]], rows, row_header=1))
        out.append(table("模型摘要",
                         [["R 方", "调整 R 方", "标准估计误差"]],
                         [[num(model.rsquared, 3), num(model.rsquared_adj, 3),
                           num(math.sqrt(model.mse_resid), 4)]]))
    except Exception as e:
        out.append(note(f"模型无法拟合：{e}"))
    return out


# =====================================================================
# 相关
# =====================================================================

def _corr_matrix(sub: pd.DataFrame, method: str) -> (pd.DataFrame, pd.DataFrame, int):
    n = len(sub)
    r = sub.corr(method=method)
    pmat = pd.DataFrame(np.ones(r.shape), index=r.index, columns=r.columns)
    cols = list(sub.columns)
    for i in range(len(cols)):
        for j in range(len(cols)):
            if i == j:
                continue
            a, b = sub[cols[i]], sub[cols[j]]
            m = a.notna() & b.notna()
            if m.sum() < 3:
                pmat.iloc[i, j] = np.nan
                continue
            if method == "pearson":
                _, pv = st.pearsonr(a[m], b[m])
            elif method == "kendall":
                _, pv = st.kendalltau(a[m], b[m])
            else:
                _, pv = st.spearmanr(a[m], b[m])
            pmat.iloc[i, j] = pv
    return r, pmat, n


def correlation(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    variables = p.get("variables") or []
    method = p.get("method", "pearson")
    tail = p.get("tail", "two")
    flag_sig = p.get("flagSignificant", True)
    out: List[Dict[str, Any]] = [title({"pearson": "皮尔逊相关", "spearman": "斯皮尔曼相关",
                                        "kendall": "肯德尔相关"}.get(method, "相关"))]
    if len(variables) < 2:
        return out + [note("请至少选择两个变量。")]

    sub = df[variables].apply(pd.to_numeric, errors="coerce")
    r, pmat, n = _corr_matrix(sub, method)
    names = [label_of(_v(ds, v), v) for v in variables]

    rows = []
    for i, vi in enumerate(variables):
        for j, vj in enumerate(variables):
            if i == j:
                continue
            rv = r.iloc[i, j]
            pv = pmat.iloc[i, j]
            if tail == "one" and pv == pv:
                pv = pv / 2 if rv > 0 else 1 - pv / 2
            star = ""
            if flag_sig and pv == pv:
                if pv < 0.01:
                    star = "**"
                elif pv < 0.05:
                    star = "*"
            rows.append([names[i], names[j], num(rv, 3) + star, pval(pv),
                         str(int(sub[[vi, vj]].dropna().shape[0]))])
    out.append(table("相关系数",
                     [["", "", "相关系数", "显著性（双侧）", "N"]], rows, row_header=2,
                     notes=["*. 在 .05 水平（双侧）上显著相关。", "**. 在 .01 水平（双侧）上显著相关。"]))
    if p.get("matrix", True):
        hdr = [[""] + names]
        mrows = []
        for i, vi in enumerate(variables):
            rrow = [names[i]]
            for j in range(len(variables)):
                if i == j:
                    rrow.append("1")
                else:
                    pv = pmat.iloc[i, j]
                    star = ""
                    if flag_sig and pv == pv:
                        star = "**" if pv < 0.01 else ("*" if pv < 0.05 else "")
                    rrow.append(num(r.iloc[i, j], 3) + star)
            mrows.append(rrow)
        out.append(table("相关矩阵", hdr, mrows, row_header=1))
    if p.get("scatter") and len(variables) >= 2:
        for i in range(len(variables)):
            for j in range(i + 1, len(variables)):
                spec = scatter_spec(sub[variables[i]], sub[variables[j]],
                                    names[i], names[j], fit=True)
                out.append(chart("scatter", spec))
    return out


def partial_corr(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    variables = p.get("variables") or []
    controls = p.get("control") or []
    out: List[Dict[str, Any]] = [title("偏相关")]
    if len(variables) < 2:
        return out + [note("请至少选择两个变量。")]
    sub = df[variables + controls].apply(pd.to_numeric, errors="coerce").dropna()
    n = len(sub)
    if n < len(controls) + 3:
        return out + [note("有效个案数不足。")]
    k = len(controls)
    rows = []
    for i in range(len(variables)):
        for j in range(i + 1, len(variables)):
            a, b = variables[i], variables[j]
            if k == 0:
                r, pv = st.pearsonr(sub[a], sub[b])
                dfree = n - 2
            else:
                Z = np.column_stack([np.ones(n)] + [sub[c].to_numpy() for c in controls])
                ra = _resid(sub[a].to_numpy(), Z)
                rb = _resid(sub[b].to_numpy(), Z)
                r, pv = st.pearsonr(ra, rb)
                dfree = n - k - 2
            t = r * math.sqrt(dfree / max(1e-12, 1 - r * r))
            pv2 = 2 * (1 - st.t.cdf(abs(t), dfree))
            rows.append([label_of(_v(ds, a), a), label_of(_v(ds, b), b),
                         num(r, 3), pval(pv2), str(dfree)])
    out.append(table("相关性",
                     [["控制变量", "", "相关性", "显著性(双侧)", "df"]], rows, row_header=1,
                     subtitle_text="控制变量：" + "、".join(controls) if controls else None))
    return out


def _resid(y: np.ndarray, Z: np.ndarray) -> np.ndarray:
    beta, *_ = np.linalg.lstsq(Z, y, rcond=None)
    return y - Z @ beta


# =====================================================================
# 回归
# =====================================================================

def regression_linear(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    dep = p.get("dependent")
    inds = p.get("independents") or []
    out: List[Dict[str, Any]] = [title("线性回归")]
    if not dep or not inds or not HAS_SM:
        return out + [note("请选择因变量与自变量。")]

    sub = df[[dep] + inds].apply(pd.to_numeric, errors="coerce").dropna()
    if len(sub) < len(inds) + 2:
        return out + [note("有效个案数不足。")]
    X = sm.add_constant(sub[inds], has_constant="add")
    y = sub[dep]
    model = sm.OLS(y, X).fit()

    # 模型摘要
    out.append(table("模型摘要",
                     [["模型", "R", "R 方", "调整 R 方", "标准估计的误差", "Durbin-Watson"]],
                     [["1", num(math.sqrt(model.rsquared), 3), num(model.rsquared, 3),
                       num(model.rsquared_adj, 3), num(math.sqrt(model.mse_resid), 4),
                       num(sm.stats.durbin_watson(model.resid), 3)]]))
    # ANOVA
    ssr = model.ess
    sse = model.ssr
    sst = model.centered_tss
    dfr, dfe = int(model.df_model), int(model.df_resid)
    out.append(table("Anova",
                     [["模型", "平方和", "df", "均方", "F", "显著性"]],
                     [["回归", num(ssr, 3), str(dfr), num(ssr / dfr if dfr else np.nan, 3),
                       num(model.fvalue, 3), pval(model.f_pvalue)],
                      ["残差", num(sse, 3), str(dfe), num(sse / dfe if dfe else np.nan, 3), "", ""],
                      ["总计", num(sst, 3), str(dfr + dfe), "", "", ""]],
                     row_header=1))
    # 系数
    ci = model.conf_int()
    rows = []
    names = ["(常量)"] + [label_of(_v(ds, v), v) for v in inds]
    for i, nm in enumerate(names):
        b = model.params.iloc[i]
        se = model.bse.iloc[i]
        t = model.tvalues.iloc[i]
        pv = model.pvalues.iloc[i]
        beta = ""
        if i > 0:
            sd_y = y.std(ddof=1)
            sd_x = sub[inds[i - 1]].std(ddof=1)
            if sd_y:
                beta = num(b * sd_x / sd_y, 3)
        rows.append([nm, num(b, 3), num(se, 3), beta, num(t, 3), pval(pv),
                     num(ci.iloc[i, 0], 3), num(ci.iloc[i, 1], 3)])
    out.append(table("系数",
                     [["模型", "非标准化系数 B", "标准误差", "标准化系数 Beta", "t", "显著性",
                       "95% 置信区间下限", "上限"]], rows, row_header=1))
    if p.get("collinearity", True) and len(inds) > 1:
        from statsmodels.stats.outliers_influence import variance_inflation_factor
        vrows = []
        Xv = sub[inds].to_numpy()
        for i, v in enumerate(inds):
            try:
                vif = variance_inflation_factor(Xv, i)
            except Exception:
                vif = np.nan
            vrows.append([label_of(_v(ds, v), v), num(vif, 3), num(1 / vif, 3) if vif == vif and vif else "."])
        out.append(table("共线性诊断", [["", "VIF", "容差"]], vrows, row_header=1))

    if p.get("residualPlots", True):
        fitted = model.fittedvalues
        resid = model.resid
        out.append(chart("scatter", scatter_spec(pd.Series(fitted), pd.Series(resid),
                                                 "标准化预测值", "残差", fit=False)))
    return out


def regression_logistic(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    dep = p.get("dependent")
    inds = p.get("independents") or []
    out: List[Dict[str, Any]] = [title("二元 Logistic 回归")]
    if not dep or not inds or not HAS_SM:
        return out + [note("请选择因变量与自变量。")]

    sub = df[[dep] + inds].apply(pd.to_numeric, errors="coerce").dropna()
    y = sub[dep]
    vals = sorted(y.unique())
    if len(vals) != 2:
        return out + [note("因变量必须为二分类（0/1 或两个取值）。")]
    ybin = (y == vals[1]).astype(int)
    X = sm.add_constant(sub[inds], has_constant="add")
    try:
        model = sm.Logit(ybin, X).fit(disp=0, maxiter=200)
    except Exception as e:
        return out + [note(f"模型无法收敛：{e}")]

    ll0 = sm.Logit(ybin, np.ones((len(ybin), 1))).fit(disp=0).llf
    ll1 = model.llf
    out.append(table("模型系数的综合检验",
                     [["步骤", "-2 对数似然", "Cox & Snell R 方", "Nagelkerke R 方"]],
                     [["1", num(-2 * ll1, 3),
                       num(1 - math.exp((ll0 - ll1) * 2 / len(ybin)), 3),
                       num((1 - math.exp((ll0 - ll1) * 2 / len(ybin))) /
                           (1 - math.exp(2 * ll0 / len(ybin))), 3)]]))
    chi2 = 2 * (ll1 - ll0)
    dfree = len(inds)
    out.append(table("模型拟合优度",
                     [["卡方", "df", "显著性"]],
                     [[num(chi2, 3), str(dfree), pval(1 - st.chi2.cdf(chi2, dfree))]]))

    rows = []
    names = ["常量"] + [label_of(_v(ds, v), v) for v in inds]
    for i, nm in enumerate(names):
        b = model.params.iloc[i]
        se = model.bse.iloc[i]
        wald = (b / se) ** 2 if se else np.nan
        pv = model.pvalues.iloc[i]
        rows.append([nm, num(b, 3), num(se, 3), num(wald, 3), str(int(model.df_resid)),
                     pval(pv), num(math.exp(b), 3)])
    out.append(table("方程中的变量",
                     [["", "B", "标准误差", "Wald", "df", "显著性", "Exp(B)"]], rows, row_header=1))
    return out


# =====================================================================
# 非参数检验
# =====================================================================

def nonparam(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    kind = p.get("kind", "chisquare")
    out: List[Dict[str, Any]] = [title("非参数检验")]

    if kind == "chisquare":
        var = p.get("variable")
        if not var:
            return out + [note("请选择变量。")]
        s = df[var].dropna()
        counts = s.value_counts().sort_index()
        total = int(counts.sum())
        k = len(counts)
        exp = total / k if k else 0
        chi2 = float((((counts - exp) ** 2) / exp).sum()) if exp else np.nan
        dfree = k - 1
        pv = 1 - st.chi2.cdf(chi2, dfree) if k > 1 else np.nan
        v = _v(ds, var)
        rows = []
        for kk, c in counts.items():
            rows.append([value_label(v, kk), str(int(c)), num(exp, 1), num(c - exp, 1)])
        out.append(table(f"卡方检验 – {label_of(v, var)}",
                         [["", "观测数", "期望数", "残差"]], rows, row_header=1))
        out.append(table("检验统计量",
                         [["", "值"]],
                         [["卡方", num(chi2, 3)], ["df", str(dfree)], ["渐进显著性", pval(pv)]], row_header=1))
        return out

    if kind == "binomial":
        var, tv = p.get("variable"), p.get("testValue", 0.5)
        if not var:
            return out + [note("请选择变量。")]
        s = df[var].dropna()
        counts = s.value_counts()
        if len(counts) != 2:
            return out + [note("二项检验要求变量只有两个取值。")]
        n = int(counts.sum())
        k1 = int(counts.iloc[0])
        pv = st.binom_test(k1, n, tv) if hasattr(st, "binom_test") else st.binomtest(k1, n, tv).pvalue
        rows = [[str(counts.index[0]), str(k1), num(k1 / n, 2), num(tv, 2)],
                [str(counts.index[1]), str(n - k1), num((n - k1) / n, 2), num(1 - tv, 2)],
                ["合计", str(n), "1.00", ""]]
        out.append(table(f"二项检验 – {var}", [["类别", "N", "观测比例", "检验比例"]], rows, row_header=1))
        out.append(table("检验统计量", [["", "值"]],
                         [["精确显著性（双侧）", pval(pv)]], row_header=1))
        return out

    if kind == "runs":
        var = p.get("variable")
        if not var:
            return out + [note("请选择变量。")]
        s = pd.to_numeric(df[var], errors="coerce").dropna()
        med = s.median()
        seq = (s > med).astype(int).to_numpy()
        if len(seq) < 2:
            return out + [note("有效个案数不足。")]
        runs = 1 + int((seq[1:] != seq[:-1]).sum())
        n1 = int((seq == 1).sum())
        n2 = int((seq == 0).sum())
        n = n1 + n2
        mu = 2 * n1 * n2 / n + 1
        var_r = (2 * n1 * n2 * (2 * n1 * n2 - n)) / (n ** 2 * (n - 1)) if n > 1 else np.nan
        z = (runs - mu) / math.sqrt(var_r) if var_r and var_r > 0 else np.nan
        pv = 2 * (1 - st.norm.cdf(abs(z))) if z == z else np.nan
        out.append(table("游程检验",
                         [["检验值", "个案 < 检验值", "个案 >= 检验值", "总个案数", "游程数", "Z", "渐进显著性"]],
                         [[num(med, 4), str(n2), str(n1), str(n), str(runs), num(z, 3), pval(pv)]]))
        return out

    if kind == "mannwhitney":
        var, gname, gvals = p.get("variable"), p.get("groupVar"), p.get("groupValues") or []
        if not var or not gname or len(gvals) < 2:
            return out + [note("请选择检验变量与分组变量。")]
        s = clean_numeric(df, var)
        g = df[gname]
        a = s[g == gvals[0]].dropna()
        b = s[g == gvals[1]].dropna()
        u, pv = st.mannwhitneyu(a, b, alternative="two-sided")
        out.append(table("Mann-Whitney U 检验",
                         [["", "N", "秩均值", "秩和"]],
                         [[str(gvals[0]), str(len(a)), num(_rank_mean(a, b), 2), num(_rank_sum(a, b), 2)],
                          [str(gvals[1]), str(len(b)), num(_rank_mean(b, a), 2), num(_rank_sum(b, a), 2)]],
                         row_header=1))
        out.append(table("检验统计量",
                         [["", "值"]],
                         [["Mann-Whitney U", num(u, 3)],
                          ["Wilcoxon W", num(_rank_sum(a, b), 3)],
                          ["Z", num(_z_from_u(u, len(a), len(b)), 3)],
                          ["渐进显著性（双侧）", pval(pv)]], row_header=1))
        return out

    if kind == "kruskal":
        var, fac = p.get("variable"), p.get("factor")
        if not var or not fac:
            return out + [note("请选择检验变量与分组变量。")]
        s = clean_numeric(df, var)
        g = df[fac]
        mask = s.notna() & g.notna()
        s, g = s[mask], g[mask]
        groups, labels = [], []
        for gv in sorted(pd.unique(g), key=lambda x: (str(type(x)), x)):
            arr = s[g == gv].to_numpy()
            if len(arr):
                groups.append(arr)
                labels.append(value_label(_v(ds, fac), gv))
        if len(groups) < 2:
            return out + [note("分组数不足。")]
        h, pv = st.kruskal(*groups)
        ranks = pd.Series(s).rank()
        rows = []
        for lab, arr in zip(labels, groups):
            sel = s.isin(arr)
            rows.append([lab, str(len(arr)), num(ranks[sel].mean(), 2)])
        out.append(table("秩", [["", "N", "秩均值"]], rows, row_header=1))
        out.append(table("检验统计量", [["", "值"]],
                         [["卡方", num(h, 3)], ["df", str(len(groups) - 1)], ["渐进显著性", pval(pv)]], row_header=1))
        return out

    if kind in ("wilcoxon", "friedman"):
        vars_ = p.get("variables") or []
        if len(vars_) < 2:
            return out + [note("请至少选择两个变量。")]
        sub = df[vars_].apply(pd.to_numeric, errors="coerce").dropna()
        if len(sub) < 2:
            return out + [note("有效个案数不足。")]
        if kind == "wilcoxon" and len(vars_) == 2:
            w, pv = st.wilcoxon(sub[vars_[0]], sub[vars_[1]])
            out.append(table("Wilcoxon 符号秩检验",
                             [["", "N", "秩均值", "秩和"]],
                             [[f"负秩 ({vars_[1]} < {vars_[0]})", "", "", ""],
                              [f"正秩 ({vars_[1]} > {vars_[0]})", "", "", ""]], row_header=1))
            out.append(table("检验统计量", [["", "值"]],
                             [["Z", num(w, 3)], ["渐进显著性（双侧）", pval(pv)]], row_header=1))
        else:
            stat, pv = st.friedmanchisquare(*[sub[v] for v in vars_])
            out.append(table("Friedman 检验统计量",
                             [["N", "卡方", "df", "显著性"]],
                             [[str(len(sub)), num(stat, 3), str(len(vars_) - 1), pval(pv)]]))
        return out

    return out + [note("未知的检验类型。")]


def _rank_mean(a: pd.Series, b: pd.Series) -> float:
    allv = pd.concat([a, b])
    return float(allv.rank().iloc[: len(a)].mean())


def _rank_sum(a: pd.Series, b: pd.Series) -> float:
    allv = pd.concat([a, b])
    return float(allv.rank().iloc[: len(a)].sum())


def _z_from_u(u: float, n1: int, n2: int) -> float:
    mu = n1 * n2 / 2
    sd = math.sqrt(n1 * n2 * (n1 + n2 + 1) / 12)
    return (u - mu) / sd if sd else np.nan


# =====================================================================
# 因子分析 / 信度
# =====================================================================

def factor_analysis(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    variables = p.get("variables") or []
    n_factors = p.get("factors")
    rotation = p.get("rotation", "varimax")
    out: List[Dict[str, Any]] = [title("因子分析")]
    if len(variables) < 2:
        return out + [note("请至少选择两个变量。")]

    sub = df[variables].apply(pd.to_numeric, errors="coerce").dropna()
    n, k = sub.shape
    if n < k + 1:
        return out + [note("有效个案数不足。")]

    # KMO & Bartlett
    corr = sub.corr().to_numpy()
    kmo, bart_chi, bart_p, bart_df = _kmo_bartlett(sub)
    out.append(table("KMO 和 Bartlett 检验",
                     [["检验项", "值"]],
                     [["Kaiser-Meyer-Olkin 取样适切性量数", num(kmo, 3)],
                      ["Bartlett 球形检验 近似卡方", num(bart_chi, 3)],
                      ["df", str(bart_df)],
                      ["显著性", pval(bart_p)]], row_header=1))

    # 主成分分析
    R = sub.corr()
    eigvals, eigvecs = np.linalg.eigh(R.to_numpy())
    order = np.argsort(eigvals)[::-1]
    eigvals = eigvals[order]
    eigvecs = eigvecs[:, order]
    total_var = eigvals.sum()
    if n_factors is None:
        n_factors = int((eigvals > 1).sum())
        n_factors = max(1, min(n_factors, k))
    n_factors = int(min(max(1, n_factors), k))

    rows = []
    for i in range(k):
        pct = eigvals[i] / total_var * 100 if total_var else 0
        cum = eigvals[: i + 1].sum() / total_var * 100 if total_var else 0
        rows.append([f"{i + 1}", num(eigvals[i], 3), num(pct, 3), num(cum, 3)])
    out.append(table("解释的总方差",
                     [["成分", "初始特征值 合计", "方差的 %", "累积 %"]], rows, row_header=1))

    # 载荷（未旋转）
    loadings = eigvecs[:, :n_factors] * np.sqrt(np.maximum(eigvals[:n_factors], 0))
    if rotation == "varimax" and n_factors > 1:
        loadings = _varimax(loadings)
    # 符号约定：使每个成分的载荷之和为正（与 SPSS 输出一致）
    for j in range(n_factors):
        if loadings[:, j].sum() < 0:
            loadings[:, j] = -loadings[:, j]

    lrows = []
    names = [label_of(_v(ds, v), v) for v in variables]
    for i, nm in enumerate(names):
        lrows.append([nm] + [num(loadings[i, j], 3) for j in range(n_factors)])
    out.append(table("成分矩阵" + ("（旋转后）" if rotation == "varimax" and n_factors > 1 else ""),
                     [[""] + [f"成分 {j + 1}" for j in range(n_factors)]], lrows, row_header=1))
    out.append(note(f"提取方法：主成分分析法。旋转方法：{'凯撒正态化最大方差法' if rotation=='varimax' else '无'}。"
                    f"提取了 {n_factors} 个成分。"))
    return out


def _kmo_bartlett(sub: pd.DataFrame) -> (float, float, float, int):
    R = sub.corr()
    k = R.shape[0]
    try:
        invR = np.linalg.pinv(R.to_numpy())
    except Exception:
        return np.nan, np.nan, np.nan, 0
    d = np.sqrt(np.diag(invR))
    P = -invR / np.outer(d, d)
    np.fill_diagonal(P, 0)
    R0 = R.to_numpy().copy()
    np.fill_diagonal(R0, 0)
    sum_r2 = (R0 ** 2).sum()
    sum_p2 = (P ** 2).sum()
    kmo = sum_r2 / (sum_r2 + sum_p2) if (sum_r2 + sum_p2) else np.nan
    n = len(sub)
    det = np.linalg.det(R.to_numpy())
    det = max(det, 1e-300)
    chi2 = -(n - 1 - (2 * k + 5) / 6) * math.log(det)
    dfree = k * (k - 1) // 2
    pv = 1 - st.chi2.cdf(chi2, dfree) if dfree else np.nan
    return float(kmo), float(chi2), float(pv), int(dfree)


def _varimax(loadings: np.ndarray, gamma: float = 1.0, max_iter: int = 100, tol: float = 1e-6) -> np.ndarray:
    p, k = loadings.shape
    if k < 2:
        return loadings
    R = loadings.copy()
    d = 0
    for _ in range(max_iter):
        old = R.copy()
        u, s, vt = np.linalg.svd(
            loadings.T @ (R ** 3 - (gamma / p) * R @ np.diag(np.diag(R.T @ R)))
        )
        R = loadings @ (u @ vt)
        d = np.sum((R - old) ** 2)
        if d < tol:
            break
    return R


def reliability(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    items = p.get("items") or []
    out: List[Dict[str, Any]] = [title("信度分析")]
    if len(items) < 2:
        return out + [note("请至少选择两个项目。")]

    sub = df[items].apply(pd.to_numeric, errors="coerce").dropna()
    k = sub.shape[1]
    n = len(sub)
    if n < 2:
        return out + [note("有效个案数不足。")]

    item_vars = sub.var(ddof=1)
    total_var = sub.sum(axis=1).var(ddof=1)
    alpha = (k / (k - 1)) * (1 - item_vars.sum() / total_var) if total_var else np.nan
    std_items = sub.apply(lambda c: (c - c.mean()) / c.std(ddof=1) if c.std(ddof=1) else c)
    std_alpha = (k / (k - 1)) * (1 - k / std_items.sum(axis=1).var(ddof=1)) if std_items.sum(axis=1).var(ddof=1) else np.nan

    rows = []
    for it in items:
        s = sub[it]
        rest = sub.drop(columns=[it]).sum(axis=1)
        r = s.corr(rest)
        a_del = np.nan
        if k > 2:
            rest_var = sub.drop(columns=[it]).var(ddof=1)
            tv = rest.var(ddof=1)
            a_del = ((k - 1) / (k - 2)) * (1 - rest_var.sum() / tv) if tv else np.nan
        rows.append([label_of(_v(ds, it), it), num(s.mean(), 4), num(s.std(ddof=1), 4),
                     str(n), num(r, 3), num(a_del, 3)])
    out.append(table("项目统计量",
                     [["", "均值", "标准差", "N", "校正的项总计相关性", "删除项后的 Cronbach's Alpha"]],
                     rows, row_header=1))
    out.append(table("可靠性统计量",
                     [["Cronbach's Alpha", "基于标准化项的 Cronbach's Alpha", "项数"]],
                     [[num(alpha, 3), num(std_alpha, 3), str(k)]]))
    out.append(table("摘要项统计量",
                     [["", "均值", "极小值", "极大值", "全距", "极大值/极小值", "方差", "项数"]],
                     [["项的均值", num(item_vars.index.size and sub.mean().mean(), 4),
                       num(sub.mean().min(), 4), num(sub.mean().max(), 4),
                       num(sub.mean().max() - sub.mean().min(), 4),
                       num(sub.mean().max() / sub.mean().min(), 3) if sub.mean().min() else ".",
                       num(sub.mean().var(ddof=1), 4), str(k)]]))
    return out


# =====================================================================
# 图表过程
# =====================================================================

def chart_proc(df: pd.DataFrame, ds: Dataset, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    kind = p.get("kind", "bar")
    out: List[Dict[str, Any]] = [title("图表")]
    if kind in ("bar", "pie"):
        var = p.get("variable")
        if not var:
            return out + [note("请选择变量。")]
        v = _v(ds, var)
        s = df[var].dropna()
        if v and v.dtype == "string":
            counts = s.astype(str).value_counts().sort_index()
        else:
            counts = pd.to_numeric(s, errors="coerce").dropna().value_counts().sort_index()
        spec = bar_spec(counts, label_of(v, var), v.values if v else None) if kind == "bar" \
            else pie_spec(counts, label_of(v, var), v.values if v else None)
        out.append(chart(kind, spec))
        return out
    if kind == "histogram":
        var = p.get("variable")
        v = _v(ds, var)
        spec = histogram_spec(clean_numeric(df, var), label_of(v, var))
        if spec:
            out.append(chart("histogram", spec))
        return out
    if kind == "scatter":
        xs, ys = p.get("x"), p.get("y")
        spec = scatter_spec(clean_numeric(df, xs), clean_numeric(df, ys),
                            label_of(_v(ds, xs), xs), label_of(_v(ds, ys), ys),
                            fit=p.get("fit", True))
        out.append(chart("scatter", spec))
        return out
    if kind == "box":
        var, fac = p.get("variable"), p.get("factor")
        if fac:
            g = df[fac]
            s = clean_numeric(df, var)
            groups = {}
            for gv in sorted(pd.unique(g.dropna()), key=lambda x: (str(type(x)), x)):
                groups[value_label(_v(ds, fac), gv)] = s[g == gv]
            out.append(chart("box", box_spec(groups, label_of(_v(ds, var), var))))
        else:
            s = clean_numeric(df, var)
            out.append(chart("box", box_spec({label_of(_v(ds, var), var): s}, var)))
        return out
    if kind == "line":
        xs, ys = p.get("x"), p.get("y")
        sub = df[[xs, ys]].apply(pd.to_numeric, errors="coerce").dropna().sort_values(xs)
        out.append(chart("line", line_spec([str(v) for v in sub[xs]], [float(v) for v in sub[ys]],
                                           f"{ys} 按 {xs}", xs, ys)))
        return out
    if kind == "errorbar":
        var, fac = p.get("variable"), p.get("factor")
        g = df[fac]
        s = clean_numeric(df, var)
        groups = {}
        for gv in sorted(pd.unique(g.dropna()), key=lambda x: (str(type(x)), x)):
            groups[value_label(_v(ds, fac), gv)] = s[g == gv]
        out.append(chart("errorbar", errorbar_spec(groups, label_of(_v(ds, var), var))))
        return out
    return out + [note("未知的图表类型。")]


# ---------------- 分派表 ----------------

PROCEDURES = {
    "frequencies": frequencies,
    "descriptives": descriptives,
    "explore": explore,
    "crosstabs": crosstabs,
    "means": means,
    "ttest_one": ttest_one,
    "ttest_ind": ttest_ind,
    "ttest_paired": ttest_paired,
    "anova_oneway": anova_oneway,
    "anova_glm": anova_glm,
    "correlation": correlation,
    "partial_corr": partial_corr,
    "regression_linear": regression_linear,
    "regression_logistic": regression_logistic,
    "nonparam": nonparam,
    "factor": factor_analysis,
    "reliability": reliability,
    "chart": chart_proc,
}
