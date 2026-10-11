# 部署到自己的 Windows 服务器

本项目**自带 Windows 版 Python 运行时**（`runtime/`，421 MB，含 pandas / scipy /
statsmodels / scikit-learn / pyreadstat 等全部依赖）。所以部署到 Windows 服务器上
**不需要安装 Python、不需要 pip install、不需要联网**——把文件夹拷过去就能跑。

---

## 一、把项目复制到服务器

### 方式 A：打包传输（推荐）

在开发机上执行：

```bat
runtime\python\python.exe pack_deploy.py
```

会在 `dist\` 下生成 `SPSS_WEB_deploy_<日期>.zip`（约 130 MB，含 `runtime\`）。
把这个 zip 传到服务器，解压到任意目录，例如 `D:\SPSS_WEB\`。

### 方式 B：直接拷贝文件夹

用 RDP 剪贴板、共享目录或 `robocopy` 整体复制。**必须带上 `runtime\`**，否则服务器上跑不起来。

```bat
robocopy "\\开发机\共享\SPSS_WEB" "D:\SPSS_WEB" /E /COPYALL
```

> 建议放在**非系统盘**（如 `D:\SPSS_WEB`），避免系统盘权限策略干扰。
> 路径**不要含中文或空格**，能省掉一堆编码麻烦。

---

## 二、一键注册为「开机自启」服务

在服务器上，**以管理员身份**打开 PowerShell，`cd` 到项目目录：

```powershell
cd D:\SPSS_WEB
.\install_service.ps1 -Port 8300 -User admin -Pass '换成你自己的口令' -Start
```

或者直接**右键 `deploy.bat` → 以管理员身份运行**（它会自动请求提权并调用上面的脚本）。

脚本会依次完成 5 件事：

1. 校验 `runtime\python\python.exe` 存在且 10 项依赖可正常 import；
2. 写入配置文件 `.env`（监听地址、端口、是否启用口令）；
3. 注册计划任务 `SPSSWeb`——**开机自启、以 SYSTEM 身份运行、无需任何人登录**，
   启动失败自动重试 3 次；
4. 添加入站防火墙规则，放行 TCP 8300；
5. 启动服务并轮询 `/api/health` 确认就绪。

参数说明：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `-Port` | `8300` | 监听端口 |
| `-ListenAddress` | `0.0.0.0` | 监听地址；只给本机用可设 `127.0.0.1` |
| `-User` / `-Pass` | 空 | 同时设置才启用 HTTP Basic 认证 |
| `-NoFirewall` | — | 不自动加防火墙规则 |
| `-Start` | — | 注册后立即启动（不加则等下次开机） |
| `-Uninstall` | — | 卸载：停止并删除任务与防火墙规则 |

---

## 三、放行端口

### 1. Windows 防火墙

`install_service.ps1` 已自动放行。若要手动：

```powershell
New-NetFirewallRule -DisplayName "SPSS Web (8300)" -Direction Inbound `
  -Protocol TCP -LocalPort 8300 -Action Allow -Profile Any
```

### 2. 云厂商安全组（**最容易漏的一步**）

如果服务器在阿里云 / 腾讯云 / 华为云等，还需要在控制台的**安全组**里放行入站 TCP 8300。
只开 Windows 防火墙是访问不通的。

---

## 四、访问

| 场景 | 地址 |
| --- | --- |
| 服务器本机 | <http://127.0.0.1:8300> |
| 局域网 | `http://<服务器内网IP>:8300` |
| 公网 | `http://<服务器公网IP>:8300` |
| 绑定域名 | `http://你的域名:8300`（域名解析到公网 IP） |

---

## 五、务必设置访问口令

本系统**没有任何内置的用户体系**，不设口令就是完全公开的。设置方式：

```powershell
cd D:\SPSS_WEB
.\install_service.ps1 -User admin -Pass '你的强口令' -Start
```

重启服务后，浏览器会弹出标准的登录框。`/api/health` 不受口令保护，方便监控探活。

> 口令以明文写在项目目录的 `.env` 里。请确保该目录只有管理员可读，
> 或者干脆用下面的 IIS 反向代理 + HTTPS 方案。

### ⚠️ 多用户共享同一份数据

数据集存放在**服务进程的内存**中，而且是**所有访问者共享的同一份**：
A 打开的数据集，B 也能在数据集列表里看到。因此本系统适合
**个人使用或小团队内部工具**，不适合做成多租户的公开服务。

同时，服务重启后内存中的数据会全部丢失——需要留存的结果请及时导出为 CSV / Excel。

---

## 六、日常运维

```powershell
# 启动 / 停止
Start-ScheduledTask -TaskName SPSSWeb
Stop-ScheduledTask  -TaskName SPSSWeb

# 查看状态
Get-ScheduledTask   -TaskName SPSSWeb | Select-Object TaskName, State

# 看进程与端口
Get-Process python | Select-Object Id, ProcessName, WS
netstat -ano | findstr :8300

# 改端口后重新部署
.\install_service.ps1 -Port 9000 -Start

# 卸载
.\install_service.ps1 -Uninstall
```

内存占用：pandas + scipy + sklearn 常驻约 **300–500 MB**，建议服务器至少 2 GB 内存。

---

## 七、进阶：IIS 反向代理 + HTTPS

想用 80/443 端口、绑定域名、上 HTTPS 证书，可以用 IIS 反代到本服务。

1. 安装 IIS 组件 **URL Rewrite** 与 **Application Request Routing (ARR)**；
2. IIS 管理器 → 服务器节点 → **Application Request Routing Cache** → Server Proxy Settings
   → 勾选 **Enable proxy**；
3. 新建网站，把下面的 `web.config` 放到站点根目录：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="SPSS Web 反向代理" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://127.0.0.1:8300/{R:1}" />
        </rule>
      </rules>
    </rewrite>
    <proxy preserveHostHeader="false" />
  </system.webServer>
</configuration>
```

4. 在 IIS 里给站点绑定 443 端口并挂上证书。

反代做好后，可以把 `-ListenAddress` 设成 `127.0.0.1`，让服务只接受 IIS 转发。

---

## 八、其他平台

`Dockerfile` / `docker-compose.yml` 是给 **Linux 主机或容器平台**准备的
（镜像基于 `python:3.12-slim`，依赖由 pip 在镜像内安装，不含 `runtime/`）。
Windows 服务器用不上，保留是为了以后迁移方便。

```bash
docker compose up -d --build
```

Linux 裸机部署：

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
SPSS_WEB_HOST=0.0.0.0 SPSS_WEB_USER=admin SPSS_WEB_PASS='口令' python3 start.py
```

---

## 九、故障排查

| 现象 | 原因与处理 |
| --- | --- |
| 本机能开、外网打不开 | 云厂商**安全组**没放行；或服务器有多张网卡绑错地址 |
| 提示端口被占用 | `netstat -ano \| findstr :8300` 找到 PID，`taskkill /PID <pid> /F`；或换端口 |
| 浏览器一直转圈 | 首次启动要加载 pandas/scipy，约 3–5 秒；再等一会 |
| 中文显示成乱码 | 确认 `runtime\` 是完整复制的，且路径不含特殊字符 |
| 计划任务启动失败 | 手动执行 `D:\SPSS_WEB\runtime\python\python.exe start.py` 看报错 |
| 忘记口令 | 直接编辑 `D:\SPSS_WEB\.env`，或重新运行 `install_service.ps1` 覆盖 |

查看实时日志（前台运行，便于排查）：

```powershell
Stop-ScheduledTask -TaskName SPSSWeb
cd D:\SPSS_WEB
.\runtime\python\python.exe start.py
```
