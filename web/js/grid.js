/* ============ 数据编辑器网格（SPSS 数据视图 / 变量视图） ============ */
(function (global) {
  'use strict';

  const MAX_RENDER_ROWS = 2000;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtCell(v, dec) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number') {
      if (Number.isInteger(v)) return String(v);
      const d = (dec === undefined || dec === null) ? 2 : dec;
      return v.toFixed(d);
    }
    return String(v);
  }

  /** SPSS 列头文案：优先标签，无标签的默认变量显示为「变量」 */
  function headerText(v, mode) {
    if (mode === 'name') return v.name;
    if (v.label) return v.label;
    if (/^VAR\d+$/i.test(v.name)) return '变量';
    return v.name;
  }

  function colWidth(v) {
    const n = Number(v.columns) || 8;
    return Math.max(46, Math.min(360, n * 7 + 10));
  }

  /** 单元格显示文本：按当前模式决定显示值标签还是原始值 */
  function cellText(v, raw, mode) {
    if (mode === 'label' && v && v.values) {
      const lb = labelOf(v.values, raw);
      if (lb != null) return lb;
    }
    return fmtCell(raw, v && v.decimals);
  }

  function startEdit(td, current, commit, onMove) {
    if (td.querySelector('input')) return;
    const old = td.innerHTML;
    td.classList.add('editing');
    const inp = document.createElement('input');
    inp.value = current === null || current === undefined ? '' : String(current);
    td.innerHTML = '';
    td.appendChild(inp);
    inp.focus();
    inp.select();
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const v = inp.value;
      td.classList.remove('editing');
      td.innerHTML = old;
      if (save) commit(v);
    };
    inp.addEventListener('blur', () => finish(true));
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); if (onMove) onMove(1, 0); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      else if (e.key === 'Tab') { e.preventDefault(); finish(true); if (onMove) onMove(0, e.shiftKey ? -1 : 1); }
    });
  }

  /** 值标签查找（容忍 1 / '1' / 1.0 等键类型差异） */
  function labelOf(values, v) {
    if (!values) return null;
    if (Object.prototype.hasOwnProperty.call(values, String(v))) return values[String(v)];
    const n = Number(v);
    if (!isNaN(n)) {
      const keys = Object.keys(values);
      for (let i = 0; i < keys.length; i++) {
        const kn = Number(keys[i]);
        if (!isNaN(kn) && kn === n) return values[keys[i]];
      }
    }
    return null;
  }

  /** SPSS 空白数据编辑器：行号 + 占位「变量」列 */
  function emptyEditorHtml(host) {
    const avail = host ? host.clientWidth : 1200;
    const CW = 57;
    const cols = Math.max(8, Math.ceil((avail - 46) / CW));
    const rows = 40;
    let html = '<table class="grid"><thead><tr><th class="rowhead"></th>';
    for (let j = 0; j < cols; j++) {
      html += `<th style="width:${CW}px;min-width:${CW}px"><span class="vname">变量</span></th>`;
    }
    html += '</tr></thead><tbody>';
    for (let i = 0; i < rows; i++) {
      html += `<tr><td class="rowhead">${i + 1}</td>`;
      for (let j = 0; j < cols; j++) html += `<td class="cell ph"></td>`;
      html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
  }

  // ---------------------------------------------------------------- 数据视图
  function renderDataView(wrap, ds, h) {
    const rows = ds.rows || [];
    const vars = ds.variables || [];
    const shown = Math.min(rows.length, MAX_RENDER_ROWS);
    const selected = h.getSelection ? h.getSelection() : new Set();
    const mode = h.headerMode || 'label';

    if (!vars.length) {
      wrap.innerHTML = emptyEditorHtml(wrap.parentElement);
      return;
    }

    let html = '<table class="grid"><thead><tr><th class="rowhead"></th>';
    vars.forEach((v, j) => {
      const txt = headerText(v, mode);
      const title = `${v.name}${v.label ? ' · ' + v.label : ''}${v.type === 'numeric' ? ' · 数值' : ' · 字符串'}`;
      html += `<th data-col="${j}" title="${esc(title)}" style="width:${colWidth(v)}px;min-width:${colWidth(v)}px">` +
              `<span class="vname">${esc(txt)}</span></th>`;
    });
    html += '</tr></thead><tbody>';

    for (let i = 0; i < shown; i++) {
      const r = rows[i] || [];
      html += `<tr data-row="${i}" class="${selected.has(i) ? 'selected' : ''}">` +
              `<td class="rowhead" data-row="${i}">${i + 1}</td>`;
      for (let j = 0; j < vars.length; j++) {
        const v = vars[j];
        const isNum = v.type === 'numeric' || v.type === 'date';
        let txt;
        if (mode === 'label' && v.values) {
          const lb = labelOf(v.values, r[j]);
          txt = lb != null ? lb : fmtCell(r[j], v.decimals);
        } else {
          txt = fmtCell(r[j], v.decimals);
        }
        html += `<td class="cell ${isNum ? 'num' : 'txt'}" data-row="${i}" data-col="${j}" ` +
                `style="width:${colWidth(v)}px;min-width:${colWidth(v)}px">${esc(txt)}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    if (rows.length > shown) {
      html += `<div class="grid-empty">仅显示前 ${shown} 行，共 ${rows.length} 行。</div>`;
    }
    wrap.innerHTML = html;

    const cellAt = (i, j) => wrap.querySelector(`td.cell[data-row="${i}"][data-col="${j}"]`);

    function move(r, c, dr, dc) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= shown || nc >= vars.length) return;
      const td = cellAt(nr, nc);
      if (td) td.click();
    }

    wrap.querySelectorAll('td.cell').forEach(td => {
      td.addEventListener('click', () => {
        const i = +td.dataset.row, j = +td.dataset.col;
        if (h.onCellFocus) h.onCellFocus(i, j);
        startEdit(td, (rows[i] || [])[j], (val) => h.onCellEdit(i, j, val, td), (dr, dc) => move(i, j, dr, dc));
      });
    });
    wrap.querySelectorAll('td.rowhead').forEach(td => {
      td.addEventListener('click', () => h.onRowToggle(+td.dataset.row));
    });
  }

  // ---------------------------------------------------------------- 变量视图
  const MEASURE_TXT = { scale: '度量(S)', ordinal: '有序(O)', nominal: '名义(N)' };
  const TYPE_TXT = { numeric: '数值(N)', string: '字符串(S)', date: '日期(D)' };
  const ALIGN_TXT = { right: '右', left: '左', center: '居中' };
  const ROLE_TXT = { input: '输入', target: '目标', both: '两者', none: '无', partition: '分区', split: '拆分' };

  const COLS = [
    ['name', '名称', 110], ['type', '类型', 92], ['width', '宽度', 58], ['decimals', '小数', 58],
    ['label', '标签', 168], ['values', '值', 88], ['missing', '缺失', 74], ['columns', '列', 58],
    ['align', '对齐', 74], ['measure', '测量', 92], ['role', '角色', 82],
  ];

  function renderVariableView(wrap, ds, h) {
    const vars = ds.variables || [];
    let html = '<table class="vgrid"><thead><tr><th class="rowhead"></th>';
    COLS.forEach(([, label, w]) => {
      html += `<th style="width:${w}px;min-width:${w}px">${label}</th>`;
    });
    html += '</tr></thead><tbody>';
    vars.forEach((v, i) => {
      const nVal = (v.values && Object.keys(v.values).length) ? '{' + Object.keys(v.values).length + '}' : '无';
      const mVal = (v.missing && Object.keys(v.missing).length) ? '{1}' : '无';
      html += `<tr data-var="${esc(v.name)}">
        <td class="rowhead">${i + 1}</td>
        <td class="editable" data-field="name">${esc(v.name)}</td>
        <td class="editable" data-field="type">${TYPE_TXT[v.type] || v.type}</td>
        <td class="editable" data-field="width">${v.width}</td>
        <td class="editable" data-field="decimals">${v.decimals}</td>
        <td class="editable" data-field="label">${esc(v.label || '')}</td>
        <td class="editable" data-field="values" style="color:#1f6fb2">${esc(nVal)}</td>
        <td class="editable" data-field="missing" style="color:#1f6fb2">${esc(mVal)}</td>
        <td class="editable" data-field="columns">${v.columns}</td>
        <td class="editable" data-field="align">${ALIGN_TXT[v.align] || v.align}</td>
        <td class="editable" data-field="measure"><span class="measure-tag m-${v.measure}">${MEASURE_TXT[v.measure] || v.measure}</span></td>
        <td class="editable" data-field="role">${ROLE_TXT[v.role] || v.role || '输入'}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    if (!vars.length) {
      html += '<div class="grid-empty">数据集中还没有变量。点击工具栏的「插入变量」按钮添加。</div>';
    }
    wrap.innerHTML = html;

    const OPTIONS = {
      type: [['numeric', '数值(N)'], ['string', '字符串(S)'], ['date', '日期(D)']],
      align: [['right', '右'], ['left', '左'], ['center', '居中']],
      measure: [['scale', '度量(S)'], ['ordinal', '有序(O)'], ['nominal', '名义(N)']],
      role: [['input', '输入'], ['target', '目标'], ['both', '两者'], ['none', '无'], ['partition', '分区'], ['split', '拆分']],
    };

    wrap.querySelectorAll('td.editable').forEach(td => {
      const varName = td.closest('tr').dataset.var;
      const field = td.dataset.field;
      td.addEventListener('click', () => {
        if (field === 'values') { h.onEditValueLabels(varName); return; }
        if (field === 'missing') { h.onEditMissing(varName); return; }
        const v = vars.find(x => x.name === varName);
        if (!v) return;
        if (OPTIONS[field]) {
          startSelect(td, v[field], OPTIONS[field], (val) => h.onVarEdit(varName, field, val));
        } else {
          startEdit(td, v[field], (val) => {
            if (field === 'width' || field === 'decimals' || field === 'columns') {
              const n = parseInt(val, 10);
              h.onVarEdit(varName, field, isNaN(n) ? v[field] : n);
            } else h.onVarEdit(varName, field, val);
          });
        }
      });
    });
  }

  function startSelect(td, current, options, commit) {
    if (td.querySelector('select')) return;
    const old = td.innerHTML;
    td.classList.add('editing');
    const sel = document.createElement('select');
    options.forEach(([val, txt]) => {
      const o = document.createElement('option');
      o.value = val; o.textContent = txt;
      if (val === current) o.selected = true;
      sel.appendChild(o);
    });
    td.innerHTML = '';
    td.appendChild(sel);
    sel.focus();
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const val = sel.value;
      td.classList.remove('editing');
      td.innerHTML = old;
      if (save) commit(val);
    };
    sel.addEventListener('blur', () => finish(true));
    sel.addEventListener('change', () => finish(true));
    sel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); finish(false); } });
  }

  global.Grid = { renderDataView, renderVariableView, fmtCell, headerText, labelOf, cellText, esc };
})(window);
