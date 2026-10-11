#!/usr/bin/env python
"""SPSS Web 统计分析平台 —— 启动脚本。

推荐直接双击项目根目录的 `启动.bat`：它使用项目内嵌的 Python 运行时
（`runtime/python/`），不需要机器上预装 Python，也不需要联网安装依赖。

用法：
    python start.py                       # 默认 127.0.0.1:8300
    set SPSS_WEB_PORT=9000 && python start.py

环境变量：
    PORT               云端平台注入的端口；设置后自动切到「部署模式」
                       （监听 0.0.0.0、不弹浏览器、端口冲突不再直接退出）
    SPSS_WEB_HOST      监听地址，默认 127.0.0.1（部署模式为 0.0.0.0）
    SPSS_WEB_PORT      监听端口，默认 8300
    SPSS_WEB_NO_OPEN   设为 1 时不自动打开浏览器
    SPSS_WEB_USER      访问账号（与 SPSS_WEB_PASS 同时设置才启用 HTTP Basic 认证）
    SPSS_WEB_PASS      访问口令

上面这些也可以写进项目根目录的 `.env`（或 `config.env`），格式为 `KEY=VALUE` 每行一条。
真实环境变量优先级高于文件，因此临时覆盖很方便。
"""
from __future__ import annotations

import os
import socket
import sys
import threading
import time
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
# 保证相对路径（web/、samples/）在任何工作目录下都能正确解析
os.chdir(ROOT)
sys.path.insert(0, ROOT)


def load_env_file(path: str) -> None:
    """把 .env / config.env 读进环境变量；已存在的环境变量优先，不被覆盖。"""
    if not os.path.exists(path):
        return
    try:
        with open(path, "r", encoding="utf-8-sig") as fh:
            for raw in fh:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = val
    except OSError:
        pass


for _fname in (".env", "config.env"):
    load_env_file(os.path.join(ROOT, _fname))

# 云端平台（Docker / PaaS / 发布沙箱）会注入 PORT，并要求监听 0.0.0.0。
# 本地双击启动时没有 PORT，保持原来的 127.0.0.1:8300 行为不变。
CLOUD = bool(os.environ.get("PORT"))

HOST = os.environ.get("SPSS_WEB_HOST", "0.0.0.0" if CLOUD else "127.0.0.1")
PORT = int(os.environ.get("PORT") or os.environ.get("SPSS_WEB_PORT") or "8300")

BANNER = r"""
  ____  ____  ____  ____    __        __   _
 / ___||  _ \/ ___||  _ \   \ \      / /__| |__
 \___ \| |_) \___ \| |_) |   \ \ /\ / / _ \ '_ \
  ___) |  __/ ___) |  __/     \ V  V /  __/ |_) |
 |____/|_|  |____/ |_|         \_/\_/ \___|_.__/

 SPSS Web 统计分析平台 —— 参考 IBM SPSS Statistics 交互方式构建
"""

REQUIRED = [
    ("fastapi", "fastapi"),
    ("uvicorn", "uvicorn"),
    ("pandas", "pandas"),
    ("numpy", "numpy"),
    ("scipy", "scipy"),
    ("statsmodels", "statsmodels"),
    ("sklearn", "scikit-learn"),
    ("openpyxl", "openpyxl"),
    ("multipart", "python-multipart"),
    ("pyreadstat", "pyreadstat"),
]

PYEXE = os.path.join(ROOT, "runtime", "python", "python.exe" if os.name == "nt" else "bin/python")


def check_deps() -> bool:
    missing = []
    for mod, pkg in REQUIRED:
        try:
            __import__(mod)
        except ImportError:
            missing.append(pkg)
    if missing:
        print("  缺少以下依赖：", ", ".join(missing))
        print()
        if os.path.exists(PYEXE):
            print("  本项目自带完整的 Python 运行环境，请改用下面任一方式启动：")
            print("    · 双击项目根目录的  启动.bat")
            print(f"    · 或执行  \"{PYEXE}\" start.py")
        else:
            print("  当前解释器缺少依赖，请先安装：")
            print("    pip install -r requirements.txt")
        print()
        return False
    return True


def port_available(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        try:
            s.bind((host, port))
            return True
        except OSError:
            return False


def open_browser_when_ready(url: str, host: str, port: int):
    """轮询端口，等服务真正起来再打开浏览器。"""
    if os.environ.get("SPSS_WEB_NO_OPEN") == "1":
        return
    for _ in range(100):
        time.sleep(0.3)
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.3)
            if s.connect_ex((host, port)) == 0:
                break
    try:
        webbrowser.open(url)
    except Exception:
        pass


def sample_count() -> int:
    try:
        from backend.samples import list_samples
        return len(list_samples())
    except Exception:
        return 0


def main() -> None:
    print(BANNER)
    print(f"  运行环境： {sys.executable}")
    print(f"  项目目录： {ROOT}")

    if not check_deps():
        sys.exit(1)

    n = sample_count()
    if n:
        print(f"  示例数据： {n} 个 SPSS 自带数据集（.sav）")

    if not port_available(HOST, PORT):
        print()
        print(f"  [提示] 端口 {PORT} 已被占用。")
        print(f"         如果服务已经在运行，直接访问 http://{HOST}:{PORT} 即可；")
        print(f"         否则请先关闭占用该端口的程序，或换一个端口：")
        print(f"           set SPSS_WEB_PORT=9000 然后重新双击 启动.bat")
        print()
        sys.exit(2)

    import uvicorn

    url = f"http://{HOST}:{PORT}"
    print(f"  服务地址： {url}")
    print("  启动完成后浏览器会自动打开；按 Ctrl+C 或直接关闭窗口即可停止服务")
    print()

    threading.Thread(target=open_browser_when_ready, args=(url, HOST, PORT), daemon=True).start()

    uvicorn.run("backend.main:app", host=HOST, port=PORT, reload=False, log_level="info")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n  服务已停止。")
