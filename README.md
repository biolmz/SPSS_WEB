# SPSS Web 统计分析平台

一个参考 **IBM SPSS Statistics** 交互方式构建的 Web 版统计分析工具。前端复刻了 SPSS 的
「数据编辑器 + 输出查看器 + 语法编辑器」多窗口工作流，后端用 Python 完成全部统计计算。

**开箱即用：项目自带完整的 Python 运行环境（`runtime/`），目标机器无需安装 Python、Node 或任何依赖。**

## 快速开始

**Windows：双击 `启动.bat`**

就这么简单。启动器会做三件事：

1. 检查项目内嵌的 Python 运行时（`runtime\python\python.exe`）与依赖；
2. 以 8300 端口拉起后端服务；
3. 服务就绪后自动打开浏览器。

控制台窗口保持打开即表示服务在运行，**关闭该窗口即停止服务**。

> 首次启动约 3–5 秒（Python 需加载 pandas / scipy 等科学计算库）。

**macOS / Linux：**

```bash
./启动.sh
```

**其他启动方式（可选）：**

```bash
npm start          # Node 启动器，会优先使用项目内嵌运行时
node server.js
runtime\python\python.exe start.py     # 直接用内嵌 Python
```

服务默认监听 **<http://127.0.0.1:8300>**。

### 启动器做了什么

`启动.bat` 直接调用项目内嵌的 `runtime\python\python.exe`，**不探测、也不依赖系统 Python**。
`server.js` 的探测顺序为：`SPSS_WEB_PYTHON` 环境变量 → 项目内嵌运行时 → 项目 `.venv` →
系统已装好依赖的 Python；全都没有时才会创建 `.venv` 并联网安装依赖。

## 部署到服务器

项目自带 **Windows 版 Python 运行时**，所以部署到 Windows 服务器上
**不需要装 Python、不需要 pip install、不需要联网**，拷过去就能跑。

```powershell
# 服务器上以管理员身份执行（或右键 deploy.bat → 以管理员身份运行）
cd D:\SPSS_WEB
.\install_service.ps1 -Port 8300 -User admin -Pass '你的口令' -Start
```

脚本会注册一个**开机自启、以 SYSTEM 身份常驻、无需登录**的计划任务 `SPSSWeb`，
自动放行防火墙端口，并等待服务就绪。之后用 `http://<服务器公网IP>:8300` 即可访问。

> 别忘了在云厂商控制台的**安全组**里也放行 TCP 8300 —— 这是最容易漏的一步。

完整说明（打包传输、IIS 反向代理 + HTTPS、Docker、故障排查）见 **[DEPLOY.md](DEPLOY.md)**。

### 可配置项

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `SPSS_WEB_HOST` | `127.0.0.1` | 监听地址（部署时用 `0.0.0.0`） |
| `SPSS_WEB_PORT` | `8300` | 监听端口 |
| `PORT` | — | 平台注入的端口；设置后自动切到部署模式（监听 `0.0.0.0`、不弹浏览器） |
| `SPSS_WEB_USER` | — | 访问账号，与 `SPSS_WEB_PASS` 同时设置才启用 HTTP Basic 认证 |
| `SPSS_WEB_PASS` | — | 访问口令 |
| `SPSS_WEB_NO_OPEN` | — | 设为 `1` 时不自动打开浏览器 |
| `SPSS_WEB_PYTHON` | 自动探测 | 指定 Python 解释器路径（仅 Node 启动器用） |

这些也可以写进项目根目录的 `.env`（或 `config.env`），每行 `KEY=VALUE`；
真实环境变量优先级高于文件。

```bash
# 换端口启动
set SPSS_WEB_PORT=9000 && 启动.bat     # Windows CMD
SPSS_WEB_PORT=9000 npm start           # macOS / Linux
```

## 技术栈

| 层 | 技术 |
| --- | --- |
| 运行时 | **项目内嵌 Python 3.13（`runtime/python/`，约 421 MB，含全部科学计算库）** |
| 启动器 | `启动.bat`（Windows）· `启动.sh`（macOS/Linux）· `server.js`（Node，可选） |
| 后端 | FastAPI · Uvicorn |
| 统计计算 | pandas · NumPy · SciPy · statsmodels · scikit-learn |
| 文件读写 | openpyxl（Excel）· pyreadstat（SPSS .sav） |
| 语法定义 | 328 份 SPSS 命令定义 XML（`syntax_xml/`），解析后用于语法参考 / 补全 / 检查 |
| 前端 | 原生 JavaScript（无构建步骤）· 手写 SVG 图表（零外部依赖） |

## 目录结构

```
SPSS_WEB/
├── 启动.bat            双击启动（Windows，使用内嵌运行时）
├── 启动.sh             macOS / Linux 启动
├── deploy.bat          一键部署到 Windows 服务器（右键以管理员身份运行）
├── install_service.ps1 注册开机自启计划任务 + 放行防火墙（见 DEPLOY.md）
├── pack_deploy.py      打包部署包（dist/*.zip），打包后自动解压自校验
├── start.py            Python 启动脚本（bat 调用它；支持 .env 配置）
├── server.js           Node 启动器（可选，默认 8300 端口）
├── Dockerfile          Linux / 容器部署（Windows 服务器用不到，备选）
├── docker-compose.yml
├── DEPLOY.md           部署文档：Windows 服务器 / IIS 反代 / Docker / 排查
├── runtime/
│   └── python/         内嵌 Python 3.13 运行时 + 全部依赖（无需外部环境）
├── samples/            120 个 SPSS 自带示例数据集（.sav，简体中文版）
├── syntax_xml/         328 份 SPSS 命令定义 XML + SyntaxSchema.xsd
├── docs/
│   └── syntaxreference.pdf   IBM SPSS Statistics 官方语法参考手册
├── backend/
│   ├── main.py         FastAPI 应用与全部 REST 接口（含可选 HTTP Basic 认证）
│   ├── store.py        数据集 / 变量元数据 / 导入导出
│   ├── samples.py      SPSS 示例数据（.sav）读取与元数据还原
│   ├── syntaxref.py    命令定义库：解析 syntax_xml，提供参考 / 补全 / 校验
│   ├── procedures.py   统计过程库（20+ 个分析过程）
│   ├── transforms.py   数据转换（计算、重编码、排序、汇总…）
│   ├── syntax.py       SPSS 语法解析与执行
│   └── output.py       输出块构造与统计辅助函数
├── web/
│   ├── index.html      应用骨架（仅一个 #windows 容器 + 模态层）
│   ├── css/app.css     SPSS 风格界面样式
│   └── js/
│       ├── icons.js    手绘 SVG 图标库（工具栏纯图标）
│       ├── charts.js   8 种 SVG 图表渲染器
│       ├── api.js      后端接口封装
│       ├── grid.js     数据视图 / 变量视图网格
│       ├── output.js   输出查看器与大纲树
│       ├── dialogs.js  全部分析 / 转换对话框
│       ├── menus.js    菜单栏渲染器（访问键 / 复选 / 二级菜单 / 下拉对齐）
│       ├── windows.js  多窗口管理器（数据编辑器 / 输出查看器 / 语法编辑器）
│       └── app.js      窗口注册、11 项菜单、工具栏、语法补全、状态管理
├── smoke_test.py       后端冒烟测试（68 项）
├── devtools_shot.py    浏览器端交互测试 + 截图（98 项）
└── requirements.txt    （仅重建运行时 / 非 Windows 部署时需要）
```

> **`runtime/`、`samples/`、`syntax_xml/` 与 `docs/` 必须随程序一起分发**，
> 删掉 `runtime/` 后 `启动.bat` 会报错退出；删掉 `syntax_xml/` 后语法参考与补全会降级为空。
>
> `.env` 里可能存放访问口令，**不要**把它打进分发包（`pack_deploy.py` 已自动排除）。

## 界面（对照 IBM SPSS Statistics 27 还原）

界面不是常见的「左右分栏」网页布局，而是按 SPSS 的真实结构做的**多窗口**模型：

- **窗口模型**：数据编辑器 / 输出查看器 / 语法编辑器各自是一个独立窗口，同一时刻只显示一个，
  用「窗口(W)」菜单切换。运行分析后自动切到输出查看器（与 SPSS 行为一致）。
- **菜单栏 11 项**并带访问键：文件(F) 编辑(E) 查看(V) 数据(D) 转换(T) 分析(A) 图形(G) 实用程序(U) 扩展(X) 窗口(W) 帮助(H)。
- **工具栏为纯图标**（无文字按钮）：打开 / 保存 / 打印 / 撤销 / 重做 / 转至个案 / 查找 / 变量列表 /
  查看值 / 插入个案 / 插入变量 / 删除变量 / 加权 / 选择个案 / 拆分文件 / 查找变量。
- **单元格引用条**：显示 `行号 : 变量标签`，右侧显示「可视：N/M 个变量」。
- **数据网格**：行号列与表头固定（sticky），无变量的空白编辑器会显示占位「变量」列；
  「查看 → 显示值标签」打开时，单元格按值标签显示（如 `1` → `男`）。
- **视图标签在窗口底部**：`数据视图` / `变量视图`，与 SPSS 位置一致。
- **状态栏**：左侧为运行状态与筛选 / 拆分 / 加权标记，右侧固定为
  `IBM SPSS Statistics 处理器就绪 ✔　Unicode: 开`。

## 功能一览

### 数据管理
- **数据视图**：类电子表格的个案编辑器，点击单元格即可修改，行号点击选中
- **变量视图**：名称 / 类型 / 宽度 / 小数位 / 标签 / 值标签 / 缺失值 / 列宽 / 对齐 / 测量尺度 / 角色
- **导入**：CSV、TXT、TSV、Excel（xlsx/xls）、SPSS（.sav）
- **导出**：CSV、Excel
- **转换**：计算变量、重新编码为不同变量、自动重新编码、排序个案、选择个案（条件 / 随机 / 范围）、拆分文件、加权个案、汇总数据、转置
- 值标签与用户缺失值定义（缺失值在分析中自动按缺失处理）

### 描述统计
- 频率（含均值 / 中位数 / 众数 / 标准差 / 偏度 / 峰度 / 百分位数 + 条形图 / 饼图 / 直方图）
- 描述（含均值、标准差、方差、全距、极值、合计、标准误、偏度、峰度）
- 探索（描述、正态性检验 Shapiro-Wilk / K-S、分组描述、箱线图、直方图、Q-Q 图）
- 交叉表（实测 / 期望 / 行百分比 / 列百分比 / 总计百分比 + 卡方检验 + Phi & Cramer's V）
- 均值（分层均值、误差条形图）

### 均值比较
- 单样本 T 检验（含 95% 置信区间）
- 独立样本 T 检验（含 Levene 方差齐性检验、方差相等与不等两种结果）
- 配对样本 T 检验（成对统计量、相关系数、检验表）
- 单因素方差分析（描述、方差齐性、ANOVA 表、LSD 事后多重比较、均值图）
- 单变量一般线性模型（固定因子 + 协变量，III 型平方和）

### 相关与回归
- 双变量相关：Pearson / Spearman / Kendall，相关系数表 + 相关矩阵 + 散点图 + 显著性标记
- 偏相关（可指定多个控制变量）
- 线性回归：模型摘要（R、R²、调整 R²、Durbin-Watson）、ANOVA、系数表（含标准化 Beta、95% CI）、共线性诊断（VIF / 容差）、残差图
- 二元 Logistic 回归：模型系数综合检验、拟合优度、方程中的变量（B、Wald、Exp(B)）

### 非参数检验
卡方检验、二项检验、游程检验、Mann-Whitney U、Kruskal-Wallis H、Wilcoxon 符号秩、Friedman

### 降维与信度
- 因子分析：KMO 与 Bartlett 球形检验、解释的总方差、主成分载荷矩阵、Varimax 旋转
- 可靠性分析：Cronbach's Alpha（含标准化 Alpha）、项目统计量、删除项后的 Alpha

### 图表
条形图、饼图、直方图（含正态曲线叠加）、散点图（含回归拟合线与分组）、箱线图（含离群值）、折线图、Q-Q 图、误差条形图 —— 全部由前端手写 SVG 渲染。

### SPSS 语法编辑器
支持命令式语法，每条命令以英文句点结尾：

```
FREQUENCIES VARIABLES=satisfaction engagement
  /STATISTICS=MEAN MEDIAN STDDEV
  /BARCHART.

CROSSTABS /TABLES=gender BY dept /STATISTICS=CHISQ /CELLS=COUNT ROW COLUMN.

T-TEST GROUPS=gender(1 2) /VARIABLES=salary.

ONEWAY salary BY dept /STATISTICS=DESCRIPTIVES /POSTHOC=LSD.

REGRESSION /DEPENDENT=engagement /METHOD=ENTER satisfaction overtime.

COMPUTE avg_score = mean(q1, q2, q3, q4, q5).

SORT CASES BY salary (D).
SELECT IF (salary > 8000).
```

已支持：`FREQUENCIES` `DESCRIPTIVES` `CROSSTABS` `MEANS` `EXAMINE` `T-TEST` `ONEWAY`
`CORRELATIONS` `REGRESSION` `LOGISTIC REGRESSION` `NPAR TESTS` `FACTOR` `RELIABILITY`
`COMPUTE` `RECODE` `SORT CASES` `SELECT IF` `FILTER` `USE` `SPLIT FILE` `WEIGHT` `AGGREGATE`
`VARIABLE LABELS` `VARIABLE LEVEL` `VALUE LABELS` `MISSING VALUES` `GRAPH` `LIST`（共 28 条）

### 语法命令定义库（`syntax_xml/`）

项目根目录的 `syntax_xml/` 收录了 **328 份 SPSS 命令定义 XML**（另有 1 份 `SyntaxSchema.xsd`
校验用 schema）。后端 `backend/syntaxref.py` 把它们解析成内存索引，规模为：

| 项目 | 数量 |
| --- | --- |
| 命令 Command | 328 |
| 子命令 Subcommand | 2054 |
| 参数 Parameter | 6608 |
| 枚举值 EnumValue | 3829 |
| 本平台已实现 | 28 |

定义结构为 `Command → Subcommand → Parameter → EnumValue`，例如：

```xml
<Command Name="AGGREGATE" ...>
  <Subcommand Name="OUTFILE" EqualsSign="Optional">
    <Parameter Name="MODE" EqualsSign="Optional" ParameterType="Keyword">
      <EnumValue Name="REPLACE"/>
      <EnumValue Name="ADDVARIABLES"/>
```

这批定义驱动了三个功能：

1. **语法参考浏览器**（`帮助 → 语法参考（命令定义库）…`）
   可搜索全部 328 条命令，点开查看子命令 / 参数 / 枚举值的完整层级，
   并标注每条命令是「本平台已实现」还是「仅参考定义」。
2. **语法编辑器关键字自动补全**
   输入时自动弹出候选（`Ctrl+空格` 手动触发，`Tab`/`Enter` 接受，`Esc` 关闭）。
   补全按上下文分层：
   - 命令名 —— 输入 `FRE` → `FREQUENCIES`
   - 子命令 —— 输入 `FREQUENCIES /STAT` → `/STATISTICS`
   - 关键字 —— 输入 `FREQUENCIES /STATISTICS ME` → `MEAN` `MEDIAN` `SEMEAN`
   - 枚举值 —— 输入 `AGGREGATE /OUTFILE MODE=` → `REPLACE` `ADDVARIABLES`
   - 命令名拼错时回退为最接近的命令名（`AGG` → `AGGREGATE`）
3. **语法检查**（`运行 → 语法检查`，或工具栏「语法检查」按钮）
   逐条命令比对定义，报告未知命令（错误）与未定义的子命令 / 关键字（警告），
   结果写入输出查看器。

另外，`docs/syntaxreference.pdf` 是随包分发的《IBM SPSS Statistics 语法参考》官方手册
（11.5 MB），可从 `帮助 → 语法参考手册（PDF）…` 或语法参考对话框底部的按钮打开。

## 示例数据

### 一、SPSS 自带示例数据（120 个）

随程序分发的 `samples/` 目录收录了 **IBM SPSS Statistics 27 自带的 120 个简体中文示例数据集**（.sav），
通过「**文件 → 打开 → SPSS 示例数据…**」打开，支持按名称搜索。

读取时完整还原 SPSS 的变量元数据：

- 变量名与变量标签（中文）
- 值标签（如 `性别: f=女, m=男`；`教育水平: 15=15 年`）
- 测量尺度（度量 / 有序 / 名义）
- 显示宽度、小数位（直接解析 SPSS 的 `F8.2` / `A12` / `DOLLAR8` / `ADATE10` 格式串）
- 日期变量自动格式化为 `YYYY-MM-DD`

常见数据集：`Employee data.sav`（474×10）、`bankloan.sav`（850×12）、
`car_sales.sav`（157×26）、`accidents.sav`（6×4）等。

### 二、内置生成示例数据（3 个）

通过「**文件 → 打开 → 内置示例数据**」加载，由后端按固定随机种子生成，适合快速试跑：

| 名称 | 规模 | 说明 |
| --- | --- | --- |
| 员工满意度调查 | 120 例 × 16 变量 | 性别、年龄、部门、学历、工龄、月薪、满意度、敬业度、加班、离职意向及 5 道量表题 |
| 学生成绩数据 | 150 例 × 10 变量 | 班级、性别、三科成绩、学习时长、睡眠时长、总评、是否及格 |
| 月度销售数据 | 144 例 × 7 变量 | 12 个月 × 4 区域 × 3 渠道的销售额、销量、成本、利润 |

## 计算变量表达式说明

表达式在受限命名空间中求值，可直接使用变量名与以下函数：

`abs` `sqrt` `exp` `ln` `lg` `sin` `cos` `tan` `floor` `ceil` `round`
`mean(v1,v2,…)` `sum(…)` `min(…)` `max(…)` `sd(…)` `variance(…)` `range(…)`
`any(…)` `all(…)` `if(条件, 真值, 假值)`

逻辑运算符支持 `AND` / `OR` / `NOT`，比较运算符支持 `=` `<>` `>` `<` `>=` `<=`。

示例：
```
COMPUTE avg_score = mean(q1, q2, q3, q4, q5).
COMPUTE high_salary = if(salary > 10000, 1, 0).
COMPUTE total = math + chinese + english.
```

## 自动化测试

```bash
# 后端：68 项统计过程 / 转换 / 语法 / 命令定义库 / 导入导出
runtime\python\python.exe smoke_test.py

# 前端：98 项界面交互（headless Chrome 驱动真实点击，并输出截图到 shots/）
runtime\python\python.exe devtools_shot.py
```

`devtools_shot.py` 依赖 `websockets`（已随运行时打包）与本机 Chrome，
会真实模拟「打开对话框 → 选择变量 → 点击箭头 → 确定 → 校验输出」的完整流程，
并校验 11 项菜单、纯图标工具栏、底部视图标签、状态栏文案、窗口切换、SPSS 示例数据、
语法补全 / 命令定义库 / 语法检查，以及菜单下拉是否对齐到所属菜单项下方等外壳与功能特征。

> 测试脚本以 `--no-proxy-server` 启动 Chrome，因此在设置了 `HTTP_PROXY` 的机器上也能正常跑。
> 若命令行访问本机服务被代理拦截，请加 `--noproxy '*'`。

## 注意事项

- **分发时请整体打包**：`启动.bat` / `启动.sh` / `start.py` / `runtime/` / `samples/` /
  `syntax_xml/` / `docs/` / `backend/` / `web/` 缺一不可。
- `启动.bat` **必须保持 CRLF 换行且为纯 ASCII**（cmd.exe 对 LF 换行的批处理会解析失败）。
- 数据保存在服务进程内存中，重启服务后需重新导入。需要持久化时请及时导出为 CSV / Excel。
- 所有统计过程仅使用**筛选后**的个案（若定义了筛选变量）。
- 结果输出可点击「导出」保存为 HTML 文件。
- 前端的编程接口已挂载在 `window.App`（`App.openSample` / `App.run` / `App.analyze` /
  `App.transform` / `App.runSyntax(code)` / `App.spssSampleDialog` / `App.syntaxRef()` /
  `App.checkSyntax()` / `App.syntaxComplete(text, offset)` / `App.windows` 等），
  可在浏览器控制台直接调用。
- 语法补全下拉是**绝对定位**在 `.syntax-host` 内的（该容器需保持 `position: relative`）；
  菜单下拉的 `left` 由 `menus.js` 在展开时按所属菜单项的 `offsetLeft` 动态计算，
  CSS 里不要写死 `left`，否则会退回菜单栏最左侧。
