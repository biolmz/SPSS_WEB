/* ============ 对话框框架 + 各类分析/转换对话框 ============ */
(function (global) {
  'use strict';

  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const TYPE_TXT = { numeric: '数值', string: '字符串', date: '日期' };
  const MEASURE_TXT = { scale: '度量', ordinal: '有序', nominal: '名义' };

  function typeTxt(v) {
    return `${TYPE_TXT[v.type] || v.type}${v.measure ? '·' + (MEASURE_TXT[v.measure] || v.measure) : ''}`;
  }

  // ---------------------------------------------------------------- 模态框
  let currentMask = null;

  function open(cfg) {
    close();
    const mask = document.getElementById('modalMask');
    const modal = document.getElementById('modal');
    modal.style.minWidth = (cfg.width || 560) + 'px';
    if (cfg.maxWidth) modal.style.maxWidth = cfg.maxWidth + 'px';
    modal.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'modal-head';
    head.innerHTML = `<span>${esc(cfg.title || '')}</span><span class="close" title="关闭">×</span>`;
    head.querySelector('.close').addEventListener('click', () => close());

    const body = document.createElement('div');
    body.className = 'modal-body';
    let bodyContent = cfg.body;
    if (typeof bodyContent === 'function') bodyContent = bodyContent();
    if (typeof bodyContent === 'string') body.innerHTML = bodyContent;
    else if (bodyContent instanceof Node) {
      body.appendChild(bodyContent);
      // 把构建函数挂在内容节点上的引用（_pair / _mp 等）提升到 modal-body，便于 onSubmit 读取
      Object.keys(bodyContent).forEach(k => { if (k.charAt(0) === '_') body[k] = bodyContent[k]; });
    }

    const foot = document.createElement('div');
    foot.className = 'modal-foot';

    const buttons = cfg.buttons || [
      { text: '确定', cls: 'primary', onClick: () => { if (!cfg.onSubmit || cfg.onSubmit() !== false) close(); } },
      { text: '重置', onClick: () => { if (cfg.onReset) cfg.onReset(); } },
      { text: '取消', onClick: () => close() },
    ];
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (b.cls || '');
      btn.textContent = b.text;
      btn.addEventListener('click', () => b.onClick && b.onClick());
      foot.appendChild(btn);
    });

    modal.append(head, body, foot);
    mask.classList.add('show');
    currentMask = mask;

    // 遮罩点击不关闭，避免误触
    mask.onclick = (e) => { if (e.target === mask && cfg.maskClose) close(); };

    const onKey = (e) => {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
        const p = foot.querySelector('.btn.primary');
        if (p) p.click();
      }
    };
    document.addEventListener('keydown', onKey);
    mask._onKey = onKey;
    if (cfg.onReady) setTimeout(() => cfg.onReady(body, modal), 0);
    return { body, modal, close };
  }

  function close() {
    const mask = document.getElementById('modalMask');
    if (mask._onKey) { document.removeEventListener('keydown', mask._onKey); mask._onKey = null; }
    mask.classList.remove('show');
    document.getElementById('modal').innerHTML = '';
    currentMask = null;
  }

  function toast(msg, type) {
    const box = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 3200);
    setTimeout(() => el.remove(), 3600);
  }

  function busy(on) {
    document.getElementById('busy').classList.toggle('show', !!on);
  }

  // ---------------------------------------------------------------- 列表框
  function makeBox(opts) {
    const el = document.createElement('div');
    el.className = 'listbox';
    let items = (opts.items || []).slice();
    let selected = new Set();

    function render() {
      el.innerHTML = '';
      if (!items.length) {
        el.innerHTML = '<div style="padding:6px 8px;color:#9aa9bb;font-size:12px">（空）</div>';
        return;
      }
      items.forEach(it => {
        const li = document.createElement('div');
        li.className = 'li' + (selected.has(it.name) ? ' sel' : '');
        li.innerHTML = `<span>${esc(it.name)}</span><span class="vt">${esc(typeTxt(it))}</span>` +
          (it.label ? `<span class="vlab">${esc(it.label)}</span>` : '');
        li.addEventListener('click', (e) => {
          if (!opts.multi) { selected = new Set([it.name]); }
          else if (e.ctrlKey || e.metaKey) {
            selected.has(it.name) ? selected.delete(it.name) : selected.add(it.name);
          } else { selected = new Set([it.name]); }
          render();
        });
        li.addEventListener('dblclick', () => opts.onDblClick && opts.onDblClick(it));
        el.appendChild(li);
      });
    }
    render();

    return {
      el,
      getItems: () => items.slice(),
      names: () => items.map(i => i.name),
      setItems(v) { items = v.slice(); selected = new Set(); render(); },
      getSelected: () => items.filter(i => selected.has(i.name)),
      removeSelected() { items = items.filter(i => !selected.has(i.name)); selected = new Set(); render(); },
      add(it) { if (!items.find(x => x.name === it.name)) items.push(it); render(); },
      clearSel() { selected = new Set(); render(); },
      render,
    };
  }

  function varPair(allVars, opts) {
    opts = opts || {};
    const wrap = document.createElement('div');
    wrap.className = 'dlg-row';

    const srcFilter = opts.sourceFilter || (() => true);
    const srcVars = allVars.filter(srcFilter);

    const leftCol = document.createElement('div');
    leftCol.className = 'dlg-col';
    leftCol.innerHTML = `<span class="dlg-label">${esc(opts.sourceLabel || '变量列表')}</span>`;
    const src = makeBox({ items: srcVars, multi: true });
    src.el.style.height = (opts.height || 230) + 'px';
    leftCol.appendChild(src.el);

    const mid = document.createElement('div');
    mid.className = 'dlg-mid';
    const bAdd = document.createElement('button');
    bAdd.className = 'btn arrow'; bAdd.textContent = '▸'; bAdd.title = '添加';
    const bRem = document.createElement('button');
    bRem.className = 'btn arrow-back'; bRem.textContent = '◂'; bRem.title = '移除';
    mid.append(bAdd, bRem);

    const rightCol = document.createElement('div');
    rightCol.className = 'dlg-col';
    rightCol.innerHTML = `<span class="dlg-label">${esc(opts.targetLabel || '分析变量')}</span>`;
    const tgt = makeBox({ items: [], multi: true });
    tgt.el.style.height = (opts.height || 230) + 'px';
    rightCol.appendChild(tgt.el);

    bAdd.addEventListener('click', () => {
      src.getSelected().forEach(it => {
        tgt.add(it);
        if (!opts.keepSource) src.setItems(src.getItems().filter(x => x.name !== it.name));
      });
      src.clearSel();
    });
    bRem.addEventListener('click', () => {
      const back = tgt.getSelected();
      tgt.removeSelected();
      if (!opts.keepSource) {
        const cur = src.getItems();
        back.forEach(it => { if (!cur.find(x => x.name === it.name)) cur.push(it); });
        cur.sort((a, b) => allVars.findIndex(v => v.name === a.name) - allVars.findIndex(v => v.name === b.name));
        src.setItems(cur);
      }
    });
    src.el.addEventListener('dblclick', () => bAdd.click());
    tgt.el.addEventListener('dblclick', () => bRem.click());

    wrap.append(leftCol, mid, rightCol);
    return { wrap, src, tgt, names: () => tgt.names() };
  }

  function fieldset(legend, inner) {
    return `<fieldset><legend>${esc(legend)}</legend>${inner}</fieldset>`;
  }

  /** 单变量列表 + 多个目标框（SPSS 风格：一个源列表配多个槽位）。 */
  function varMultiPair(allVars, targets, opts) {
    opts = opts || {};
    const wrap = document.createElement('div');
    wrap.className = 'dlg-row dlg-multi';

    const srcFilter = opts.sourceFilter || (() => true);
    const srcVars = allVars.filter(srcFilter);

    const srcCol = document.createElement('div');
    srcCol.className = 'dlg-col src-col';
    srcCol.innerHTML = `<span class="dlg-label">${esc(opts.sourceLabel || '变量列表')}</span>`;
    const src = makeBox({ items: srcVars, multi: true });
    src.el.style.height = (opts.height || 268) + 'px';
    srcCol.appendChild(src.el);

    const tgtCol = document.createElement('div');
    tgtCol.className = 'dlg-col tgt-col';
    const boxes = [];

    function returnItems(box) {
      if (opts.keepSource) return;
      const back = box.getSelected();
      box.removeSelected();
      const cur = src.getItems();
      back.forEach(it => { if (!cur.find(x => x.name === it.name)) cur.push(it); });
      cur.sort((a, b) => allVars.findIndex(v => v.name === a.name) - allVars.findIndex(v => v.name === b.name));
      src.setItems(cur);
    }

    targets.forEach(t => {
      const row = document.createElement('div');
      row.className = 'tgt-row';
      const lbl = document.createElement('span');
      lbl.className = 'dlg-label';
      lbl.textContent = t.label;
      const bodyEl = document.createElement('div');
      bodyEl.className = 'tgt-body';

      const btn = document.createElement('button');
      btn.className = 'btn arrow';
      btn.textContent = '▸';
      btn.title = '添加到「' + t.label + '」';
      btn.addEventListener('click', () => {
        const sel = src.getSelected();
        sel.forEach(it => box.add(it));
        if (!opts.keepSource) src.setItems(src.getItems().filter(x => !sel.find(s => s.name === x.name)));
        src.clearSel();
      });

      const box = makeBox({ items: [], multi: true });
      box.el.style.height = (t.height || 66) + 'px';
      box.el.addEventListener('dblclick', () => returnItems(box));
      boxes.push(box);

      bodyEl.append(btn, box.el);
      row.append(lbl, bodyEl);
      tgtCol.appendChild(row);
    });

    src.el.addEventListener('dblclick', () => {
      const first = tgtCol.querySelector('button.arrow');
      if (first) first.click();
    });

    wrap.append(srcCol, tgtCol);
    return { wrap, src, boxes, names: (i) => boxes[i].names() };
  }

  function checks(name, items, defaults) {
    const def = defaults || {};
    return items.map(([val, label]) =>
      `<label class="chk"><input type="checkbox" data-group="${name}" value="${val}"${def[val] ? ' checked' : ''}> ${esc(label)}</label>`
    ).join('');
  }

  function readChecks(root, name) {
    const out = {};
    root.querySelectorAll(`input[data-group="${name}"]`).forEach(i => { out[i.value] = i.checked; });
    return out;
  }

  function radio(name, items, def) {
    return items.map(([val, label]) =>
      `<label class="chk"><input type="radio" name="${name}" value="${val}"${val === def ? ' checked' : ''}> ${esc(label)}</label>`
    ).join('');
  }

  function readRadio(root, name) {
    const el = root.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : null;
  }

  function selectEl(id, items, def) {
    return `<select id="${id}">` + items.map(([v, t]) =>
      `<option value="${v}"${v === def ? ' selected' : ''}>${esc(t)}</option>`).join('') + '</select>';
  }

  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value : null;
  }

  // ================================================================
  //  分析对话框
  // ================================================================

  const A = {};

  A.frequencies = (vars, run) => {
    open({
      title: '频率', width: 700,
      body: () => {
        const d = document.createElement('div');
        d.innerHTML = '<div id="pairHolder"></div>';
        const pair = varPair(vars, { targetLabel: '变量', keepSource: true, height: 200 });
        d.querySelector('#pairHolder').replaceWith(pair.wrap);
        const opt = document.createElement('div');
        opt.innerHTML =
          fieldset('统计量', checks('stat', [
            ['mean', '均值'], ['median', '中位数'], ['mode', '众数'], ['std', '标准差'],
            ['variance', '方差'], ['range', '全距'], ['min', '最小值'], ['max', '最大值'],
            ['sum', '合计'], ['seMean', '均值的标准误'], ['skew', '偏度'], ['kurt', '峰度'],
          ], { mean: true, std: true })) +
          fieldset('图表', checks('chart', [['bar', '条形图'], ['pie', '饼图'], ['histogram', '直方图']], { bar: true }));
        d.appendChild(opt);
        d._pair = pair;
        return d;
      },
      onSubmit: () => {
        const body = document.querySelector('.modal-body');
        const names = body._pair.names();
        if (!names.length) { toast('请至少选择一个变量', 'err'); return false; }
        run('frequencies', { variables: names, statistics: readChecks(body, 'stat'), charts: readChecks(body, 'chart') }, '频率');
      },
    });
  };

  A.descriptives = (vars, run) => {
    open({
      title: '描述', width: 700,
      body: () => {
        const d = document.createElement('div');
        const pair = varPair(vars, { targetLabel: '变量', keepSource: true, height: 200,
          sourceFilter: v => v.type === 'numeric' });
        d.appendChild(pair.wrap);
        d.insertAdjacentHTML('beforeend', fieldset('选项', checks('opt', [
          ['mean', '均值'], ['std', '标准差'], ['variance', '方差'], ['range', '全距'],
          ['min', '最小值'], ['max', '最大值'], ['sum', '合计'], ['seMean', '均值的标准误'],
          ['skew', '偏度'], ['kurt', '峰度'],
        ], { mean: true, std: true, min: true, max: true })));
        d._pair = pair;
        return d;
      },
      onSubmit: () => {
        const body = document.querySelector('.modal-body');
        const names = body._pair.names();
        if (!names.length) { toast('请至少选择一个变量', 'err'); return false; }
        run('descriptives', { variables: names, options: readChecks(body, 'opt') }, '描述统计');
      },
    });
  };

  A.explore = (vars, run) => {
    open({
      title: '探索', width: 720,
      body: () => {
        const d = document.createElement('div');
        const mp = varMultiPair(vars, [
          { label: '因变量列表', height: 96 },
          { label: '因子列表（可选）', height: 76 },
        ], { height: 250 });
        d.appendChild(mp.wrap);
        d.insertAdjacentHTML('beforeend', fieldset('图', checks('plot',
          [['boxplot', '箱图'], ['histogram', '直方图'], ['normality', '含检验的正态图']],
          { boxplot: true, histogram: true, normality: false })));
        d._mp = mp;
        return d;
      },
      onSubmit: () => {
        const body = document.querySelector('.modal-body');
        const deps = body._mp.names(0);
        if (!deps.length) { toast('请选择因变量', 'err'); return false; }
        run('explore', { dependents: deps, factors: body._mp.names(1), plots: readChecks(body, 'plot') }, '探索');
      },
    });
  };

  A.crosstabs = (vars, run) => {
    open({
      title: '交叉表', width: 720,
      body: () => {
        const d = document.createElement('div');
        const mp = varMultiPair(vars, [
          { label: '行变量（最多 1 个）', height: 62 },
          { label: '列变量（最多 1 个）', height: 62 },
          { label: '层变量（可选，最多 1 个）', height: 62 },
        ], { height: 270 });
        d.appendChild(mp.wrap);
        d.insertAdjacentHTML('beforeend',
          fieldset('统计量', checks('stat', [['chi2', '卡方'], ['phi', 'Phi 和 Cramer\'s V']], { chi2: true })) +
          fieldset('单元格显示', checks('cell', [
            ['observed', '实测'], ['expected', '期望'], ['rowPct', '行百分比'],
            ['colPct', '列百分比'], ['totalPct', '总计百分比']], { observed: true })));
        d._mp = mp;
        return d;
      },
      onSubmit: () => {
        const body = document.querySelector('.modal-body');
        const rows = body._mp.names(0), cols = body._mp.names(1);
        if (!rows.length || !cols.length) { toast('请同时选择行变量与列变量', 'err'); return false; }
        run('crosstabs', {
          rows: rows.slice(0, 1), cols: cols.slice(0, 1), layers: body._mp.names(2).slice(0, 1),
          statistics: readChecks(body, 'stat'), cells: readChecks(body, 'cell'),
        }, '交叉表');
      },
    });
  };

  A.means = (vars, run) => {
    open({
      title: '均值', width: 700,
      body: () => {
        const d = document.createElement('div');
        const mp = varMultiPair(vars, [
          { label: '因变量', height: 100 },
          { label: '自变量（层，可选）', height: 100 },
        ], { height: 240, sourceFilter: () => true });
        d.appendChild(mp.wrap);
        d._mp = mp;
        return d;
      },
      onSubmit: () => {
        const body = document.querySelector('.modal-body');
        if (!body._mp.names(0).length) { toast('请选择因变量', 'err'); return false; }
        run('means', { dependents: body._mp.names(0), independents: body._mp.names(1).slice(0, 1), plot: true }, '均值');
      },
    });
  };

  A.ttest_one = (vars, run) => {
    open({
      title: '单样本 T 检验', width: 620,
      body: () => {
        const d = document.createElement('div');
        const p = varPair(vars.filter(v => v.type === 'numeric'), { targetLabel: '检验变量', keepSource: true, height: 220 });
        d.appendChild(p.wrap);
        d.insertAdjacentHTML('beforeend',
          `<div class="dlg-row"><div class="dlg-col"><label class="dlg-label">检验值</label>
           <input type="number" id="testVal" value="0" step="any" style="width:140px"></div></div>`);
        d._pair = p;
        return d;
      },
      onSubmit: () => {
        const body = document.querySelector('.modal-body');
        if (!body._pair.names().length) { toast('请选择检验变量', 'err'); return false; }
        run('ttest_one', { variables: body._pair.names(), testValue: parseFloat(val('testVal') || 0) }, '单样本 T 检验');
      },
    });
  };

  A.ttest_ind = (vars, run) => {
    open({
      title: '独立样本 T 检验', width: 640,
      body: () => {
        const d = document.createElement('div');
        const p = varPair(vars.filter(v => v.type === 'numeric'), { targetLabel: '检验变量', keepSource: true, height: 190 });
        d.appendChild(p.wrap);
        d.insertAdjacentHTML('beforeend',
          `<div class="dlg-row">
             <div class="dlg-col"><label class="dlg-label">分组变量</label>
               <select id="grpVar">${vars.map(v => `<option value="${esc(v.name)}">${esc(v.name)}${v.label ? ' · ' + esc(v.label) : ''}</option>`).join('')}</select></div>
             <div class="dlg-col"><label class="dlg-label">组 1 值</label><input type="text" id="g1" style="width:80px"></div>
             <div class="dlg-col"><label class="dlg-label">组 2 值</label><input type="text" id="g2" style="width:80px"></div>
           </div>
           <div class="hint">提示：分组变量通常为二分类（如 1/2）。点击「自动填充」可读取该变量的前两个取值。</div>
           <div style="margin-top:6px"><button class="btn" id="autoFill">自动填充</button></div>`);
        d._pair = p;
        setTimeout(() => {
          const sel = document.getElementById('grpVar');
          const fill = () => {
            const v = vars.find(x => x.name === sel.value);
            if (!v) return;
            const recs = global.App && global.App.dataset ? global.App.dataset.rows : [];
            const idx = global.App.dataset.variables.findIndex(x => x.name === v.name);
            const seen = [];
            for (const r of recs) {
              const x = r[idx];
              if (x === null || x === undefined) continue;
              if (!seen.includes(x)) seen.push(x);
              if (seen.length >= 2) break;
            }
            if (seen[0] !== undefined) document.getElementById('g1').value = seen[0];
            if (seen[1] !== undefined) document.getElementById('g2').value = seen[1];
          };
          document.getElementById('autoFill').addEventListener('click', fill);
          sel.addEventListener('change', fill);
          fill();
        }, 0);
        return d;
      },
      onSubmit: () => {
        const body = document.querySelector('.modal-body');
        if (!body._pair.names().length) { toast('请选择检验变量', 'err'); return false; }
        const gv = val('grpVar');
        const parse = (s) => { const n = parseFloat(s); return isNaN(n) ? s : n; };
        run('ttest_ind', { testVars: body._pair.names(), groupVar: gv,
          groupValues: [parse(val('g1')), parse(val('g2'))] }, '独立样本 T 检验');
      },
    });
  };

  A.ttest_paired = (vars, run) => {
    open({
      title: '配对样本 T 检验', width: 700,
      body: () => {
        const d = document.createElement('div');
        const p = varPair(vars.filter(v => v.type === 'numeric'), { targetLabel: '成对变量（按顺序两两配对）', keepSource: true, height: 230 });
        d.appendChild(p.wrap);
        d.insertAdjacentHTML('beforeend', '<div class="hint">选择偶数个变量，将按选择顺序两两配对：第 1-2 个为一对，第 3-4 个为一对，依此类推。</div>');
        d._pair = p;
        return d;
      },
      onSubmit: () => {
        const body = document.querySelector('.modal-body');
        const names = body._pair.names();
        if (names.length < 2) { toast('请至少选择两个变量', 'err'); return false; }
        const pairs = [];
        for (let i = 0; i + 1 < names.length; i += 2) pairs.push([names[i], names[i + 1]]);
        run('ttest_paired', { pairs }, '配对样本 T 检验');
      },
    });
  };

  A.anova_oneway = (vars, run) => {
    open({
      title: '单因素方差分析', width: 680,
      body: () => {
        const d = document.createElement('div');
        const mp = varMultiPair(vars, [
          { label: '因变量（1 个）', height: 70 },
          { label: '因子（1 个）', height: 70 },
        ], { height: 220 });
        d.appendChild(mp.wrap);
        d.insertAdjacentHTML('beforeend', fieldset('选项',
          checks('opt', [['descriptives', '描述性'], ['homogeneity', '方差齐性检验'], ['meansPlot', '均值图']],
            { descriptives: true, homogeneity: true, meansPlot: true }) +
          checks('post', [['lsd', '事后多重比较 (LSD)']], { lsd: true })));
        d._mp = mp;
        return d;
      },
      onSubmit: () => {
        const body = document.querySelector('.modal-body');
        const deps = body._mp.names(0), facs = body._mp.names(1);
        if (!deps.length || !facs.length) { toast('请选择因变量与因子', 'err'); return false; }
        const opt = readChecks(body, 'opt');
        const post = readChecks(body, 'post');
        run('anova_oneway', {
          dependent: deps[0], factor: facs[0],
          descriptives: opt.descriptives, homogeneity: opt.homogeneity, meansPlot: opt.meansPlot,
          posthoc: !!post.lsd,
        }, '单因素方差分析');
      },
    });
  };

  A.anova_glm = (vars, run) => {
    open({
      title: '单变量一般线性模型', width: 720,
      body: () => {
        const d = document.createElement('div');
        const mp = varMultiPair(vars, [
          { label: '因变量（1 个）', height: 66 },
          { label: '固定因子', height: 66 },
          { label: '协变量', height: 66 },
        ], { height: 270 });
        d.appendChild(mp.wrap);
        d._mp = mp;
        return d;
      },
      onSubmit: () => {
        const body = document.querySelector('.modal-body');
        const deps = body._mp.names(0);
        if (!deps.length) { toast('请选择因变量', 'err'); return false; }
        run('anova_glm', { dependent: deps[0], factors: body._mp.names(1), covariates: body._mp.names(2) }, '单变量线性模型');
      },
    });
  };

  A.correlation = (vars, run) => {
    open({
      title: '双变量相关', width: 700,
      body: () => {
        const d = document.createElement('div');
        const p = varPair(vars.filter(v => v.type === 'numeric'), { targetLabel: '变量', keepSource: true, height: 210 });
        d.appendChild(p.wrap);
        d.insertAdjacentHTML('beforeend',
          fieldset('相关系数', radio('method', [['pearson', '皮尔逊 (Pearson)'], ['spearman', '斯皮尔曼 (Spearman)'], ['kendall', '肯德尔 (Kendall)']], 'pearson')) +
          fieldset('选项', checks('opt', [['matrix', '输出相关矩阵'], ['scatter', '输出散点图'], ['flagSignificant', '标记显著相关']],
            { matrix: true, flagSignificant: true })));
        d._pair = p;
        return d;
      },
      onSubmit: () => {
        const body = document.querySelector('.modal-body');
        const names = body._pair.names();
        if (names.length < 2) { toast('请至少选择两个变量', 'err'); return false; }
        const opt = readChecks(body, 'opt');
        run('correlation', { variables: names, method: readRadio(body, 'method'), matrix: opt.matrix,
          scatter: opt.scatter, flagSignificant: opt.flagSignificant }, '相关分析');
      },
    });
  };

  A.partial_corr = (vars, run) => {
    open({
      title: '偏相关', width: 700,
      body: () => {
        const d = document.createElement('div');
        const p = varPair(vars.filter(v => v.type === 'numeric'), { targetLabel: '变量', keepSource: true, height: 180 });
        const c = varPair(vars.filter(v => v.type === 'numeric'), { sourceLabel: '控制变量', targetLabel: '控制变量', keepSource: true, height: 150 });
        d.appendChild(p.wrap); d.appendChild(c.wrap);
        d._pair = p; d._ctl = c;
        return d;
      },
      onSubmit: () => {
        const body = document.querySelector('.modal-body');
        if (body._pair.names().length < 2) { toast('请至少选择两个变量', 'err'); return false; }
        run('partial_corr', { variables: body._pair.names(), control: body._ctl.names() }, '偏相关');
      },
    });
  };

  A.regression_linear = (vars, run) => {
    open({
      title: '线性回归', width: 720,
      body: () => {
        const d = document.createElement('div');
        const mp = varMultiPair(vars, [
          { label: '因变量（1 个）', height: 76 },
          { label: '自变量', height: 130 },
        ], { height: 250, sourceFilter: v => v.type === 'numeric' });
        d.appendChild(mp.wrap);
        d.insertAdjacentHTML('beforeend', fieldset('选项',
          checks('opt', [['collinearity', '共线性诊断'], ['residualPlots', '残差图']], { collinearity: true, residualPlots: true })));
        d._mp = mp;
        return d;
      },
      onSubmit: () => {
        const body = document.querySelector('.modal-body');
        const deps = body._mp.names(0);
        if (!deps.length || !body._mp.names(1).length) { toast('请选择因变量与自变量', 'err'); return false; }
        const opt = readChecks(body, 'opt');
        run('regression_linear', { dependent: deps[0], independents: body._mp.names(1),
          collinearity: opt.collinearity, residualPlots: opt.residualPlots }, '线性回归');
      },
    });
  };

  A.regression_logistic = (vars, run) => {
    open({
      title: '二元 Logistic 回归', width: 720,
      body: () => {
        const d = document.createElement('div');
        const mp = varMultiPair(vars, [
          { label: '因变量（二分类，1 个）', height: 76 },
          { label: '协变量', height: 130 },
        ], { height: 250 });
        d.appendChild(mp.wrap);
        d.insertAdjacentHTML('beforeend', '<div class="hint">因变量需为二分类（两个取值）。第二个取值将作为事件（编码为 1）。</div>');
        d._mp = mp;
        return d;
      },
      onSubmit: () => {
        const body = document.querySelector('.modal-body');
        const deps = body._mp.names(0);
        if (!deps.length || !body._mp.names(1).length) { toast('请选择因变量与自变量', 'err'); return false; }
        run('regression_logistic', { dependent: deps[0], independents: body._mp.names(1) }, '二元 Logistic 回归');
      },
    });
  };

  function nonparamDialog(kind, title, needs) {
    return (vars, run) => {
      open({
        title, width: 640,
        body: () => {
          const d = document.createElement('div');
          if (needs === 'var') {
            const p = varPair(vars, { targetLabel: '检验变量（1 个）', keepSource: true, height: 220 });
            d.appendChild(p.wrap); d._p = p;
          } else if (needs === 'var+group') {
            const p = varPair(vars.filter(v => v.type === 'numeric'), { targetLabel: '检验变量（1 个）', keepSource: true, height: 170 });
            const g = varPair(vars, { sourceLabel: '分组变量', targetLabel: '分组变量（1 个）', keepSource: true, height: 150 });
            d.appendChild(p.wrap); d.appendChild(g.wrap);
            d._p = p; d._g = g;
            if (kind === 'mannwhitney') {
              d.insertAdjacentHTML('beforeend',
                `<div class="dlg-row"><div class="dlg-col"><label class="dlg-label">组 1 值</label><input type="text" id="g1" style="width:80px"></div>
                 <div class="dlg-col"><label class="dlg-label">组 2 值</label><input type="text" id="g2" style="width:80px"></div></div>`);
            }
          } else {
            const p = varPair(vars.filter(v => v.type === 'numeric'), { targetLabel: '检验变量（多个）', keepSource: true, height: 220 });
            d.appendChild(p.wrap); d._p = p;
          }
          if (kind === 'binomial') {
            d.insertAdjacentHTML('beforeend', `<div class="dlg-row"><div class="dlg-col"><label class="dlg-label">检验比例</label>
              <input type="number" id="tv" value="0.5" step="0.01" min="0" max="1" style="width:110px"></div></div>`);
          }
          return d;
        },
        onSubmit: () => {
          const body = document.querySelector('.modal-body');
          const names = body._p ? body._p.names() : [];
          if (!names.length) { toast('请选择检验变量', 'err'); return false; }
          const params = { kind, variable: names[0] };
          if (needs === 'var+group') {
            const gn = body._g.names();
            if (!gn.length) { toast('请选择分组变量', 'err'); return false; }
            params.factor = gn[0];
            params.groupVar = gn[0];
            if (kind === 'mannwhitney') {
              const parse = (s) => { const n = parseFloat(s); return isNaN(n) ? s : n; };
              params.groupValues = [parse(val('g1')), parse(val('g2'))];
            }
          }
          if (needs === 'multi') params.variables = names;
          if (kind === 'binomial') params.testValue = parseFloat(val('tv') || 0.5);
          run('nonparam', params, title);
        },
      });
    };
  }

  A.np_chisquare = nonparamDialog('chisquare', '卡方检验', 'var');
  A.np_binomial = nonparamDialog('binomial', '二项检验', 'var');
  A.np_runs = nonparamDialog('runs', '游程检验', 'var');
  A.np_mannwhitney = nonparamDialog('mannwhitney', 'Mann-Whitney U 检验', 'var+group');
  A.np_kruskal = nonparamDialog('kruskal', 'Kruskal-Wallis H 检验', 'var+group');
  A.np_wilcoxon = nonparamDialog('wilcoxon', 'Wilcoxon 符号秩检验', 'multi');
  A.np_friedman = nonparamDialog('friedman', 'Friedman 检验', 'multi');

  A.factor = (vars, run) => {
    open({
      title: '因子分析', width: 700,
      body: () => {
        const d = document.createElement('div');
        const p = varPair(vars.filter(v => v.type === 'numeric'), { targetLabel: '变量', keepSource: true, height: 200 });
        d.appendChild(p.wrap);
        d.insertAdjacentHTML('beforeend',
          fieldset('提取', `<div class="form-grid">
            <label class="chk"><input type="checkbox" id="kaiser" checked> 特征值大于 1</label>
            <label class="chk"><input type="checkbox" id="manual"> 固定因子数</label>
            <input type="number" id="nf" value="3" min="1" max="20" style="width:80px">
          </div>`) +
          fieldset('旋转', radio('rot', [['varimax', '最大方差法 (Varimax)'], ['none', '不旋转']], 'varimax')));
        d._pair = p;
        return d;
      },
      onSubmit: () => {
        const body = document.querySelector('.modal-body');
        const names = body._pair.names();
        if (names.length < 2) { toast('请至少选择两个变量', 'err'); return false; }
        const manual = document.getElementById('manual').checked;
        run('factor', { variables: names, rotation: readRadio(body, 'rot'),
          factors: manual ? parseInt(val('nf'), 10) : null }, '因子分析');
      },
    });
  };

  A.reliability = (vars, run) => {
    open({
      title: '可靠性分析', width: 660,
      body: () => {
        const d = document.createElement('div');
        const p = varPair(vars.filter(v => v.type === 'numeric'), { targetLabel: '项目', keepSource: true, height: 230 });
        d.appendChild(p.wrap);
        d.insertAdjacentHTML('beforeend', '<div class="hint">Cronbach\'s Alpha 用于评价量表内部一致性，通常要求 ≥ 0.7。</div>');
        d._pair = p;
        return d;
      },
      onSubmit: () => {
        const body = document.querySelector('.modal-body');
        if (body._pair.names().length < 2) { toast('请至少选择两个项目', 'err'); return false; }
        run('reliability', { items: body._pair.names() }, '信度分析');
      },
    });
  };

  A.chart = (kind, title) => (vars, run) => {
    const needsTwo = kind === 'scatter' || kind === 'line';
    open({
      title, width: 620,
      body: () => {
        const d = document.createElement('div');
        if (needsTwo) {
          d.innerHTML = `<div class="form-grid">
            <label>X 轴变量</label><select id="xv">${vars.map(v => `<option value="${esc(v.name)}">${esc(v.name)}</option>`).join('')}</select>
            <label>Y 轴变量</label><select id="yv">${vars.map(v => `<option value="${esc(v.name)}">${esc(v.name)}</option>`).join('')}</select>
          </div>`;
        } else if (kind === 'box' || kind === 'errorbar') {
          d.innerHTML = `<div class="form-grid">
            <label>目标变量</label><select id="xv">${vars.filter(v => v.type === 'numeric').map(v => `<option value="${esc(v.name)}">${esc(v.name)}</option>`).join('')}</select>
            <label>分组变量（可选）</label><select id="gv"><option value="">（无）</option>${vars.map(v => `<option value="${esc(v.name)}">${esc(v.name)}</option>`).join('')}</select>
          </div>`;
        } else {
          d.innerHTML = `<div class="form-grid">
            <label>变量</label><select id="xv">${vars.map(v => `<option value="${esc(v.name)}">${esc(v.name)}${v.label ? ' · ' + esc(v.label) : ''}</option>`).join('')}</select>
          </div>`;
        }
        return d;
      },
      onSubmit: () => {
        const p = { kind };
        if (needsTwo) { p.x = val('xv'); p.y = val('yv'); p.fit = true; }
        else if (kind === 'box' || kind === 'errorbar') { p.variable = val('xv'); p.factor = val('gv') || null; }
        else { p.variable = val('xv'); }
        run('chart', p, title);
      },
    });
  };

  // ================================================================
  //  数据转换对话框
  // ================================================================

  const T = {};

  T.compute = (vars, run) => {
    const first = vars.length ? vars[0].name : '';
    open({
      title: '计算变量', width: 700,
      body: () => {
        const d = document.createElement('div');
        d.innerHTML =
          `<div class="dlg-row">
             <div class="dlg-col"><label class="dlg-label">目标变量</label>
               <input type="text" id="tgt" value="新变量" style="width:100%"></div>
             <div class="dlg-col"><label class="dlg-label">类型</label>
               ${selectEl('typ', [['numeric', '数值'], ['string', '字符串']], 'numeric')}</div>
             <div class="dlg-col"><label class="dlg-label">小数位</label>
               <input type="number" id="dec" value="2" min="0" max="8" style="width:70px"></div>
           </div>
           <label class="dlg-label">数字表达式（可使用 + - * / 与函数 mean()、sum()、sqrt()、ln()、abs()、if(cond,a,b) 等）</label>
           <textarea id="expr" style="width:100%;height:64px;font-family:Consolas,monospace">${esc(first)}</textarea>
           <div style="margin-top:8px">${checks('fn', [['mean', 'mean(v1,v2,...)'], ['sum', 'sum(...)'], ['sqrt', 'sqrt()'], ['ln', 'ln()'], ['abs', 'abs()']])}</div>
           <label class="dlg-label" style="margin-top:8px">条件表达式（可选，仅当满足条件时计算）</label>
           <input type="text" id="cond" placeholder="例如：gender = 1" style="width:100%">
           <label class="dlg-label" style="margin-top:8px">标签</label>
           <input type="text" id="lbl" style="width:100%">`;
        const fnBtns = d.querySelectorAll('input[data-group="fn"]');
        fnBtns.forEach(b => b.addEventListener('change', () => {
          if (!b.checked) return;
          const ta = document.getElementById('expr');
          const map = { mean: 'mean()', sum: 'sum()', sqrt: 'sqrt()', ln: 'ln()', abs: 'abs()' };
          ta.value += (ta.value && !/[\s(]$/.test(ta.value) ? ' + ' : '') + map[b.value];
          ta.focus();
          b.checked = false;
        }));
        return d;
      },
      onSubmit: () => {
        const tgt = (val('tgt') || '').trim();
        if (!tgt) { toast('请输入目标变量名', 'err'); return false; }
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tgt)) { toast('变量名只能包含字母、数字、下划线，且不能以数字开头', 'err'); return false; }
        const expr = document.getElementById('expr').value.trim();
        if (!expr) { toast('请输入表达式', 'err'); return false; }
        const cond = document.getElementById('cond').value.trim();
        run('transform', 'compute', { target: tgt, expression: expr, condition: cond || null,
          type: val('typ'), decimals: parseInt(val('dec'), 10) || 2, label: val('lbl') }, '计算变量');
      },
    });
  };

  T.recode = (vars, run) => {
    open({
      title: '重新编码为不同变量', width: 760,
      body: () => {
        const d = document.createElement('div');
        d.innerHTML =
          `<div class="dlg-row">
             <div class="dlg-col"><label class="dlg-label">输入变量</label>
               <select id="src">${vars.filter(v => v.type === 'numeric').map(v => `<option value="${esc(v.name)}">${esc(v.name)}</option>`).join('')}</select></div>
             <div class="dlg-col"><label class="dlg-label">输出变量</label>
               <input type="text" id="tgt" value="recode_new" style="width:100%"></div>
             <div class="dlg-col"><label class="dlg-label">输出标签</label>
               <input type="text" id="lbl" style="width:100%"></div>
           </div>
           <fieldset><legend>旧值 → 新值</legend>
             <table class="vl-table" id="rules">
               <thead><tr><th style="width:110px">类型</th><th>旧值 / 范围</th><th style="width:110px">新值</th><th style="width:40px"></th></tr></thead>
               <tbody></tbody>
             </table>
             <div style="margin-top:6px"><button class="btn" id="addRule">＋ 添加规则</button></div>
           </fieldset>
           <div class="dlg-row"><div class="dlg-col"><label class="dlg-label">其他值处理</label>
             ${selectEl('elseMode', [['copy', '复制原值'], ['sysmis', '设为系统缺失值'], ['value', '设为指定值']], 'copy')}</div>
             <div class="dlg-col"><label class="dlg-label">指定值</label><input type="number" id="elseVal" value="0" step="any" style="width:100px"></div>
           </div>`;
        const tbody = d.querySelector('#rules tbody');
        function addRow(type, from, to, value) {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td><select class="rtype">
              <option value="single">单值</option><option value="range">区间</option>
              <option value="rangeLo">≤ 值</option><option value="rangeHi">≥ 值</option></select></td>
            <td><input type="text" class="rfrom" placeholder="如 1 或 1,2,3" style="width:100%"></td>
            <td><input type="text" class="rval" style="width:100%"></td>
            <td><button class="btn danger" style="min-width:0;padding:2px 6px">×</button></td>`;
          tr.querySelector('.rtype').value = type || 'single';
          tr.querySelector('.rfrom').value = from || '';
          tr.querySelector('.rval').value = to || '';
          tr.querySelector('button').addEventListener('click', () => tr.remove());
          tbody.appendChild(tr);
        }
        d.querySelector('#addRule').addEventListener('click', () => addRow('single', '', ''));
        d._addRow = addRow;
        setTimeout(() => { addRow('single', '1', '1'); addRow('single', '2', '2'); }, 0);
        return d;
      },
      onSubmit: () => {
        const body = document.querySelector('.modal-body');
        const rules = [];
        body.querySelectorAll('#rules tbody tr').forEach(tr => {
          const type = tr.querySelector('.rtype').value;
          const fromRaw = tr.querySelector('.rfrom').value.trim();
          const v = tr.querySelector('.rval').value.trim();
          if (v === '') return;
          if (type === 'single') {
            const vals = fromRaw.split(/[,，\s]+/).filter(Boolean).map(Number).filter(n => !isNaN(n));
            if (vals.length) rules.push({ type, from: vals, value: parseFloat(v) });
          } else if (type === 'range') {
            const parts = fromRaw.split(/[-~到]+/).map(s => s.trim()).filter(Boolean);
            if (parts.length >= 2) rules.push({ type, from: parseFloat(parts[0]), to: parseFloat(parts[1]), value: parseFloat(v) });
          } else if (type === 'rangeLo') {
            rules.push({ type, to: parseFloat(fromRaw), value: parseFloat(v) });
          } else if (type === 'rangeHi') {
            rules.push({ type, from: parseFloat(fromRaw), value: parseFloat(v) });
          }
        });
        if (!rules.length) { toast('请至少添加一条重编码规则', 'err'); return false; }
        const src = val('src');
        const tgt = (val('tgt') || src).trim();
        run('transform', 'recode', { source: src, target: tgt, rules,
          elseMode: val('elseMode'), elseValue: parseFloat(val('elseVal')), label: val('lbl') }, '重新编码');
      },
    });
  };

  T.sort = (vars, run) => {
    open({
      title: '排序个案', width: 700,
      body: () => {
        const d = document.createElement('div');
        const p = varPair(vars, { targetLabel: '排序依据（按选择顺序）', keepSource: true, height: 220 });
        d.appendChild(p.wrap);
        d.insertAdjacentHTML('beforeend', `<div class="dlg-row"><div class="dlg-col">
          <label class="dlg-label">排序顺序</label>${selectEl('ord', [['asc', '升序 (A)'], ['desc', '降序 (D)']], 'asc')}</div></div>`);
        d._pair = p;
        return d;
      },
      onSubmit: () => {
        const body = document.querySelector('.modal-body');
        const names = body._pair.names();
        if (!names.length) { toast('请选择排序变量', 'err'); return false; }
        const order = val('ord');
        run('transform', 'sort', { variables: names.map(n => ({ name: n, order })) }, '排序个案');
      },
    });
  };

  T.select = (vars, run) => {
    open({
      title: '选择个案', width: 660,
      body: () => {
        const d = document.createElement('div');
        d.innerHTML =
          fieldset('选择', radio('mode', [['all', '所有个案'], ['condition', '基于条件'], ['random', '随机样本'], ['range', '基于个案范围']], 'condition')) +
          `<div id="condBox"><label class="dlg-label">条件表达式</label>
             <input type="text" id="cond" placeholder="例如：salary > 8000 AND gender = 1" style="width:100%"></div>
           <div id="randBox" style="display:none"><label class="dlg-label">随机抽样比例（0-1）</label>
             <input type="number" id="frac" value="0.5" min="0.01" max="1" step="0.05" style="width:110px"></div>
           <div id="rangeBox" style="display:none">
             <label class="dlg-label">个案范围（行号）</label>
             <input type="number" id="from" value="1" min="1" style="width:100px"> 至
             <input type="number" id="to" value="100" min="1" style="width:100px"></div>
           <div class="hint">将创建一个筛选变量，被选中的个案值为 1，其余为 0。之后所有分析都只使用被选中的个案。</div>`;
        setTimeout(() => {
          const upd = () => {
            const m = readRadio(d, 'mode');
            d.querySelector('#condBox').style.display = m === 'condition' ? '' : 'none';
            d.querySelector('#randBox').style.display = m === 'random' ? '' : 'none';
            d.querySelector('#rangeBox').style.display = m === 'range' ? '' : 'none';
          };
          d.querySelectorAll('input[name="mode"]').forEach(i => i.addEventListener('change', upd));
          upd();
        }, 0);
        return d;
      },
      onSubmit: () => {
        const body = document.querySelector('.modal-body');
        const mode = readRadio(body, 'mode');
        const params = { mode };
        if (mode === 'condition') params.condition = val('cond');
        if (mode === 'random') params.fraction = parseFloat(val('frac'));
        if (mode === 'range') { params.from = parseInt(val('from'), 10); params.to = parseInt(val('to'), 10); }
        run('transform', 'select', params, '选择个案');
      },
    });
  };

  T.split = (vars, run) => {
    open({
      title: '拆分文件', width: 620,
      body: () => {
        const d = document.createElement('div');
        d.innerHTML = radio('mode', [['off', '不拆分（关闭）'], ['on', '按变量拆分']], 'on') +
          `<div id="sbox"><label class="dlg-label">拆分变量</label>
            <select id="sv">${vars.map(v => `<option value="${esc(v.name)}">${esc(v.name)}</option>`).join('')}</select></div>`;
        setTimeout(() => {
          const upd = () => { d.querySelector('#sbox').style.display = readRadio(d, 'mode') === 'on' ? '' : 'none'; };
          d.querySelectorAll('input[name="mode"]').forEach(i => i.addEventListener('change', upd));
          upd();
        }, 0);
        return d;
      },
      onSubmit: () => {
        const body = document.querySelector('.modal-body');
        if (readRadio(body, 'mode') === 'off') run('transform', 'split', { off: true }, '拆分文件');
        else run('transform', 'split', { variables: [val('sv')] }, '拆分文件');
      },
    });
  };

  T.weight = (vars, run) => {
    open({
      title: '加权个案', width: 600,
      body: () => {
        const d = document.createElement('div');
        d.innerHTML = radio('mode', [['off', '不加权'], ['on', '按变量加权']], 'on') +
          `<div id="wbox"><label class="dlg-label">加权变量</label>
            <select id="wv">${vars.filter(v => v.type === 'numeric').map(v => `<option value="${esc(v.name)}">${esc(v.name)}</option>`).join('')}</select></div>`;
        setTimeout(() => {
          const upd = () => { d.querySelector('#wbox').style.display = readRadio(d, 'mode') === 'on' ? '' : 'none'; };
          d.querySelectorAll('input[name="mode"]').forEach(i => i.addEventListener('change', upd));
          upd();
        }, 0);
        return d;
      },
      onSubmit: () => {
        const body = document.querySelector('.modal-body');
        if (readRadio(body, 'mode') === 'off') run('transform', 'weight', { off: true }, '加权个案');
        else run('transform', 'weight', { variable: val('wv') }, '加权个案');
      },
    });
  };

  T.aggregate = (vars, run) => {
    open({
      title: '汇总数据', width: 760,
      body: () => {
        const d = document.createElement('div');
        d.innerHTML =
          `<div class="dlg-row">
             <div class="dlg-col"><label class="dlg-label">分组变量（拆分依据）</label>
               <select id="brk" multiple size="7" style="width:100%">${vars.map(v => `<option value="${esc(v.name)}">${esc(v.name)}${v.label ? ' · ' + esc(v.label) : ''}</option>`).join('')}</select></div>
             <div class="dlg-col"><label class="dlg-label">汇总变量</label>
               <select id="aggv" size="5" style="width:100%">${vars.filter(v => v.type === 'numeric').map(v => `<option value="${esc(v.name)}">${esc(v.name)}</option>`).join('')}</select>
               <label class="dlg-label" style="margin-top:4px">函数</label>
               <select id="aggf">${['mean', 'sum', 'min', 'max', 'sd', 'var', 'n', 'median'].map(f => `<option value="${f}">${f.toUpperCase()}</option>`).join('')}</select>
               <button class="btn" id="addAgg" style="margin-top:5px">＋ 添加</button></div>
             <div class="dlg-col"><label class="dlg-label">已添加的汇总</label>
               <div id="aggList" class="listbox" style="height:150px"></div>
               <button class="btn danger" id="clrAgg" style="margin-top:5px">清空</button></div>
           </div>
           <label class="dlg-label">新数据集名称</label>
           <input type="text" id="newName" value="汇总数据" style="width:220px">`;
        const list = [];
        const render = () => {
          const box = d.querySelector('#aggList');
          box.innerHTML = list.map((a, i) => `<div class="li">${esc(a.name)} = ${a.func}(${esc(a.var)}) <span style="color:#c0392b;cursor:pointer" data-i="${i}">×</span></div>`).join('') || '<div style="padding:6px;color:#9aa9bb">（空）</div>';
          box.querySelectorAll('span[data-i]').forEach(s => s.addEventListener('click', () => { list.splice(+s.dataset.i, 1); render(); }));
        };
        d.querySelector('#addAgg').addEventListener('click', () => {
          const v = d.querySelector('#aggv').value;
          const f = d.querySelector('#aggf').value;
          if (!v) return;
          list.push({ var: v, func: f, name: `${v}_${f}` });
          render();
        });
        d.querySelector('#clrAgg').addEventListener('click', () => { list.length = 0; render(); });
        d._list = list;
        setTimeout(render, 0);
        return d;
      },
      onSubmit: () => {
        const body = document.querySelector('.modal-body');
        if (!body._list.length) { toast('请至少添加一个汇总变量', 'err'); return false; }
        const brkSel = body.querySelector('#brk');
        const breaks = Array.from(brkSel.selectedOptions).map(o => o.value);
        run('transform', 'aggregate', { breakVars: breaks, aggregates: body._list.slice(),
          toNew: true, name: val('newName') }, '汇总数据');
      },
    });
  };

  T.transpose = (vars, run) => {
    open({
      title: '转置', width: 600,
      body: () => {
        const d = document.createElement('div');
        d.innerHTML = `<label class="dlg-label">名称变量（可选，其取值将作为转置后的列名）</label>
          <select id="nv"><option value="">（无）</option>${vars.map(v => `<option value="${esc(v.name)}">${esc(v.name)}</option>`).join('')}</select>
          <label class="dlg-label" style="margin-top:10px">新数据集名称</label>
          <input type="text" id="newName" value="转置数据" style="width:220px">`;
        return d;
      },
      onSubmit: () => {
        run('transform', 'transpose', { nameVar: val('nv') || null, name: val('newName') }, '转置');
      },
    });
  };

  // ================================================================
  //  变量属性 / 值标签 / 缺失值
  // ================================================================

  T.valueLabels = (varObj, onSave) => {
    open({
      title: `值标签：${varObj.name}`, width: 560,
      body: () => {
        const d = document.createElement('div');
        d.innerHTML = `<table class="vl-table" id="vlt">
          <thead><tr><th style="width:130px">值</th><th>标签</th><th style="width:40px"></th></tr></thead><tbody></tbody></table>
          <div style="margin-top:8px"><button class="btn" id="addVl">＋ 添加</button></div>`;
        const tb = d.querySelector('#vlt tbody');
        const add = (k, v) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td><input class="vk" value="${esc(k)}"></td><td><input class="vv" value="${esc(v)}"></td>
            <td><button class="btn danger" style="min-width:0;padding:2px 6px">×</button></td>`;
          tr.querySelector('button').addEventListener('click', () => tr.remove());
          tb.appendChild(tr);
        };
        Object.keys(varObj.values || {}).forEach(k => add(k, varObj.values[k]));
        d.querySelector('#addVl').addEventListener('click', () => add('', ''));
        d._add = add;
        return d;
      },
      onSubmit: () => {
        const body = document.querySelector('.modal-body');
        const values = {};
        body.querySelectorAll('#vlt tbody tr').forEach(tr => {
          const k = tr.querySelector('.vk').value.trim();
          const v = tr.querySelector('.vv').value.trim();
          if (k !== '') values[k] = v;
        });
        onSave(values);
      },
    });
  };

  T.missing = (varObj, onSave) => {
    open({
      title: `缺失值：${varObj.name}`, width: 560,
      body: () => {
        const m = varObj.missing || {};
        const hasDisc = (m.discrete || []).length > 0;
        const hasRange = !!m.range;
        const d = document.createElement('div');
        d.innerHTML = radio('mmode', [['none', '无缺失值'], ['discrete', '离散缺失值'], ['range', '范围']],
          hasRange ? 'range' : (hasDisc ? 'discrete' : 'none')) +
          `<div id="discBox"><label class="dlg-label">离散缺失值（逗号分隔）</label>
            <input type="text" id="disc" value="${esc((m.discrete || []).join(', '))}" style="width:100%"></div>
           <div id="rangeBox"><label class="dlg-label">范围</label>
            <input type="number" id="rlo" value="${m.range ? m.range[0] : ''}" step="any" style="width:110px"> 至
            <input type="number" id="rhi" value="${m.range ? m.range[1] : ''}" step="any" style="width:110px"></div>`;
        setTimeout(() => {
          const upd = () => {
            const mm = readRadio(d, 'mmode');
            d.querySelector('#discBox').style.display = mm === 'discrete' ? '' : 'none';
            d.querySelector('#rangeBox').style.display = mm === 'range' ? '' : 'none';
          };
          d.querySelectorAll('input[name="mmode"]').forEach(i => i.addEventListener('change', upd));
          upd();
        }, 0);
        return d;
      },
      onSubmit: () => {
        const body = document.querySelector('.modal-body');
        const mode = readRadio(body, 'mmode');
        if (mode === 'none') onSave({});
        else if (mode === 'discrete') onSave({ discrete: val('disc').split(/[,，\s]+/).filter(Boolean).map(Number).filter(n => !isNaN(n)) });
        else onSave({ range: [parseFloat(val('rlo')), parseFloat(val('rhi'))] });
      },
    });
  };

  // ---------------------------------------------------------------- 语法编辑器
  T.syntax = (ds, samples, onRun) => {
    const defaultCode = samples && samples.length ? samples[0].code : '';
    open({
      title: '语法编辑器', width: 820, maskClose: false,
      body: () => {
        const d = document.createElement('div');
        d.innerHTML = `<div class="syntax-samples" id="sampBox"></div>
          <textarea class="syntax-editor" id="syntaxText" spellcheck="false">${esc(defaultCode)}</textarea>
          <div class="hint">每条命令以英文句点「.」结尾。支持 FREQUENCIES / DESCRIPTIVES / CROSSTABS / T-TEST / ONEWAY / CORRELATIONS / REGRESSION / FACTOR / RELIABILITY / COMPUTE / RECODE / SORT CASES / SELECT IF / SPLIT FILE / WEIGHT BY / AGGREGATE / GRAPH 等命令。</div>`;
        const box = d.querySelector('#sampBox');
        (samples || []).forEach(s => {
          const b = document.createElement('button');
          b.className = 'btn samp';
          b.textContent = '示例：' + s.title;
          b.addEventListener('click', () => { d.querySelector('#syntaxText').value = s.code; });
          box.appendChild(b);
        });
        return d;
      },
      buttons: [
        { text: '运行', cls: 'primary', onClick: () => { onRun(document.getElementById('syntaxText').value); } },
        { text: '关闭', onClick: () => close() },
      ],
    });
  };

  function about() {
    open({
      title: '关于 SPSS Web', width: 520,
      body: `<div class="hint" style="font-size:12.8px;line-height:1.9">
        <b style="font-size:15px;color:#123b5c">SPSS Web 统计分析平台 v1.0</b><br>
        一个参考 IBM SPSS Statistics 交互方式构建的 Web 版统计分析工具，前后端分离：<br>
        · 后端：Python + FastAPI + pandas / numpy / scipy / statsmodels<br>
        · 前端：原生 JavaScript + 手写 SVG 图表（零外部依赖）<br><br>
        <b>已实现的主要过程</b><br>
        描述统计：频率、描述、探索、交叉表、均值<br>
        均值比较：单样本/独立样本/配对样本 T 检验、单因素 ANOVA、单变量 GLM<br>
        相关与回归：双变量相关（Pearson/Spearman/Kendall）、偏相关、线性回归、二元 Logistic 回归<br>
        非参数检验：卡方、二项、游程、Mann-Whitney U、Kruskal-Wallis H、Wilcoxon、Friedman<br>
        降维与信度：因子分析（主成分 + Varimax）、Cronbach's Alpha<br>
        数据管理：计算变量、重新编码、排序、筛选、拆分、加权、汇总、转置、导入导出<br>
        其他：SPSS 语法编辑器、输出查看器、值标签与缺失值定义
      </div>`,
      buttons: [{ text: '关闭', cls: 'primary', onClick: () => close() }],
    });
  }

  global.Dialogs = { open, close, toast, busy, varPair, varMultiPair, makeBox, fieldset, checks, readChecks, radio, readRadio, selectEl, val, A, T, about, esc, typeTxt };
})(window);
