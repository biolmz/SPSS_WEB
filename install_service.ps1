<#
    SPSS Web 统计分析平台 —— Windows 服务器部署脚本

    把本项目注册为「开机自启、以 SYSTEM 身份常驻」的计划任务，
    并放行防火墙端口，使局域网 / 公网可以直接访问。

    在服务器上以【管理员身份】打开 PowerShell，cd 到本项目目录后执行：

        .\install_service.ps1 -Port 8300 -User admin -Pass '你的口令'

    常用参数：
        -Port 8300          监听端口
        -ListenAddress      监听地址，默认 0.0.0.0（对外可访问）
        -User / -Pass       访问账号口令，同时设置才启用 HTTP Basic 认证
        -NoFirewall         不自动添加防火墙规则
        -Start              注册后立即启动
        -Uninstall          卸载：停止并删除任务与防火墙规则

    查看状态：  Get-ScheduledTask -TaskName SPSSWeb
    查看日志：  Start-ScheduledTask 启动的进程没有控制台窗口，日志见项目目录 server.log
#>
[CmdletBinding()]
param(
    [int]$Port = 8300,
    [string]$ListenAddress = "0.0.0.0",
    [string]$User = "",
    [string]$Pass = "",
    [string]$TaskName = "SPSSWeb",
    [switch]$NoFirewall,
    [switch]$Start,
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

function Write-Head($text) {
    Write-Host ""
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host ("  " + ("-" * 60)) -ForegroundColor DarkGray
}

function Write-Ok($text)    { Write-Host "  [OK]   $text" -ForegroundColor Green }
function Write-Warn2($text) { Write-Host "  [警告] $text" -ForegroundColor Yellow }
function Write-Err($text)   { Write-Host "  [错误] $text" -ForegroundColor Red }

# ---- 必须以管理员身份运行
$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Err "请以【管理员身份】运行 PowerShell 后再执行本脚本。"
    exit 1
}

$Root = $PSScriptRoot
if ([string]::IsNullOrEmpty($Root)) { $Root = (Get-Location).Path }
$PythonExe = Join-Path $Root "runtime\python\python.exe"
$EnvFile   = Join-Path $Root ".env"
$LogFile   = Join-Path $Root "server.log"
$FwName    = "SPSS Web ($Port)"

Write-Host ""
Write-Host "  SPSS Web 统计分析平台 —— Windows 服务器部署" -ForegroundColor White
Write-Host "  项目目录： $Root" -ForegroundColor DarkGray

# ============================================================ 卸载
if ($Uninstall) {
    Write-Head "卸载"

    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($task) {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Ok "已删除计划任务 $TaskName"
    } else {
        Write-Warn2 "未找到计划任务 $TaskName，跳过"
    }

    $rule = Get-NetFirewallRule -DisplayName $FwName -ErrorAction SilentlyContinue
    if ($rule) {
        Remove-NetFirewallRule -DisplayName $FwName
        Write-Ok "已删除防火墙规则 $FwName"
    } else {
        Write-Warn2 "未找到防火墙规则 $FwName，跳过"
    }

    Write-Host ""
    Write-Host "  卸载完成。项目文件与 .env 未删除。" -ForegroundColor Green
    Write-Host ""
    exit 0
}

# ============================================================ 1. 检查内嵌运行时
Write-Head "1. 检查内嵌 Python 运行时"

if (-not (Test-Path $PythonExe)) {
    Write-Err "未找到内嵌运行时：$PythonExe"
    Write-Host "  本项目自带 Windows 版 Python 运行时，请确认 runtime\ 目录已一并复制到服务器。" -ForegroundColor DarkGray
    exit 1
}
Write-Ok "找到 $PythonExe"

$probe = & $PythonExe -c "import fastapi,uvicorn,pandas,numpy,scipy,statsmodels,sklearn,openpyxl,multipart,pyreadstat; print('ok')" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Err "内嵌运行时依赖不完整或已损坏："
    Write-Host "  $probe" -ForegroundColor DarkGray
    exit 1
}
Write-Ok "依赖检查通过（fastapi / pandas / scipy / sklearn / pyreadstat 等 10 项）"

# ============================================================ 2. 写入配置文件
Write-Head "2. 写入配置文件 .env"

$lines = @()
$lines += "# 由 install_service.ps1 生成于 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$lines += "SPSS_WEB_HOST=$ListenAddress"
$lines += "SPSS_WEB_PORT=$Port"
$lines += "SPSS_WEB_NO_OPEN=1"
if ($User -and $Pass) {
    $lines += "SPSS_WEB_USER=$User"
    $lines += "SPSS_WEB_PASS=$Pass"
}

Set-Content -Path $EnvFile -Value $lines -Encoding UTF8
Write-Ok "已写入 $EnvFile"

if ($User -and $Pass) {
    Write-Ok "已启用 HTTP Basic 认证，账号：$User"
} else {
    Write-Warn2 "未设置访问账号口令 —— 任何能访问到该端口的人都能使用本系统"
    Write-Host "         如需开启认证：.\install_service.ps1 -User admin -Pass '你的口令'" -ForegroundColor DarkGray
}

# ============================================================ 3. 注册计划任务
Write-Head "3. 注册计划任务（开机自启 / SYSTEM 身份 / 无需登录）"

$action = New-ScheduledTaskAction -Execute $PythonExe -Argument "start.py" -WorkingDirectory $Root
$trigger = New-ScheduledTaskTrigger -AtStartup
$taskPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $taskPrincipal -Settings $settings -Force -Description "SPSS Web 统计分析平台（端口 $Port）" | Out-Null

Write-Ok "计划任务 $TaskName 已注册（启动失败会自动重试 3 次）"

# ============================================================ 4. 防火墙
Write-Head "4. 防火墙"

if ($NoFirewall) {
    Write-Warn2 "已按 -NoFirewall 跳过防火墙配置"
} else {
    $rule = Get-NetFirewallRule -DisplayName $FwName -ErrorAction SilentlyContinue
    if ($rule) {
        Set-NetFirewallRule -DisplayName $FwName -Enabled True -Action Allow | Out-Null
        Write-Ok "防火墙规则 $FwName 已存在，已确保启用"
    } else {
        New-NetFirewallRule -DisplayName $FwName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Any | Out-Null
        Write-Ok "已放行入站 TCP $Port"
    }
}

# ============================================================ 5. 启动
Write-Head "5. 启动服务"

if ($Start) {
    Start-ScheduledTask -TaskName $TaskName
    Write-Host "  正在启动，等待服务就绪 ..." -ForegroundColor DarkGray
    $ready = $false
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 750
        try {
            $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 3
            if ($r.StatusCode -eq 200) { $ready = $true; break }
        } catch { }
    }
    if ($ready) {
        Write-Ok "服务已就绪：http://127.0.0.1:$Port/api/health"
    } else {
        Write-Warn2 "等待超时，服务可能仍在启动。请查看 $LogFile 或稍后手动重试。"
    }
} else {
    Write-Host "  未指定 -Start，服务将在下次开机时自动启动。" -ForegroundColor DarkGray
    Write-Host "  立即启动： Start-ScheduledTask -TaskName $TaskName" -ForegroundColor DarkGray
}

# ============================================================ 汇总
Write-Head "部署完成"
Write-Host "  监听地址： http://$ListenAddress`:$Port" -ForegroundColor White
Write-Host "  本机访问： http://127.0.0.1:$Port" -ForegroundColor Gray
Write-Host "  对外访问： http://<服务器公网IP或域名>:$Port" -ForegroundColor Gray
Write-Host ""
Write-Host "  常用命令：" -ForegroundColor DarkGray
Write-Host "    启动   Start-ScheduledTask -TaskName $TaskName" -ForegroundColor DarkGray
Write-Host "    停止   Stop-ScheduledTask  -TaskName $TaskName" -ForegroundColor DarkGray
Write-Host "    状态   Get-ScheduledTask   -TaskName $TaskName" -ForegroundColor DarkGray
Write-Host "    卸载   .\install_service.ps1 -Uninstall" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  提示：若从公网访问，还需在云厂商控制台的【安全组】里放行 TCP $Port。" -ForegroundColor Yellow
Write-Host ""
