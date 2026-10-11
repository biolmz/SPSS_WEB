"""SPSS 命令定义库（Command Reference）。

数据源：项目根目录 `syntax_xml/*.xml` —— 随 SPSS Statistics 分发的 328 份命令
定义（另有 1 份 `SyntaxSchema.xsd` 校验用 schema）。每份定义的结构为：

    <Command Name="FREQUENCIES" EndRequired="None" IsArbitrary="No" Language="Syntax">
      <Subcommand Name="STATISTICS" EqualsSign="Optional">
        <Parameter Name="MEAN" EqualsSign="None" ParameterType="Keyword">
          <EnumValue Name="REPLACE"/>

本模块把这些定义解析成内存索引，供三处使用：
  1. `/api/syntax/commands`  —— 命令参考浏览器（前端「帮助 → 语法参考」）
  2. `/api/syntax/complete`  —— 语法编辑器关键字自动补全
  3. `/api/syntax/check`     —— 语法静态检查（未知命令 / 未知子命令 / 未知关键字）
"""
from __future__ import annotations

import re
import threading
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .syntax import SUPPORTED

ROOT = Path(__file__).resolve().parent.parent
SYNTAX_XML_DIR = ROOT / "syntax_xml"

_LOCK = threading.Lock()
_INDEX: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------- 解析

def _parse_file(path: Path) -> Optional[Dict[str, Any]]:
    try:
        root = ET.parse(str(path)).getroot()
    except ET.ParseError:
        return None
    if root.tag.split("}")[-1] != "Command":
        return None

    name = (root.get("Name") or path.stem).strip().upper()
    subcommands: List[Dict[str, Any]] = []
    for sc in root.findall("{*}Subcommand"):
        params: List[Dict[str, Any]] = []
        for pm in sc.findall("{*}Parameter"):
            enums = [e.get("Name", "").strip()
                     for e in pm.findall("{*}EnumValue") if e.get("Name")]
            params.append({
                "name": (pm.get("Name") or "").strip(),
                "equals": pm.get("EqualsSign") or "None",
                "type": pm.get("ParameterType") or "",
                "enum": enums,
            })
        subcommands.append({
            "name": (sc.get("Name") or "").strip(),
            "equals": sc.get("EqualsSign") or "None",
            "occurrence": sc.get("Occurrence") or "",
            "params": params,
        })

    return {
        "name": name,
        "alias": (root.get("Alias") or "").strip(),
        "endRequired": root.get("EndRequired") or "",
        "isArbitrary": root.get("IsArbitrary") or "",
        "language": root.get("Language") or "",
        "endStatement": (root.get("EndStatement") or "").strip(),
        "subcommands": subcommands,
        "file": path.name,
    }


def _build_index() -> Dict[str, Any]:
    commands: Dict[str, Dict[str, Any]] = {}
    if SYNTAX_XML_DIR.exists():
        for path in sorted(SYNTAX_XML_DIR.glob("*.xml")):
            rec = _parse_file(path)
            if not rec:
                continue
            rec["supported"] = rec["name"] in SUPPORTED
            commands[rec["name"]] = rec

    # 别名 -> 主命令名
    aliases: Dict[str, str] = {}
    for cmd, rec in commands.items():
        if rec["alias"]:
            for a in re.split(r"[,\s]+", rec["alias"].upper()):
                if a and a not in commands:
                    aliases[a] = cmd

    # 扁平关键字表（子命令 + 参数 + 枚举值），用于全局补全兜底
    keywords: Dict[str, List[str]] = {}
    for cmd, rec in commands.items():
        words: List[str] = []
        for sc in rec["subcommands"]:
            if sc["name"]:
                words.append(sc["name"])
            for pm in sc["params"]:
                if pm["name"]:
                    words.append(pm["name"])
                words.extend(pm["enum"])
        keywords[cmd] = sorted(set(words))

    n_sub = sum(len(r["subcommands"]) for r in commands.values())
    n_par = sum(len(s["params"]) for r in commands.values() for s in r["subcommands"])
    n_enum = sum(len(p["enum"]) for r in commands.values() for s in r["subcommands"] for p in s["params"])

    return {
        "commands": commands,
        "aliases": aliases,
        "keywords": keywords,
        "stats": {
            "commands": len(commands),
            "subcommands": n_sub,
            "parameters": n_par,
            "enums": n_enum,
            "supported": sum(1 for r in commands.values() if r["supported"]),
            "source": str(SYNTAX_XML_DIR.name),
        },
    }


def index(force: bool = False) -> Dict[str, Any]:
    global _INDEX
    with _LOCK:
        if _INDEX is None or force:
            _INDEX = _build_index()
        return _INDEX


# ---------------------------------------------------------------- 查询

def stats() -> Dict[str, Any]:
    return dict(index()["stats"])


def list_commands(q: str = "", only_supported: bool = False) -> List[Dict[str, Any]]:
    """命令清单（按名称排序），可选按关键字过滤。"""
    idx = index()
    ql = (q or "").strip().upper()
    out: List[Dict[str, Any]] = []
    for name in sorted(idx["commands"]):
        rec = idx["commands"][name]
        if only_supported and not rec["supported"]:
            continue
        if ql and ql not in name:
            continue
        out.append({
            "name": name,
            "alias": rec["alias"],
            "supported": rec["supported"],
            "subcommands": len(rec["subcommands"]),
            "parameters": sum(len(s["params"]) for s in rec["subcommands"]),
            "endRequired": rec["endRequired"],
        })
    return out


def get_command(name: str) -> Optional[Dict[str, Any]]:
    idx = index()
    key = (name or "").strip().upper()
    key = idx["aliases"].get(key, key)
    return idx["commands"].get(key)


def _prefix_match(words: List[str], partial: str, limit: int = 40) -> List[str]:
    p = (partial or "").upper()
    if not p:
        return words[:limit]
    starts = [w for w in words if w.upper().startswith(p)]
    if len(starts) >= limit:
        return starts[:limit]
    rest = [w for w in words if p in w.upper() and w not in starts]
    return (starts + rest)[:limit]


# ---------------------------------------------------------------- 补全

def _current_command_segment(text: str) -> str:
    """取出光标所在的那条命令（未以句点结束的最后一段）。保留原始空白。"""
    body = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    parts = re.split(r"(?<=\.)(?=\s|$)", body)
    for seg in reversed(parts):
        if seg.strip() and not seg.strip().endswith("."):
            return seg
    return ""


def complete(text: str, offset: Optional[int] = None, limit: int = 40) -> Dict[str, Any]:
    """依据光标上下文给出补全候选。

    返回 {kind, partial, items:[{text,label,kind,detail}], command}
    kind ∈ command | subcommand | keyword | enum | none
    """
    idx = index()
    body = (text or "")[:offset] if offset is not None else (text or "")
    segment = _current_command_segment(body)

    # 光标所在「/ 分段」的文本，决定上下文
    chunks = segment.split("/")
    head = chunks[0].strip()
    tail = chunks[-1]
    in_sub = len(chunks) > 1

    # 正在敲的部分词：尾部连续的非空白字符（`=` 后同样适用）；
    # 若光标前是空白，说明正要开始一个新词，partial 为空。
    m = re.search(r"([A-Za-z_][\w]*)$", tail)
    partial = m.group(1) if m else ""

    head_words = head.split()
    cmd_name = head_words[0].upper() if head_words else ""

    def _cmd_items(part: str) -> List[Dict[str, Any]]:
        return [{"text": n, "label": n, "kind": "command",
                 "detail": ("已实现" if idx["commands"][n]["supported"] else "参考定义")}
                for n in _prefix_match(sorted(idx["commands"]), part, limit)]

    # ① 命令名补全：还没出现 `/`，且当前只在写第一个词
    if not in_sub:
        known = cmd_name in idx["commands"] or cmd_name in idx["aliases"]
        typing_cmd = len(head_words) <= 1 and not (known and body[-1:].isspace())
        if typing_cmd:
            return {"kind": "command", "partial": partial,
                    "items": _cmd_items(partial), "command": None}

    rec = idx["commands"].get(idx["aliases"].get(cmd_name, cmd_name))
    if not rec:
        # 命令名不完整或拼错 —— 回退为「最接近的命令名」
        items = _cmd_items(cmd_name)
        return {"kind": "command" if items else "none", "partial": cmd_name,
                "items": items, "command": cmd_name}

    # ② 子命令补全：刚敲了 `/`，且这一段的子命令名还没写完（段内只有 ≤1 个词）
    if in_sub and len(tail.split()) <= 1 and "=" not in tail:
        names = [s["name"] for s in rec["subcommands"] if s["name"]]
        items = [{"text": n, "label": n, "kind": "subcommand", "detail": "子命令"}
                 for n in _prefix_match(names, partial, limit)]
        if items:
            return {"kind": "subcommand", "partial": partial, "items": items, "command": cmd_name}

    # ③ 关键字 / 枚举值补全
    words: List[str] = []
    enums: Dict[str, List[str]] = {}
    for sc in rec["subcommands"]:
        if sc["name"]:
            words.append(sc["name"])
        for pm in sc["params"]:
            if pm["name"]:
                words.append(pm["name"])
            if pm["enum"]:
                enums[pm["name"].upper()] = pm["enum"]
                words.extend(pm["enum"])

    # `KEYWORD=` 之后优先补枚举值
    em = re.search(r"([A-Za-z_][\w]*)\s*=\s*([A-Za-z_]\w*)?$", tail)
    if em and em.group(1).upper() in enums:
        key = em.group(1).upper()
        part = em.group(2) or ""
        return {"kind": "enum", "partial": part,
                "items": [{"text": v, "label": v, "kind": "enum", "detail": key}
                          for v in _prefix_match(enums[key], part, limit)],
                "command": cmd_name}

    items = [{"text": w, "label": w, "kind": "keyword", "detail": cmd_name}
             for w in _prefix_match(sorted(set(words)), partial, limit)]
    return {"kind": "keyword", "partial": partial, "items": items, "command": cmd_name}


# ---------------------------------------------------------------- 检查

def _strip_comments(text: str) -> str:
    out = []
    for raw in (text or "").replace("\r\n", "\n").split("\n"):
        line = raw.strip()
        if not line or line.startswith("*") or line.upper().startswith("COMMENT"):
            continue
        out.append(line)
    return " ".join(out)


def check(text: str) -> Dict[str, Any]:
    """对语法做静态检查，逐条命令给出诊断。"""
    idx = index()
    body = _strip_comments(text)
    # 按句点切命令（保留句点）
    raw_cmds = [c.strip() for c in re.split(r"(?<=\.)(?=\s|$)", body) if c.strip()]
    diagnostics: List[Dict[str, Any]] = []
    n_ok = 0

    for raw in raw_cmds:
        cmd_body = raw[:-1] if raw.endswith(".") else raw
        m = re.match(r"^([A-Za-z][A-Za-z0-9]*)", cmd_body)
        if not m:
            continue
        name = m.group(1).upper()
        rec = idx["commands"].get(idx["aliases"].get(name, name))
        if not rec:
            diagnostics.append({"level": "error", "command": name, "message": f"未知命令：{name}"})
            continue

        subs = [p.strip() for p in cmd_body[m.end():].split("/") if p.strip()]
        known_sub = {s["name"].upper() for s in rec["subcommands"] if s["name"]}
        known_kw = set()
        for s in rec["subcommands"]:
            for pm in s["params"]:
                if pm["name"]:
                    known_kw.add(pm["name"].upper())
                known_kw.update(e.upper() for e in pm["enum"])
        # 子命令允许省略（SPSS 里首个子命令常写作位置参数），故只在带 `=` 时校验
        for sub in subs:
            key = sub.split("=")[0].strip().upper()
            key = key.split()[0].upper() if key else ""
            if not key:
                continue
            if key in known_sub or key in known_kw:
                continue
            if "=" in sub and key not in known_sub and key not in known_kw:
                diagnostics.append({
                    "level": "warn", "command": name,
                    "message": f"{name} 未定义子命令 / 关键字：{key}",
                })
        if rec["endRequired"] and rec["endRequired"].upper() not in ("NONE", ""):
            if not raw.endswith("."):
                diagnostics.append({"level": "warn", "command": name,
                                    "message": f"{name} 需要以句点结束"})
        n_ok += 1

    return {
        "ok": not any(d["level"] == "error" for d in diagnostics),
        "commands": len(raw_cmds),
        "known": n_ok,
        "diagnostics": diagnostics,
    }
