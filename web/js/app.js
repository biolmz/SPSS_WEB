/* ============ 主应用（IBM SPSS Statistics 多窗口外壳） ============ */
(function (global) {
  'use strict';

  const esc = Dialogs.esc;

  const App = {
    dataset: null,
    view: 'data',          // data | variable
    selection: new Set(),
    samples: [],
    headerMode: 'label',   // label（值标签）| name（变量名）
    curCell: { row: 0, col: 0 },
    showToolbar: true,
    showStatus: true,
  };
  global.App = App;

  let statusMsg = '就绪';

  // ---------------------------------------------------------------- 基础
  function vars() { return App.dataset ? App.dataset.variables : []; }

  function setStatus(msg) {
    statusMsg = msg;
    Windows.refreshStatus('data');
  }

  function refreshMenus() {
    const win = Windows.active();
    if (win && win.def && win.def.menus) Menus.render(win.menubar, win.def.menus);
  }

  // ---------------------------------------------------------------- 网格
  function updateRefBar() {
    const box = document.getElementById('refBox');
    const vis = document.getElementById('visCount');
    const ds = App.dataset;
    if (box) {
      if (!ds) box.value = '';
      else {
        const v = ds.variables[App.curCell.col];
        box.value = `${App.curCell.row + 1} : ${v ? (v.label || v.name) : ''}`;
      }
    }
    if (vis) {
      const n = ds ? ds.variables.length : 0;
      vis.textContent = `可视：${n}/${n} 个变量`;
    }
  }

  function refreshGrid() {
    const host = document.getElementById('gridHost');
    const wrap = document.getElementById('gridWrap');
    if (!wrap) return;
    const st = host ? host.scrollTop : 0;
    const sl = host ? host.scrollLeft : 0;
    const ds = App.dataset;
    const h = {
      headerMode: App.headerMode,
      getSelection: () => App.selection,
      onCellFocus: (i, j) => { App.curCell = { row: i, col: j }; updateRefBar(); },
      onCellEdit: onCellEdit,
      onRowToggle: onRowToggle,
      onVarEdit: onVarEdit,
      onEditValueLabels: (name) => {
        const v = App.dataset.variables.find(x => x.name === name);
        Dialogs.T.valueLabels(v, async (values) => { await saveVar(name, { values }); });
      },
      onEditMissing: (name) => {
        const v = App.dataset.variables.find(x => x.name === name);
        Dialogs.T.missing(v, async (missing) => { await saveVar(name, { missing }); });
      },
    };
    if (App.view === 'data') {
      Grid.renderDataView(wrap, ds || { rows: [], variables: [] }, h);
    } else if (!ds) {
      wrap.innerHTML = '<div class="grid-empty">尚未打开数据集，无法显示变量视图。' +
        '请使用「文件 → 打开 → 数据」或打开示例数据。</div>';
    } else {
      Grid.renderVariableView(wrap, ds, h);
    }
    if (host) { host.scrollTop = st; host.scrollLeft = sl; }
    updateRefBar();
  }

  function onRowToggle(i) {
    if (App.selection.has(i)) App.selection.delete(i); else App.selection.add(i);
    const tr = document.querySelector(`#gridWrap tr[data-row="${i}"]`);
    if (tr) tr.classList.toggle('selected', App.selection.has(i));
    else refreshGrid();
    Windows.refreshStatus('data');
  }

  async function onCellEdit(row, col, value, td) {
    const v = App.dataset.variables[col];
    let val = value;
    if (v && v.type === 'numeric') {
      if (String(value).trim() === '') val = null;
      else {
        const n = Number(value);
        if (isNaN(n)) {
          Dialogs.toast('该变量为数值型，请输入数值', 'err');
          if (td) td.textContent = '';
          return;
        }
        val = n;
      }
    } else if (String(value).trim() === '') val = null;
    try {
      await API.updateCells(App.dataset.id, [{ row, col, value: val }]);
      App.dataset.rows[row][col] = val;
      if (td) td.textContent = Grid.cellText(v, val, App.headerMode);
      setStatus(`已更新第 ${row + 1} 行，第 ${col + 1} 列`);
    } catch (e) {
      Dialogs.toast(e.message, 'err');
      refreshGrid();
    }
  }

  async function saveVar(name, payload) {
    try {
      const res = await API.updateVariable(App.dataset.id, name, payload);
      App.dataset.variables = res.variables;
      refreshGrid();
      Dialogs.toast('变量属性已保存', 'ok');
    } catch (e) { Dialogs.toast(e.message, 'err'); }
  }

  async function onVarEdit(name, field, value) {
    await saveVar(name, { [field]: value });
  }

  function setView(v) {
    App.view = v;
    document.querySelectorAll('#windows .etab').forEach(t =>
      t.classList.toggle('active', t.dataset.view === v));
    refreshGrid();
    refreshMenus();
  }

  function toggleHeaderMode() {
    App.headerMode = App.headerMode === 'label' ? 'name' : 'label';
    refreshGrid();
    setStatus(App.headerMode === 'label' ? '列头显示值标签' : '列头显示变量名');
    refreshMenus();
  }

  // ---------------------------------------------------------------- 数据状态
  function setDataset(data) {
    App.dataset = data;
    App.selection = new Set();
    App.curCell = { row: 0, col: 0 };
    refreshGrid();
    Windows.refreshAllStatus();
  }

  async function loadDataset(id) {
    try {
      const data = await API.getDataset(id);
      setDataset(data);
      setStatus(`已加载数据集「${data.name}」（${data.total} 个个案，${data.variables.length} 个变量）`);
    } catch (e) { Dialogs.toast(e.message, 'err'); }
  }

  async function reloadCurrent() {
    if (!App.dataset) return;
    const data = await API.getDataset(App.dataset.id);
    App.dataset = data;
    refreshGrid();
    Windows.refreshAllStatus();
  }

  async function syncMeta() {
    if (!App.dataset) return;
    try {
      const data = await API.getDataset(App.dataset.id);
      App.dataset.splitVar = data.splitVar;
      App.dataset.filterVar = data.filterVar;
      App.dataset.weightVar = data.weightVar;
      App.dataset.total = data.total;
      Windows.refreshAllStatus();
    } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------- 运行
  function ensureOutput() {
    if (!Windows.isOpen('output')) Windows.open('output');
    else Windows.focus('output');
  }

  async function doAnalyze(procedure, params, title) {
    if (!App.dataset) { Dialogs.toast('请先打开数据集', 'err'); return; }
    Dialogs.busy(true);
    setStatus(`正在运行：${title || procedure} ...`);
    try {
      const res = await API.analyze(App.dataset.id, procedure, params);
      Dialogs.close();
      ensureOutput();
      Viewer.append(res.blocks, { dataset: App.dataset.name });
      await syncMeta();
      setStatus(`完成：${title || procedure}`);
    } catch (e) {
      Dialogs.toast(e.message, 'err');
      setStatus('分析失败：' + e.message);
    } finally { Dialogs.busy(false); }
  }

  async function doTransform(transform, params, title) {
    if (!App.dataset) { Dialogs.toast('请先打开数据集', 'err'); return; }
    Dialogs.busy(true);
    setStatus(`正在执行：${title || transform} ...`);
    try {
      const res = await API.transform(App.dataset.id, transform, params);
      Dialogs.close();
      if (res.blocks && res.blocks.length) {
        ensureOutput();
        Viewer.append(res.blocks, { dataset: App.dataset.name });
      }
      if (res.datasetId && res.datasetId !== App.dataset.id) {
        await loadDataset(res.datasetId);
      } else {
        await reloadCurrent();
      }
      setStatus(`完成：${title || transform}`);
    } catch (e) {
      Dialogs.toast(e.message, 'err');
      setStatus('执行失败：' + e.message);
    } finally { Dialogs.busy(false); }
  }

  function run(a, b, c, d) {
    if (a === 'transform') return doTransform(b, c, d);
    return doAnalyze(a, b, c);
  }

  // ---------------------------------------------------------------- 文件
  async function newDataset() {
    try {
      const ds = await API.createDataset({ name: null, variables: [], rows: [] });
      await API.addVariable(ds.id, { name: 'VAR00001', type: 'numeric', decimals: 2, label: '', measure: 'scale' });
      await API.addVariable(ds.id, { name: 'VAR00002', type: 'numeric', decimals: 2, label: '', measure: 'scale' });
      await loadDataset(ds.id);
      if (Windows.isOpen('output')) Viewer.clear();
      Windows.open('data');
      Dialogs.toast('已新建数据集', 'ok');
    } catch (e) { Dialogs.toast(e.message, 'err'); }
  }

  async function openSample(kind) {
    Dialogs.busy(true);
    try {
      const res = await API.loadSample(kind);
      setDataset(res.dataset);
      if (Windows.isOpen('output')) Viewer.clear();
      Windows.open('data');
      setStatus(`已打开示例数据集「${res.dataset.name}」`);
      Dialogs.toast(`已打开「${res.dataset.name}」`, 'ok');
    } catch (e) { Dialogs.toast(e.message, 'err'); }
    finally { Dialogs.busy(false); }
  }

  function pickFile(accept, onPick) {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.addEventListener('change', () => { if (inp.files[0]) onPick(inp.files[0]); });
    inp.click();
  }

  async function ensureDataset() {
    if (App.dataset) return App.dataset;
    const ds = await API.createDataset({ name: null, variables: [], rows: [] });
    await loadDataset(ds.id);
    return App.dataset;
  }

  async function importData() {
    pickFile('.csv,.txt,.tsv,.xlsx,.xls,.xlsm,.sav', async (f) => {
      Dialogs.busy(true);
      try {
        await ensureDataset();
        const data = await API.importFile(App.dataset.id, f);
        setDataset(data);
        Windows.open('data');
        Dialogs.toast(`已导入 ${f.name}：${data.total} 行 × ${data.variables.length} 列`, 'ok');
      } catch (e) { Dialogs.toast(e.message, 'err'); }
      finally { Dialogs.busy(false); }
    });
  }

  function exportData(format) {
    if (!App.dataset) { Dialogs.toast('请先打开数据集', 'err'); return; }
    window.location.href = API.exportUrl(App.dataset.id, format);
    setStatus(`正在导出 ${format.toUpperCase()} ...`);
  }

  function printData() {
    if (!App.dataset) { Dialogs.toast('请先打开数据集', 'err'); return; }
    const ds = App.dataset;
    const w = window.open('', '_blank');
    if (!w) { Dialogs.toast('浏览器阻止了打印窗口，请允许弹出窗口', 'err'); return; }
    let html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(ds.name)}</title>
<style>
body{font-family:"Segoe UI","Microsoft YaHei",sans-serif;font-size:11px;margin:14px;color:#000}
h3{font-size:13px;margin:0 0 8px}
table{border-collapse:collapse}
th,td{border:1px solid #999;padding:1px 5px;white-space:nowrap}
th{background:#eee;font-weight:600}
td.n{text-align:right}
</style></head><body><h3>${esc(ds.name)}　（${ds.total} 个个案 × ${ds.variables.length} 个变量）</h3>
<table><thead><tr><th>#</th>`;
    ds.variables.forEach(v => { html += `<th>${esc(v.label || v.name)}</th>`; });
    html += '</tr></thead><tbody>';
    ds.rows.slice(0, 2000).forEach((r, i) => {
      html += `<tr><td>${i + 1}</td>`;
      ds.variables.forEach((v, j) => {
        html += `<td class="${v.type === 'numeric' ? 'n' : ''}">${esc(Grid.fmtCell(r[j], v.decimals))}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table></body></html>';
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch (e) { /* ignore */ } }, 250);
  }

  async function closeDataset() {
    if (!App.dataset) { Dialogs.toast('当前没有打开的数据集', 'err'); return; }
    Dialogs.open({
      title: '关闭数据集', width: 460,
      body: `<div class="msg err">将关闭数据集「${esc(App.dataset.name)}」并从服务器删除，该操作不可撤销。</div>`,
      onSubmit: async () => {
        try {
          await API.deleteDataset(App.dataset.id);
          App.dataset = null;
          App.selection = new Set();
          refreshGrid();
          Windows.refreshAllStatus();
          Dialogs.toast('数据集已关闭', 'ok');
        } catch (e) { Dialogs.toast(e.message, 'err'); }
      },
    });
  }

  // ---------------------------------------------------------------- 编辑
  async function addRow() {
    if (!App.dataset) { Dialogs.toast('请先打开数据集', 'err'); return; }
    try {
      await API.insertRows(App.dataset.id, { count: 1 });
      await reloadCurrent();
      setStatus('已插入 1 个个案');
    } catch (e) { Dialogs.toast(e.message, 'err'); }
  }

  function addVariable() {
    if (!App.dataset) { Dialogs.toast('请先打开数据集', 'err'); return; }
    Dialogs.open({
      title: '插入变量', width: 520,
      body: () => {
        const d = document.createElement('div');
        d.innerHTML = `<div class="form-grid">
          <label>变量名</label><input type="text" id="nvName" value="VAR${String(App.dataset.variables.length + 1).padStart(5, '0')}">
          <label>类型</label>${Dialogs.selectEl('nvType', [['numeric', '数值'], ['string', '字符串']], 'numeric')}
          <label>小数位</label><input type="number" id="nvDec" value="2" min="0" max="8">
          <label>标签</label><input type="text" id="nvLabel">
          <label>测量尺度</label>${Dialogs.selectEl('nvMeasure', [['scale', '度量'], ['ordinal', '有序'], ['nominal', '名义']], 'scale')}
        </div>`;
        return d;
      },
      onSubmit: () => {
        const name = Dialogs.val('nvName').trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) { Dialogs.toast('变量名不合法', 'err'); return false; }
        API.addVariable(App.dataset.id, {
          name, type: Dialogs.val('nvType'), decimals: parseInt(Dialogs.val('nvDec'), 10) || 0,
          label: Dialogs.val('nvLabel'), measure: Dialogs.val('nvMeasure'),
          align: Dialogs.val('nvType') === 'numeric' ? 'right' : 'left',
        }).then(res => {
          App.dataset.variables = res.variables;
          setView('variable');
          Dialogs.toast('已插入变量', 'ok');
        }).catch(e => Dialogs.toast(e.message, 'err'));
      },
    });
  }

  function deleteSelectedRows() {
    if (!App.dataset) return;
    if (!App.selection.size) { Dialogs.toast('请先点击行号选择要删除的个案', 'err'); return; }
    const idxs = Array.from(App.selection).sort((a, b) => a - b);
    Dialogs.open({
      title: '删除个案', width: 460,
      body: `<div class="msg err">将删除 ${idxs.length} 个个案（第 ${idxs.map(i => i + 1).join(', ')} 行），该操作不可撤销。</div>`,
      onSubmit: async () => {
        try {
          await API.deleteRows(App.dataset.id, idxs);
          App.selection = new Set();
          await reloadCurrent();
          Dialogs.toast(`已删除 ${idxs.length} 个个案`, 'ok');
        } catch (e) { Dialogs.toast(e.message, 'err'); }
      },
    });
  }

  function deleteVariableDialog() {
    if (!App.dataset || !App.dataset.variables.length) { Dialogs.toast('当前没有变量', 'err'); return; }
    Dialogs.open({
      title: '删除变量', width: 480,
      body: () => {
        const d = document.createElement('div');
        d.innerHTML = `<label class="dlg-label">选择要删除的变量</label>
          <select id="dvName" style="width:100%">${App.dataset.variables.map(v =>
            `<option value="${esc(v.name)}">${esc(v.name)}${v.label ? ' · ' + esc(v.label) : ''}</option>`).join('')}</select>
          <div class="msg err" style="margin-top:10px">删除变量会同时删除该列的全部数据，操作不可撤销。</div>`;
        return d;
      },
      onSubmit: async () => {
        try {
          await API.deleteVariable(App.dataset.id, Dialogs.val('dvName'));
          await reloadCurrent();
          Dialogs.toast('变量已删除', 'ok');
        } catch (e) { Dialogs.toast(e.message, 'err'); }
      },
    });
  }

  function selectAllCases() {
    if (!App.dataset) return;
    App.selection = new Set(App.dataset.rows.map((_, i) => i));
    refreshGrid();
    setStatus(`已选择 ${App.selection.size} 个个案`);
  }

  function clearSelection() {
    App.selection = new Set();
    refreshGrid();
    setStatus('已取消选择');
  }

  function gotoCaseDialog() {
    if (!App.dataset) { Dialogs.toast('请先打开数据集', 'err'); return; }
    Dialogs.open({
      title: '转至个案', width: 430,
      body: `<div class="dlg-row"><div class="dlg-col">
          <label class="dlg-label">个案号（行号）</label>
          <input type="number" id="gcNo" value="${App.curCell.row + 1}" min="1" max="${App.dataset.total}" style="width:100%">
        </div></div>
        <div class="hint">输入 1 – ${App.dataset.total} 之间的数字，跳转到该个案。</div>`,
      onSubmit: () => {
        const n = parseInt(Dialogs.val('gcNo'), 10);
        if (isNaN(n) || n < 1 || n > App.dataset.total) { Dialogs.toast('个案号超出范围', 'err'); return false; }
        App.curCell = { row: n - 1, col: App.curCell.col };
        const td = document.querySelector(`#gridWrap td.cell[data-row="${n - 1}"]`);
        if (td) { td.scrollIntoView({ block: 'center', inline: 'nearest' }); td.click(); }
        else updateRefBar();
        setStatus(`已转至第 ${n} 个个案`);
      },
    });
  }

  function gotoVariableDialog() {
    if (!App.dataset) { Dialogs.toast('请先打开数据集', 'err'); return; }
    Dialogs.open({
      title: '转至变量', width: 460,
      body: () => {
        const d = document.createElement('div');
        d.innerHTML = `<label class="dlg-label">选择变量</label>
          <select id="gvName" style="width:100%">${App.dataset.variables.map((v, j) =>
            `<option value="${j}">${esc(v.name)}${v.label ? ' · ' + esc(v.label) : ''}</option>`).join('')}</select>`;
        return d;
      },
      onSubmit: () => {
        const j = parseInt(Dialogs.val('gvName'), 10);
        App.curCell = { row: App.curCell.row, col: j };
        const td = document.querySelector(`#gridWrap td.cell[data-row="${App.curCell.row}"][data-col="${j}"]`);
        if (td) { td.scrollIntoView({ block: 'nearest', inline: 'center' }); td.click(); }
        else updateRefBar();
        setStatus(`已转至变量「${App.dataset.variables[j].name}」`);
      },
    });
  }

  function findDialog() {
    if (!App.dataset) { Dialogs.toast('请先打开数据集', 'err'); return; }
    Dialogs.open({
      title: '查找', width: 520,
      body: `<div class="dlg-row"><div class="dlg-col">
          <label class="dlg-label">查找内容</label>
          <input type="text" id="fq" style="width:100%">
        </div></div>
        <div class="hint">在全部变量的数据中查找，找到后自动定位到该单元格。</div>`,
      onSubmit: () => {
        const q = (Dialogs.val('fq') || '').trim();
        if (!q) { Dialogs.toast('请输入查找内容', 'err'); return false; }
        const ds = App.dataset;
        for (let i = 0; i < ds.rows.length; i++) {
          for (let j = 0; j < ds.variables.length; j++) {
            const v = ds.rows[i][j];
            if (v === null || v === undefined) continue;
            if (String(v).toLowerCase().indexOf(q.toLowerCase()) >= 0) {
              setView('data');
              App.curCell = { row: i, col: j };
              const td = document.querySelector(`#gridWrap td.cell[data-row="${i}"][data-col="${j}"]`);
              if (td) { td.scrollIntoView({ block: 'center', inline: 'center' }); td.click(); }
              Dialogs.toast(`在第 ${i + 1} 行、第 ${j + 1} 列找到「${q}」`, 'ok');
              setStatus(`找到「${q}」于第 ${i + 1} 行`);
              return;
            }
          }
        }
        Dialogs.toast(`未找到「${q}」`, 'err');
      },
    });
  }

  function variableList() {
    if (!App.dataset) { Dialogs.toast('请先打开数据集', 'err'); return; }
    const vs = App.dataset.variables;
    let html = '<table class="pivot" style="width:100%"><thead><tr><th>名称</th><th>类型</th><th>标签</th>' +
      '<th>值标签</th><th>缺失</th><th>测量</th></tr></thead><tbody>';
    vs.forEach(v => {
      const vals = Object.keys(v.values || {}).map(k => `${k}=${v.values[k]}`).join('; ');
      const miss = (v.missing && Object.keys(v.missing).length) ? JSON.stringify(v.missing) : '';
      html += `<tr><td class="rowhead">${esc(v.name)}</td><td style="text-align:left">${esc(v.type)}</td>
        <td style="text-align:left">${esc(v.label || '')}</td><td style="text-align:left">${esc(vals)}</td>
        <td style="text-align:left">${esc(miss)}</td><td style="text-align:left">${esc(v.measure)}</td></tr>`;
    });
    html += '</tbody></table>';
    Dialogs.open({ title: '变量列表', width: 820, body: html,
      buttons: [{ text: '关闭', cls: 'primary', onClick: () => Dialogs.close() }] });
  }

  function datasetList() {
    API.listDatasets().then(res => {
      let html = '<table class="pivot" style="width:100%"><thead><tr><th>名称</th><th>个案数</th>' +
        '<th>变量数</th><th>操作</th></tr></thead><tbody>';
      res.datasets.forEach(d => {
        html += `<tr><td class="rowhead">${esc(d.name)}</td><td>${d.nCases}</td><td>${d.nVars}</td>
          <td><button class="btn" data-open="${d.id}" style="min-width:0;padding:2px 10px">激活</button></td></tr>`;
      });
      html += '</tbody></table>';
      if (!res.datasets.length) html = '<div class="hint">当前没有打开的数据集。</div>';
      Dialogs.open({
        title: '数据集列表', width: 640, body: html,
        buttons: [{ text: '关闭', cls: 'primary', onClick: () => Dialogs.close() }],
        onReady: (body) => {
          body.querySelectorAll('button[data-open]').forEach(b => b.addEventListener('click', async () => {
            await loadDataset(b.dataset.open);
            Dialogs.close();
            Windows.open('data');
          }));
        },
      });
    }).catch(e => Dialogs.toast(e.message, 'err'));
  }

  // ---------------------------------------------------------------- SPSS 自带示例数据
  let spssCache = null;

  function spssSampleDialog() {
    let all = [];
    let filtered = [];
    let selected = null;

    function paint() {
      const box = document.getElementById('spssList');
      const info = document.getElementById('spssInfo');
      if (!box) return;
      if (!filtered.length) {
        box.innerHTML = '<div style="padding:8px;color:#8a97a5;font-size:12px">没有匹配的数据集</div>';
      } else {
        box.innerHTML = filtered.map(s =>
          `<div class="li${selected && selected.file === s.file ? ' sel' : ''}" data-file="${esc(s.file)}">` +
            `<span>${esc(s.file)}</span>` +
            `<span class="vt">${s.cases} 个个案 · ${s.vars} 个变量</span>` +
          `</div>`).join('');
        box.querySelectorAll('.li').forEach(li => {
          li.addEventListener('click', () => {
            selected = filtered.find(s => s.file === li.dataset.file) || null;
            paint();
          });
          li.addEventListener('dblclick', () => openSelected());
        });
      }
      if (info) {
        info.textContent = `共 ${all.length} 个 SPSS 示例数据` +
          (filtered.length !== all.length ? `，匹配 ${filtered.length} 个` : '') +
          '　（来源：IBM SPSS Statistics 27 自带简体中文样例，.sav 格式）';
      }
    }

    function openSelected() {
      if (!selected) { Dialogs.toast('请先选择一个数据集', 'err'); return; }
      const f = selected.file;
      Dialogs.close();
      loadSpssSample(f);
    }

    Dialogs.open({
      title: '打开 SPSS 示例数据', width: 840,
      body: () => {
        const d = document.createElement('div');
        d.innerHTML =
          '<div class="dlg-row"><div class="dlg-col">' +
            '<label class="dlg-label">搜索数据集</label>' +
            '<input type="text" id="spssSearch" spellcheck="false" ' +
              'placeholder="按文件名或标签过滤，例如 employee / bankloan / 员工…" style="width:100%">' +
          '</div></div>' +
          '<div class="listbox" id="spssList" style="height:330px"></div>' +
          '<div class="hint" id="spssInfo" style="margin-top:7px">正在读取示例数据列表…</div>';
        return d;
      },
      buttons: [
        { text: '打开', cls: 'primary', onClick: () => openSelected() },
        { text: '取消', onClick: () => Dialogs.close() },
      ],
      onReady: async () => {
        try {
          if (!spssCache) {
            const res = await API.spssSamples();
            spssCache = res.samples || [];
          }
          all = spssCache.slice();
          filtered = all.slice();
          paint();
          const inp = document.getElementById('spssSearch');
          if (inp) {
            inp.focus();
            inp.addEventListener('input', () => {
              const q = inp.value.trim().toLowerCase();
              filtered = q
                ? all.filter(s => s.file.toLowerCase().indexOf(q) >= 0 ||
                                  (s.label || '').toLowerCase().indexOf(q) >= 0)
                : all.slice();
              paint();
            });
          }
        } catch (e) {
          const info = document.getElementById('spssInfo');
          if (info) info.textContent = '读取示例数据列表失败：' + e.message;
        }
      },
    });
  }

  async function loadSpssSample(file) {
    Dialogs.busy(true);
    setStatus(`正在打开 SPSS 示例数据「${file}」...`);
    try {
      const res = await API.loadSpssSample(file);
      setDataset(res.dataset);
      if (Windows.isOpen('output')) Viewer.clear();
      Windows.open('data');
      Dialogs.toast(`已打开「${res.dataset.name}」：${res.dataset.total} 个个案，` +
        `${res.dataset.variables.length} 个变量`, 'ok');
      setStatus(`已打开 SPSS 示例数据「${res.dataset.name}」`);
    } catch (e) {
      Dialogs.toast(e.message, 'err');
    } finally { Dialogs.busy(false); }
  }

  function autoRecode() {
    if (!App.dataset) { Dialogs.toast('请先打开数据集', 'err'); return; }
    const v = App.dataset.variables;
    Dialogs.open({
      title: '自动重新编码', width: 560,
      body: () => {
        const d = document.createElement('div');
        d.innerHTML = `<div class="form-grid">
          <label>源变量</label><select id="srcV">${v.map(x => `<option value="${esc(x.name)}">${esc(x.name)}</option>`).join('')}</select>
          <label>目标变量名</label><input type="text" id="tgtV" value="auto_new">
        </div>
        <div class="hint" style="margin-top:8px">将变量的每个唯一取值映射为从 1 开始的整数编码，并自动生成值标签。</div>`;
        return d;
      },
      onSubmit: () => {
        const src = Dialogs.val('srcV');
        run('transform', 'auto_recode', { source: src, target: Dialogs.val('tgtV') || src + '_n' }, '自动重新编码');
      },
    });
  }

  async function resetAll() {
    if (!App.dataset) { Dialogs.toast('请先打开数据集', 'err'); return; }
    Dialogs.busy(true);
    try {
      await API.transform(App.dataset.id, 'split', { off: true });
      await API.transform(App.dataset.id, 'weight', { off: true });
      await API.transform(App.dataset.id, 'select', { mode: 'all' });
      await reloadCurrent();
      Dialogs.toast('已重置筛选 / 拆分 / 加权', 'ok');
    } catch (e) { Dialogs.toast(e.message, 'err'); }
    finally { Dialogs.busy(false); }
  }

  // ---------------------------------------------------------------- 语法
  const SYNTAX_SAMPLES = [
    { title: '频率与描述统计', code: `FREQUENCIES VARIABLES=satisfaction engagement
  /STATISTICS=MEAN MEDIAN STDDEV MINIMUM MAXIMUM
  /BARCHART.

DESCRIPTIVES VARIABLES=salary tenure overtime
  /STATISTICS=MEAN STDDEV MIN MAX.` },
    { title: '交叉表与卡方', code: `CROSSTABS
  /TABLES=gender BY dept
  /STATISTICS=CHISQ
  /CELLS=COUNT EXPECTED ROW COLUMN TOTAL.` },
    { title: 'T 检验', code: `T-TEST GROUPS=gender(1 2)
  /VARIABLES=salary engagement.

T-TEST /TESTVAL=50 /VARIABLES=engagement.` },
    { title: '方差分析', code: `ONEWAY salary BY dept
  /STATISTICS=DESCRIPTIVES HOMOGENEITY
  /POSTHOC=LSD ALPHA(0.05).` },
    { title: '相关与回归', code: `CORRELATIONS
  /VARIABLES=engagement overtime satisfaction.

REGRESSION
  /DEPENDENT=engagement
  /METHOD=ENTER satisfaction overtime salary.` },
    { title: '因子分析与信度', code: `FACTOR
  /VARIABLES=q1 q2 q3 q4 q5
  /EXTRACTION=PC
  /ROTATION=VARIMAX.

RELIABILITY
  /VARIABLES=q1 q2 q3 q4 q5
  /MODEL=ALPHA.` },
    { title: '计算变量与排序', code: `COMPUTE avg_score = mean(q1, q2, q3, q4, q5).

COMPUTE overtime_flag = if(overtime > 10, 1, 0).

SORT CASES BY salary (D).

SELECT IF (salary > 8000).` },
  ];

  let syntaxText = '';

  async function executeSyntax(code) {
    if (!code || !code.trim()) { Dialogs.toast('请输入语法', 'err'); return; }
    if (!App.dataset) { Dialogs.toast('请先打开数据集', 'err'); return; }
    syntaxText = code;
    Dialogs.busy(true);
    setStatus('正在执行语法 ...');
    try {
      const res = await API.runSyntax(App.dataset.id, code);
      ensureOutput();
      Viewer.append(res.blocks, { dataset: App.dataset.name });
      if (res.datasetId && res.datasetId !== App.dataset.id) await loadDataset(res.datasetId);
      else await reloadCurrent();
      Dialogs.toast('语法执行完成', 'ok');
      setStatus('语法执行完成');
    } catch (e) {
      Dialogs.toast(e.message, 'err');
      setStatus('语法执行失败：' + e.message);
    } finally { Dialogs.busy(false); }
  }

  function runSyntaxFromWindow() {
    const ta = document.getElementById('syntaxText');
    if (!ta) { Windows.open('syntax'); return; }
    return executeSyntax(ta.value);
  }

  // ---------------------------------------------------------------- 语法命令定义库
  // 数据源：项目根目录 syntax_xml/ 下 328 份 SPSS 命令定义（后端 backend/syntaxref.py 解析）
  let refStats = null;

  function syntaxRefDialog() {
    Dialogs.open({
      title: '语法参考 — SPSS 命令定义库', width: 920, maxWidth: 1180,
      body: () => {
        const d = document.createElement('div');
        d.className = 'ref-wrap';
        d.innerHTML =
          '<div class="ref-head">' +
            '<input class="ref-q" id="refQ" spellcheck="false" ' +
              'placeholder="搜索命令，例如 FREQ、REGRESSION、CLUSTER、T-TEST…">' +
            '<label class="ref-only"><input type="checkbox" id="refOnly">只看本平台已实现</label>' +
            '<span class="ref-stat" id="refStat">加载中…</span>' +
          '</div>' +
          '<div class="ref-cols">' +
            '<div class="ref-list listbox" id="refList"></div>' +
            '<div class="ref-detail" id="refDetail">' +
              '<div class="hint">从左侧选择一条命令，查看它的子命令 / 参数 / 枚举值定义。</div>' +
            '</div>' +
          '</div>';
        return d;
      },
      onReady: async (body) => {
        const q = body.querySelector('#refQ');
        const only = body.querySelector('#refOnly');
        let timer = null;
        const reload = () => refLoadList(body, q.value.trim(), only.checked);
        q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(reload, 140); });
        only.addEventListener('change', reload);
        try {
          refStats = await API.syntaxStats();
          body.querySelector('#refStat').textContent =
            `${refStats.commands} 条命令 · ${refStats.subcommands} 子命令 · ` +
            `${refStats.parameters} 参数 · ${refStats.enums} 枚举值`;
        } catch (e) {
          body.querySelector('#refStat').textContent = '定义库不可用：' + e.message;
        }
        await reload();
        q.focus();
      },
      buttons: [
        { text: '打开语法参考手册（PDF）', onClick: openSyntaxPdf },
        { text: '关闭', cls: 'primary', onClick: () => Dialogs.close() },
      ],
    });
  }

  async function refLoadList(body, q, only) {
    const list = body.querySelector('#refList');
    const stat = body.querySelector('#refStat');
    try {
      const res = await API.syntaxCommands(q, only);
      const cmds = res.commands || [];
      list.innerHTML = '';
      if (!cmds.length) {
        list.innerHTML = '<div class="hint" style="padding:8px">没有匹配的命令。</div>';
      }
      cmds.forEach((c) => {
        const li = document.createElement('div');
        li.className = 'li ref-item';
        li.innerHTML =
          `<span class="ref-nm">${esc(c.name)}</span>` +
          (c.supported ? '<span class="ref-ok">已实现</span>' : '') +
          `<span class="vt">${c.subcommands}子 / ${c.parameters}参</span>`;
        li.addEventListener('click', () => {
          list.querySelectorAll('.li').forEach((n) => n.classList.remove('sel'));
          li.classList.add('sel');
          refShowCommand(body, c.name);
        });
        list.appendChild(li);
      });
      if (stat && refStats) {
        stat.textContent = q || only
          ? `筛选出 ${cmds.length} / ${refStats.commands} 条命令`
          : `${refStats.commands} 条命令 · ${refStats.subcommands} 子命令 · ` +
            `${refStats.parameters} 参数 · ${refStats.enums} 枚举值`;
      }
    } catch (e) {
      list.innerHTML = `<div class="hint" style="padding:8px">加载失败：${esc(e.message)}</div>`;
    }
  }

  async function refShowCommand(body, name) {
    const box = body.querySelector('#refDetail');
    box.innerHTML = '<div class="hint">读取定义中…</div>';
    try {
      const rec = await API.syntaxCommand(name);
      box.innerHTML = refRenderDetail(rec);
      box.scrollTop = 0;
    } catch (e) {
      box.innerHTML = `<div class="hint">读取失败：${esc(e.message)}</div>`;
    }
  }

  function refRenderDetail(rec) {
    const out = [];
    out.push(`<div class="ref-title">${esc(rec.name)}` +
      (rec.supported
        ? '<span class="ref-ok">本平台已实现</span>'
        : '<span class="ref-ref">仅参考定义</span>') + '</div>');

    const meta = [];
    if (rec.alias) meta.push(`别名 ${esc(rec.alias)}`);
    if (rec.endRequired) meta.push(`结束要求 ${esc(rec.endRequired)}`);
    if (rec.isArbitrary) meta.push(`子命令顺序任意 ${esc(rec.isArbitrary)}`);
    if (rec.language) meta.push(`语言 ${esc(rec.language)}`);
    meta.push(`定义文件 ${esc(rec.file)}`);
    out.push(`<div class="ref-meta">${meta.join(' · ')}</div>`);

    if (!rec.subcommands || !rec.subcommands.length) {
      out.push('<div class="hint">该命令没有子命令定义。</div>');
      return out.join('');
    }

    rec.subcommands.forEach((sc) => {
      const tags = [];
      if (sc.equals && sc.equals !== 'None') tags.push(`= ${esc(sc.equals)}`);
      if (sc.occurrence) tags.push(`出现 ${esc(sc.occurrence)}`);
      out.push(`<div class="ref-sub"><span class="ref-sub-name">/${esc(sc.name)}</span>` +
        tags.map((t) => `<span class="ref-tag">${t}</span>`).join('') + '</div>');
      if (!sc.params.length) return;
      out.push('<div class="ref-params">' + sc.params.map((p) => {
        const bits = [`<span class="ref-kw">${esc(p.name)}</span>`];
        if (p.type) bits.push(`<span class="ref-type">${esc(p.type)}</span>`);
        if (p.equals && p.equals !== 'None') bits.push(`<span class="ref-eq">= ${esc(p.equals)}</span>`);
        if (p.enum && p.enum.length) {
          bits.push(`<span class="ref-enum">${p.enum.map((e) => esc(e)).join(' / ')}</span>`);
        }
        return `<div class="ref-param">${bits.join(' ')}</div>`;
      }).join('') + '</div>');
    });
    return out.join('');
  }

  // ---------------------------------------------------------------- 语法编辑器补全

  /** 打开随包分发的《IBM SPSS Statistics 语法参考》手册（PDF）。 */
  function openSyntaxPdf() {
    window.open('/api/syntax/reference.pdf', '_blank');
    Dialogs.toast('已在新标签页打开语法参考手册', 'ok');
  }

  function caretCoords(ta, pos) {
    const cs = window.getComputedStyle(ta);
    const div = document.createElement('div');
    const props = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
      'lineHeight', 'textTransform', 'paddingTop', 'paddingRight', 'paddingBottom',
      'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth',
      'borderLeftWidth', 'boxSizing', 'textIndent', 'tabSize'];
    div.style.cssText = 'position:absolute;visibility:hidden;top:0;left:-99999px;overflow:hidden;white-space:pre-wrap;word-wrap:break-word';
    div.style.width = ta.clientWidth + 'px';
    props.forEach((p) => { div.style[p] = cs[p]; });
    div.textContent = ta.value.slice(0, pos);
    const mark = document.createElement('span');
    mark.textContent = '\u200b';
    div.appendChild(mark);
    document.body.appendChild(div);
    const top = mark.offsetTop - ta.scrollTop;
    const left = mark.offsetLeft - ta.scrollLeft;
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4 || 16;
    document.body.removeChild(div);
    return { top, left, lineHeight: lh };
  }

  let compSeq = 0;   // 请求序号：让过期响应失效，避免把新下拉框误关掉

  function hideCompletions() {
    compSeq += 1;
    const el = document.getElementById('syntaxComp');
    if (el) el.remove();
    App._compState = null;
  }

  function renderCompletions(ta, res) {
    const host = ta.parentElement;
    if (!host) return;
    hideCompletions();
    const items = res.items.slice(0, 12);
    const el = document.createElement('div');
    el.className = 'syntax-comp';
    el.id = 'syntaxComp';
    el.innerHTML = items.map((it, i) =>
      `<div class="ci${i === 0 ? ' sel' : ''}" data-i="${i}">` +
      `<span class="ct">${esc(it.text)}</span>` +
      `<span class="cd">${esc(it.detail || '')}</span></div>`).join('') +
      `<div class="ch">${esc(res.kind)} · ${items.length}/${res.items.length} · Tab/Enter 接受 · Esc 关闭</div>`;
    const co = caretCoords(ta, ta.selectionStart);
    el.style.top = Math.min(co.top + co.lineHeight, host.clientHeight - 40) + 'px';
    el.style.left = Math.max(0, Math.min(co.left, host.clientWidth - 240)) + 'px';
    host.appendChild(el);
    el.querySelectorAll('.ci').forEach((n) => {
      n.addEventListener('mousedown', (e) => {
        e.preventDefault();
        acceptCompletion(ta, res, items[Number(n.dataset.i)]);
      });
    });
    App._compState = { res, items, index: 0, el, ta };
  }

  function acceptCompletion(ta, res, item) {
    if (!item) { hideCompletions(); return; }
    const pos = ta.selectionStart;
    const start = Math.max(0, pos - (res.partial || '').length);
    const extra = res.kind === 'command' ? ' ' : '';
    const text = item.text + extra;
    ta.value = ta.value.slice(0, start) + text + ta.value.slice(pos);
    const caret = start + text.length;
    ta.setSelectionRange(caret, caret);
    syntaxText = ta.value;
    hideCompletions();
    ta.focus();
  }

  function moveCompletion(delta) {
    const st = App._compState;
    if (!st) return false;
    const n = st.items.length;
    if (!n) return false;
    st.index = (st.index + delta + n) % n;
    st.el.querySelectorAll('.ci').forEach((x, i) => x.classList.toggle('sel', i === st.index));
    const sel = st.el.querySelector('.ci.sel');
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
    return true;
  }

  let compTimer = null;

  async function requestCompletions(ta) {
    const seq = ++compSeq;
    const pos = ta.selectionStart;
    if (pos !== ta.selectionEnd) { hideCompletions(); return; }
    let res;
    try {
      res = await API.syntaxComplete(ta.value, pos);
    } catch (e) { if (seq === compSeq) hideCompletions(); return; }
    // 已有更新的请求在途 —— 直接丢弃本次结果，不要动界面
    if (seq !== compSeq) return;
    // 结果回来时用户可能已经继续输入了
    if (ta.selectionStart !== pos || document.activeElement !== ta) { hideCompletions(); return; }
    if (!res || !res.items || !res.items.length) { hideCompletions(); return; }
    renderCompletions(ta, res);
  }

  function scheduleCompletions(ta, delay) {
    clearTimeout(compTimer);
    compTimer = setTimeout(() => requestCompletions(ta), delay == null ? 130 : delay);
  }

  function onSyntaxKeydown(e) {
    const ta = e.currentTarget;
    const st = App._compState;
    if (e.ctrlKey && (e.key === ' ' || e.key === 'Spacebar')) {
      e.preventDefault();
      scheduleCompletions(ta, 0);
      return;
    }
    if (e.key === 'Escape') { hideCompletions(); return; }
    if (!st) {
      if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); runSyntaxFromWindow(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveCompletion(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveCompletion(-1); return; }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.ctrlKey)) {
      e.preventDefault();
      acceptCompletion(ta, st.res, st.items[st.index]);
      return;
    }
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); runSyntaxFromWindow(); }
  }

  async function checkSyntax() {
    const ta = document.getElementById('syntaxText');
    const code = ta ? ta.value : syntaxText;
    if (!code || !code.trim()) { Dialogs.toast('语法为空', 'err'); return; }
    Dialogs.busy(true);
    try {
      const r = await API.syntaxCheck(code);
      ensureOutput();
      const diags = r.diagnostics || [];
      const rows = diags.map((d) => [
        d.level === 'error' ? '错误' : '警告', d.command || '', d.message || '']);
      const blocks = [{ type: 'title', text: '语法检查', level: 1 }];
      if (!rows.length) {
        blocks.push({ type: 'note', text:
          `已按命令定义库校验 ${r.commands} 条命令，未发现未知命令或关键字。` });
      } else {
        blocks.push({ type: 'table', title: '诊断结果',
                      header: [['级别', '命令', '说明']], rows, rowHeader: 0, notes: [] });
        const nErr = diags.filter((d) => d.level === 'error').length;
        blocks.push({ type: 'note', text:
          `共 ${r.commands} 条命令，其中 ${r.known} 条能匹配到命令定义；` +
          `产生 ${diags.length} 条诊断（错误 ${nErr} 项，警告 ${diags.length - nErr} 项）。` });
      }
      Viewer.append(blocks, { dataset: App.dataset ? App.dataset.name : '' });
      Dialogs.toast(rows.length ? `发现 ${rows.length} 条诊断` : '语法检查通过', rows.length ? 'err' : 'ok');
    } catch (e) {
      Dialogs.toast('语法检查失败：' + e.message, 'err');
    } finally { Dialogs.busy(false); }
  }

  function printOutput() {
    if (!Viewer.blocks.length) { Dialogs.toast('输出查看器为空', 'err'); return; }
    Viewer.exportHtml();
    Dialogs.toast('已导出输出内容（HTML）', 'ok');
  }

  function toggleOutline(expand) {
    const tree = document.getElementById('outTree');
    if (!tree) return;
    tree.querySelectorAll('.node.lvl2').forEach(n => { n.style.display = expand ? '' : 'none'; });
  }

  // ---------------------------------------------------------------- 菜单
  function dataMenus() {
    return [
      { label: '文件', acc: 'F', items: [
        { label: '新建', submenu: [
          { label: '数据', hint: 'Ctrl+N', action: newDataset },
          { label: '语法', action: () => { Windows.open('syntax'); } },
        ] },
        { label: '打开', submenu: [
          { label: '数据…', hint: 'Ctrl+O', action: importData },
          { label: 'SPSS 示例数据…', action: spssSampleDialog },
          { sep: true },
          { label: '内置示例数据', submenu: [
            { label: '员工满意度调查', action: () => openSample('employee') },
            { label: '学生成绩数据', action: () => openSample('students') },
            { label: '月度销售数据', action: () => openSample('sales') },
          ] },
        ] },
        { sep: true },
        { label: '导入数据…', action: importData },
        { label: '导出', submenu: [
          { label: 'CSV 文件…', action: () => exportData('csv') },
          { label: 'Excel 文件…', action: () => exportData('xlsx') },
        ] },
        { label: '打印…', hint: 'Ctrl+P', action: printData },
        { sep: true },
        { label: '保存', hint: 'Ctrl+S', action: () => exportData('xlsx') },
        { label: '关闭数据集', action: closeDataset },
        { sep: true },
        { label: '退出', action: () => Windows.close('data') },
      ] },

      { label: '编辑', acc: 'E', items: [
        { label: '撤销', hint: 'Ctrl+Z', action: () => Dialogs.toast('暂无可撤销的操作') },
        { label: '重做', hint: 'Ctrl+Y', action: () => Dialogs.toast('暂无可重做的操作') },
        { sep: true },
        { label: '插入个案', action: addRow },
        { label: '插入变量…', action: addVariable },
        { label: '删除个案', enabled: () => App.selection.size > 0, action: deleteSelectedRows },
        { label: '删除变量…', action: deleteVariableDialog },
        { sep: true },
        { label: '查找…', hint: 'Ctrl+F', action: findDialog },
        { label: '转至个案…', hint: 'Ctrl+G', action: gotoCaseDialog },
        { label: '转至变量…', action: gotoVariableDialog },
        { sep: true },
        { label: '全选个案', hint: 'Ctrl+A', action: selectAllCases },
        { label: '取消选择', action: clearSelection },
      ] },

      { label: '查看', acc: 'V', items: [
        { label: '工具栏', check: () => App.showToolbar, action: () => {
          App.showToolbar = !App.showToolbar;
          const win = Windows.get('data');
          if (win) win.toolbar.style.display = App.showToolbar ? '' : 'none';
          refreshMenus();
        } },
        { label: '状态栏', check: () => App.showStatus, action: () => {
          App.showStatus = !App.showStatus;
          const win = Windows.get('data');
          if (win) win.status.style.display = App.showStatus ? '' : 'none';
          refreshMenus();
        } },
        { sep: true },
        { label: '显示值标签', check: () => App.headerMode === 'label', action: () => {
          if (App.headerMode !== 'label') toggleHeaderMode();
        } },
        { label: '显示变量名', check: () => App.headerMode === 'name', action: () => {
          if (App.headerMode !== 'name') toggleHeaderMode();
        } },
        { sep: true },
        { label: '数据视图', check: () => App.view === 'data', action: () => setView('data') },
        { label: '变量视图', check: () => App.view === 'variable', action: () => setView('variable') },
        { sep: true },
        { label: '输出查看器', action: () => Windows.open('output') },
        { label: '语法编辑器', action: () => Windows.open('syntax') },
      ] },

      { label: '数据', acc: 'D', items: [
        { label: '定义变量属性…', action: () => setView('variable') },
        { label: '变量列表…', action: variableList },
        { sep: true },
        { label: '插入变量…', action: addVariable },
        { label: '插入个案', action: addRow },
        { sep: true },
        { label: '排序个案…', action: () => Dialogs.T.sort(vars(), run) },
        { label: '转置…', action: () => Dialogs.T.transpose(vars(), run) },
        { label: '汇总数据…', action: () => Dialogs.T.aggregate(vars(), run) },
        { sep: true },
        { label: '拆分文件…', action: () => Dialogs.T.split(vars(), run) },
        { label: '加权个案…', action: () => Dialogs.T.weight(vars(), run) },
        { label: '选择个案…', action: () => Dialogs.T.select(vars(), run) },
        { sep: true },
        { label: '重置筛选 / 拆分 / 加权', action: resetAll },
      ] },

      { label: '转换', acc: 'T', items: [
        { label: '计算变量…', action: () => Dialogs.T.compute(vars(), run) },
        { label: '重新编码为不同变量…', action: () => Dialogs.T.recode(vars(), run) },
        { label: '自动重新编码…', action: autoRecode },
      ] },

      { label: '分析', acc: 'A', items: [
        { label: '描述统计', submenu: [
          { label: '频率…', action: () => Dialogs.A.frequencies(vars(), run) },
          { label: '描述…', action: () => Dialogs.A.descriptives(vars(), run) },
          { label: '探索…', action: () => Dialogs.A.explore(vars(), run) },
          { label: '交叉表…', action: () => Dialogs.A.crosstabs(vars(), run) },
        ] },
        { label: '比较平均值', submenu: [
          { label: '平均值…', action: () => Dialogs.A.means(vars(), run) },
          { label: '单样本 T 检验…', action: () => Dialogs.A.ttest_one(vars(), run) },
          { label: '独立样本 T 检验…', action: () => Dialogs.A.ttest_ind(vars(), run) },
          { label: '配对样本 T 检验…', action: () => Dialogs.A.ttest_paired(vars(), run) },
          { label: '单因素 ANOVA…', action: () => Dialogs.A.anova_oneway(vars(), run) },
        ] },
        { label: '一般线性模型', submenu: [
          { label: '单变量…', action: () => Dialogs.A.anova_glm(vars(), run) },
        ] },
        { label: '相关', submenu: [
          { label: '双变量…', action: () => Dialogs.A.correlation(vars(), run) },
          { label: '偏相关…', action: () => Dialogs.A.partial_corr(vars(), run) },
        ] },
        { label: '回归', submenu: [
          { label: '线性…', action: () => Dialogs.A.regression_linear(vars(), run) },
          { label: '二元 Logistic…', action: () => Dialogs.A.regression_logistic(vars(), run) },
        ] },
        { label: '非参数检验', submenu: [
          { label: '卡方…', action: () => Dialogs.A.np_chisquare(vars(), run) },
          { label: '二项…', action: () => Dialogs.A.np_binomial(vars(), run) },
          { label: '游程…', action: () => Dialogs.A.np_runs(vars(), run) },
          { label: '独立样本（Mann-Whitney U）…', action: () => Dialogs.A.np_mannwhitney(vars(), run) },
          { label: 'K 个独立样本（Kruskal-Wallis H）…', action: () => Dialogs.A.np_kruskal(vars(), run) },
          { label: '2 个相关样本（Wilcoxon）…', action: () => Dialogs.A.np_wilcoxon(vars(), run) },
          { label: 'K 个相关样本（Friedman）…', action: () => Dialogs.A.np_friedman(vars(), run) },
        ] },
        { label: '降维', submenu: [
          { label: '因子分析…', action: () => Dialogs.A.factor(vars(), run) },
        ] },
        { label: '刻度', submenu: [
          { label: '可靠性分析…', action: () => Dialogs.A.reliability(vars(), run) },
        ] },
      ] },

      { label: '图形', acc: 'G', items: [
        { label: '图形构建器…', disabled: true, action: () => {} },
        { sep: true },
        { label: '条形图…', action: () => Dialogs.A.chart('bar', '条形图')(vars(), run) },
        { label: '饼图…', action: () => Dialogs.A.chart('pie', '饼图')(vars(), run) },
        { label: '直方图…', action: () => Dialogs.A.chart('histogram', '直方图')(vars(), run) },
        { label: '散点图…', action: () => Dialogs.A.chart('scatter', '散点图')(vars(), run) },
        { label: '箱线图…', action: () => Dialogs.A.chart('box', '箱线图')(vars(), run) },
        { label: '折线图…', action: () => Dialogs.A.chart('line', '折线图')(vars(), run) },
        { label: '误差条形图…', action: () => Dialogs.A.chart('errorbar', '误差条形图')(vars(), run) },
      ] },

      { label: '实用程序', acc: 'U', items: [
        { label: '变量列表…', action: variableList },
        { label: '数据集列表…', action: datasetList },
        { sep: true },
        { label: '运行语法…', action: () => { Windows.open('syntax'); } },
        { label: '语法编辑器', action: () => Windows.open('syntax') },
        { sep: true },
        { label: '输出查看器', action: () => Windows.open('output') },
        { label: '清空输出', action: () => { ensureOutput(); Viewer.clear(); } },
      ] },

      { label: '扩展', acc: 'X', items: [
        { label: '扩展中心…', action: () => Dialogs.open({
            title: '扩展中心', width: 560,
            body: '<div class="hint" style="line-height:1.9">本 Web 版暂不提供扩展市场。' +
              '统计分析能力由后端 Python（pandas / scipy / statsmodels）直接提供，' +
              '如需新增过程，请在 <b>backend/procedures.py</b> 中注册后重启服务。</div>',
            buttons: [{ text: '关闭', cls: 'primary', onClick: () => Dialogs.close() }],
          }) },
        { sep: true },
        { label: '实用程序库…', action: () => Dialogs.open({
            title: '实用程序库', width: 560,
            body: '<div class="hint" style="line-height:1.9">当前可用：语法编辑器、输出查看器、变量列表、数据集列表。</div>',
            buttons: [{ text: '关闭', cls: 'primary', onClick: () => Dialogs.close() }],
          }) },
      ] },

      { label: '窗口', acc: 'W', items: [
        { label: '数据编辑器', check: () => Windows.activeType === 'data', action: () => Windows.focus('data') },
        { label: '输出查看器', check: () => Windows.activeType === 'output', action: () => Windows.open('output') },
        { label: '语法编辑器', check: () => Windows.activeType === 'syntax', action: () => Windows.open('syntax') },
        { sep: true },
        { label: '关闭当前窗口', action: () => { if (Windows.activeType) Windows.close(Windows.activeType); } },
      ] },

      { label: '帮助', acc: 'H', items: [
        { label: '主题…', action: () => Dialogs.open({
            title: '帮助主题', width: 620,
            body: '<div class="hint" style="line-height:1.9">' +
              '<b>SPSS Web 使用要点</b><br>' +
              '1. 用「文件 → 打开 → 数据」导入 CSV / Excel / SAV，或打开内置示例数据。<br>' +
              '2. 在数据编辑器中双击单元格编辑数据；在「变量视图」中定义变量属性。<br>' +
              '3. 从「分析」菜单选择统计过程，结果会显示在<b>输出查看器</b>窗口中。<br>' +
              '4. 「实用程序 → 语法编辑器」可编写并运行 SPSS 语法命令。<br>' +
              '5. 数据管理：计算变量、重新编码、排序、筛选、拆分、加权、汇总、转置。' +
              '</div>',
            buttons: [{ text: '关闭', cls: 'primary', onClick: () => Dialogs.close() }],
          }) },
        { sep: true },
        { label: '语法参考（命令定义库）…', action: syntaxRefDialog },
        { label: '语法参考手册（PDF）…', action: openSyntaxPdf },
        { sep: true },
        { label: '关于 IBM SPSS Statistics Web', action: Dialogs.about },
      ] },
    ];
  }

  // ---------------------------------------------------------------- 窗口注册
  Windows.register('data', {
    title: () => 'IBM SPSS Statistics 数据编辑器',
    menus: dataMenus(),
    toolbar: [
      { icon: 'open', title: '打开数据文档', action: importData },
      { icon: 'save', title: '保存当前数据（导出 Excel）', action: () => exportData('xlsx') },
      { icon: 'print', title: '打印数据', action: printData },
      { sep: true },
      { icon: 'undo', title: '撤销', action: () => Dialogs.toast('暂无可撤销的操作') },
      { icon: 'redo', title: '重做', action: () => Dialogs.toast('暂无可重做的操作') },
      { sep: true },
      { icon: 'gotoCase', title: '转至个案', action: gotoCaseDialog },
      { icon: 'find', title: '查找', action: findDialog },
      { sep: true },
      { icon: 'variables', title: '变量列表', action: variableList },
      { icon: 'labelsBoth', title: '查看值（值标签 / 变量名）', action: toggleHeaderMode },
      { sep: true },
      { icon: 'insertCase', title: '插入个案', action: addRow },
      { icon: 'insertVar', title: '插入变量', action: addVariable },
      { icon: 'delVar', title: '删除变量', action: deleteVariableDialog },
      { sep: true },
      { icon: 'weight', title: '加权个案', action: () => Dialogs.T.weight(vars(), run) },
      { icon: 'selectCases', title: '选择个案', action: () => Dialogs.T.select(vars(), run) },
      { icon: 'splitFile', title: '拆分文件', action: () => Dialogs.T.split(vars(), run) },
      { sep: true },
      { icon: 'search', title: '查找变量', action: gotoVariableDialog, wide: true },
    ],
    content: (el) => {
      el.innerHTML =
        '<div class="refbar">' +
          '<input id="refBox" type="text" spellcheck="false" readonly value="">' +
          '<span class="visible-count" id="visCount">可视：0/0 个变量</span>' +
        '</div>' +
        '<div class="grid-host" id="gridHost"><div id="gridWrap"></div></div>' +
        '<div class="editor-tabs">' +
          '<div class="etab" data-view="data">数据视图</div>' +
          '<div class="etab" data-view="variable">变量视图</div>' +
        '</div>';
      el.querySelectorAll('.etab').forEach(t =>
        t.addEventListener('click', () => setView(t.dataset.view)));
      refreshGrid();
      setView(App.view);
      // 窗口首次布局完成后再算一次（空白编辑器的占位列宽依赖容器宽度）
      requestAnimationFrame(() => {
        if (!App.dataset && App.view === 'data') refreshGrid();
      });
    },
    statusBar: () => {
      const ds = App.dataset;
      const segs = [{ flat: true, text: statusMsg }];
      if (ds) {
        segs.push({ text: `${ds.total} 个个案` });
        segs.push({ text: `${ds.variables.length} 个变量` });
        if (ds.filterVar) segs.push({ text: '筛选：' + ds.filterVar });
        if (ds.splitVar) segs.push({ text: '拆分：' + ds.splitVar });
        if (ds.weightVar) segs.push({ text: '加权：' + ds.weightVar });
      }
      return Windows.readySegments(segs);
    },
  });

  Windows.register('output', {
    title: () => 'IBM SPSS Statistics 输出查看器',
    menus: [
      { label: '文件', acc: 'F', items: [
        { label: '导出为 HTML…', action: printOutput },
        { label: '打印…', action: () => window.print() },
        { sep: true },
        { label: '关闭窗口', action: () => Windows.close('output') },
      ] },
      { label: '编辑', acc: 'E', items: [
        { label: '清空输出', action: () => Viewer.clear() },
      ] },
      { label: '查看', acc: 'V', items: [
        { label: '全部展开', action: () => toggleOutline(true) },
        { label: '全部折叠', action: () => toggleOutline(false) },
        { sep: true },
        { label: '数据编辑器', action: () => Windows.focus('data') },
        { label: '语法编辑器', action: () => Windows.open('syntax') },
      ] },
      { label: '窗口', acc: 'W', items: [
        { label: '数据编辑器', action: () => Windows.focus('data') },
        { label: '输出查看器', check: () => Windows.activeType === 'output', action: () => Windows.focus('output') },
        { label: '语法编辑器', action: () => Windows.open('syntax') },
        { sep: true },
        { label: '关闭当前窗口', action: () => Windows.close('output') },
      ] },
      { label: '帮助', acc: 'H', items: [
        { label: '语法参考（命令定义库）…', action: syntaxRefDialog },
        { label: '语法参考手册（PDF）…', action: openSyntaxPdf },
        { sep: true },
        { label: '关于 IBM SPSS Statistics Web', action: Dialogs.about },
      ] },
    ],
    toolbar: [
      { icon: 'printOut', title: '打印输出', action: () => window.print() },
      { icon: 'export', title: '导出输出为 HTML', action: printOutput },
      { sep: true },
      { icon: 'promote', title: '提升层级', action: () => Dialogs.toast('大纲层级调整暂未开放') },
      { icon: 'demote', title: '降低层级', action: () => Dialogs.toast('大纲层级调整暂未开放') },
      { sep: true },
      { icon: 'expandAll', title: '全部展开', action: () => toggleOutline(true) },
      { icon: 'collapseAll', title: '全部折叠', action: () => toggleOutline(false) },
      { sep: true },
      { icon: 'close', title: '清空输出', action: () => Viewer.clear() },
    ],
    content: (el) => {
      el.innerHTML =
        '<div class="out-split">' +
          '<div class="outline-pane">' +
            '<div class="outline-head">大纲</div>' +
            '<div class="outline-body" id="outTree"></div>' +
          '</div>' +
          '<div class="output-pane" id="outputWrap"></div>' +
        '</div>';
      Viewer.renderAll();
    },
    statusBar: () => Windows.readySegments([
      { flat: true, text: `${Viewer.blocks.length} 个输出块` },
    ]),
  });

  Windows.register('syntax', {
    title: () => 'IBM SPSS Statistics 语法编辑器',
    menus: [
      { label: '文件', acc: 'F', items: [
        { label: '打开语法文件…', action: openSyntaxFile },
        { label: '保存语法文件…', action: saveSyntaxFile },
        { sep: true },
        { label: '打印…', action: () => window.print() },
        { sep: true },
        { label: '关闭窗口', action: () => Windows.close('syntax') },
      ] },
      { label: '编辑', acc: 'E', items: [
        { label: '清空', action: clearSyntax },
      ] },
      { label: '运行', acc: 'R', items: [
        { label: '运行全部', hint: 'Ctrl+R', action: runSyntaxFromWindow },
        { label: '语法检查（按命令定义库）', action: checkSyntax },
        { sep: true },
        { label: '数据编辑器', action: () => Windows.focus('data') },
        { label: '输出查看器', action: () => Windows.open('output') },
      ] },
      { label: '窗口', acc: 'W', items: [
        { label: '数据编辑器', action: () => Windows.focus('data') },
        { label: '输出查看器', action: () => Windows.open('output') },
        { label: '语法编辑器', check: () => Windows.activeType === 'syntax', action: () => Windows.focus('syntax') },
        { sep: true },
        { label: '关闭当前窗口', action: () => Windows.close('syntax') },
      ] },
      { label: '帮助', acc: 'H', items: [
        { label: '语法参考（命令定义库）…', action: syntaxRefDialog },
        { label: '语法参考手册（PDF）…', action: openSyntaxPdf },
        { sep: true },
        { label: '关于 IBM SPSS Statistics Web', action: Dialogs.about },
      ] },
    ],
    toolbar: [
      { icon: 'run', title: '运行语法', action: runSyntaxFromWindow },
      { icon: 'check', title: '语法检查', action: checkSyntax },
      { sep: true },
      { icon: 'open', title: '打开语法文件', action: openSyntaxFile },
      { icon: 'saveAs', title: '保存语法文件', action: saveSyntaxFile },
      { icon: 'print', title: '打印语法', action: () => window.print() },
      { sep: true },
      { icon: 'close', title: '清空语法', action: clearSyntax },
    ],
    content: (el) => {
      el.innerHTML =
        '<div class="syntax-host">' +
          '<div class="syntax-samples" id="syntaxSamples"></div>' +
          '<textarea class="syntax-area" id="syntaxText" spellcheck="false" ' +
            'placeholder="在此输入 SPSS 语法命令，每条命令以英文句点「.」结尾。输入时自动提示关键字，Ctrl+空格 手动触发。"></textarea>' +
        '</div>';
      const ta = el.querySelector('#syntaxText');
      const box = el.querySelector('#syntaxSamples');
      SYNTAX_SAMPLES.forEach(s => {
        const b = document.createElement('button');
        b.className = 'samp';
        b.textContent = s.title;
        b.title = s.code;
        b.addEventListener('click', () => { ta.value = s.code; syntaxText = s.code; ta.focus(); });
        box.appendChild(b);
      });
      ta.value = syntaxText || (SYNTAX_SAMPLES[0] ? SYNTAX_SAMPLES[0].code : '');
      ta.addEventListener('input', () => { syntaxText = ta.value; scheduleCompletions(ta); });
      ta.addEventListener('keydown', onSyntaxKeydown);
      ta.addEventListener('click', hideCompletions);
      ta.addEventListener('blur', () => setTimeout(hideCompletions, 120));
    },
    statusBar: () => Windows.readySegments([
      { flat: true, text: '语法编辑器就绪' },
      { flat: true, text: 'Ctrl+Enter 运行 · Ctrl+空格 补全' },
    ]),
  });

  function openSyntaxFile() {
    pickFile('.sps,.txt', (f) => {
      const r = new FileReader();
      r.onload = () => {
        syntaxText = String(r.result);
        const ta = document.getElementById('syntaxText');
        if (ta) { ta.value = syntaxText; ta.focus(); }
        Dialogs.toast(`已打开 ${f.name}`, 'ok');
      };
      r.readAsText(f, 'utf-8');
    });
  }

  function clearSyntax() {
    syntaxText = '';
    const ta = document.getElementById('syntaxText');
    if (ta) { ta.value = ''; ta.focus(); }
  }

  function saveSyntaxFile() {
    const ta = document.getElementById('syntaxText');
    const code = ta ? ta.value : syntaxText;
    if (!code || !code.trim()) { Dialogs.toast('语法为空', 'err'); return; }
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `SPSS语法_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.sps`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    Dialogs.toast('语法文件已保存', 'ok');
  }

  // ---------------------------------------------------------------- 初始化
  async function init() {
    Windows.open('data');
    setStatus('就绪 · 请从「文件 → 打开」开始');

    Windows.onFocus(() => { /* 保留：窗口切换钩子 */ });

    // 空白编辑器的占位列数随窗口宽度变化
    let rzTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(rzTimer);
      rzTimer = setTimeout(() => {
        if (!App.dataset && App.view === 'data' && Windows.isOpen('data')) refreshGrid();
      }, 180);
    });

    // 全局快捷键
    document.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!Windows.activeType) return;
      if (e.ctrlKey && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); findDialog(); }
      else if (e.ctrlKey && (e.key === 'g' || e.key === 'G')) { e.preventDefault(); gotoCaseDialog(); }
      else if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
        if (Windows.activeType === 'data') { e.preventDefault(); selectAllCases(); }
      }
    });

    try {
      const s = await API.samples();
      App.samples = s.samples || [];
    } catch (e) { /* ignore */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // 对外暴露的编程接口（供控制台 / 自动化脚本调用）
  App.run = run;
  App.openSample = openSample;
  App.loadDataset = loadDataset;
  App.analyze = doAnalyze;
  App.transform = doTransform;
  App.runSyntax = executeSyntax;
  App.runSyntaxWindow = runSyntaxFromWindow;
  App.refresh = refreshGrid;
  App.setView = setView;
  App.newDataset = newDataset;
  App.windows = Windows;
  App.importData = importData;
  App.exportData = exportData;
  App.vars = vars;
  App.samplesList = SYNTAX_SAMPLES;
  App.spssSampleDialog = spssSampleDialog;
  App.loadSpssSample = loadSpssSample;
  App.syntaxRef = syntaxRefDialog;
  App.checkSyntax = checkSyntax;
  App.syntaxPdf = openSyntaxPdf;
  App.syntaxComplete = (text, offset) => API.syntaxComplete(text, offset);
})(window);
