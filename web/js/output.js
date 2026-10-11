/* ============ 输出查看器渲染 ============ */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderTable(block) {
    const header = block.header || [];
    const rows = block.rows || [];
    const rh = block.rowHeader || 0;
    let h = '';
    if (block.title) h += `<div class="out-table-title">${esc(block.title)}</div>`;
    if (block.subtitle) h += `<div class="out-subtitle">${esc(block.subtitle)}</div>`;
    h += '<table class="pivot">';
    if (header.length) {
      h += '<thead>';
      header.forEach(hr => {
        h += '<tr>';
        (hr || []).forEach(cell => {
          if (cell && typeof cell === 'object') {
            const cs = cell.colspan ? ` colspan="${cell.colspan}"` : '';
            const rs = cell.rowspan ? ` rowspan="${cell.rowspan}"` : '';
            h += `<th${cs}${rs}>${esc(cell.text)}</th>`;
          } else {
            h += `<th>${esc(cell)}</th>`;
          }
        });
        h += '</tr>';
      });
      h += '</thead>';
    }
    h += '<tbody>';
    rows.forEach((r) => {
      h += '<tr>';
      (r || []).forEach((c, ci) => {
        const cls = ci < rh ? ' class="rowhead"' : '';
        h += `<td${cls}>${esc(c)}</td>`;
      });
      h += '</tr>';
    });
    h += '</tbody></table>';
    (block.notes || []).forEach(n => { h += `<div class="out-note">${esc(n)}</div>`; });
    return h;
  }

  function renderBlock(block, index) {
    const id = `blk-${index}`;
    switch (block.type) {
      case 'title':
        return block.level === 2
          ? `<div class="out-block" id="${id}" data-outline="${esc(block.text)}"><div class="out-title2">${esc(block.text)}</div></div>`
          : `<div class="out-block" id="${id}" data-outline="${esc(block.text)}"><div class="out-title1">${esc(block.text)}</div></div>`;
      case 'subtitle':
        return `<div class="out-block" id="${id}"><div class="out-subtitle">${esc(block.text)}</div></div>`;
      case 'text':
        return `<div class="out-block" id="${id}"><div class="out-text">${esc(block.text).replace(/\n/g, '<br>')}</div></div>`;
      case 'note':
        return `<div class="out-block" id="${id}"><div class="out-note">${esc(block.text)}</div></div>`;
      case 'table':
        return `<div class="out-block" id="${id}">${renderTable(block)}</div>`;
      case 'chart': {
        const svg = global.Charts.render(block.spec || {});
        const t = block.title || (block.spec && block.spec.title) || '';
        return `<div class="out-block" id="${id}" data-outline="${esc(t)}">
          <div class="out-chart"><div class="chart-box">
            ${t ? `<div class="chart-title">${esc(t)}</div>` : ''}${svg}
          </div></div></div>`;
      }
      default:
        return '';
    }
  }

  const Viewer = {
    blocks: [],     // 全部输出块（大纲树的数据源）
    parts: [],      // 渲染顺序：[{block,index} | {html}]

    /** 追加一批输出块。窗口未打开时只记数据，等窗口打开后由 renderAll 补渲染。 */
    append(newBlocks, meta) {
      const wrap = document.getElementById('outputWrap');
      if (this.blocks.length === 0) { this.parts = []; if (wrap) wrap.innerHTML = ''; }
      let html = '';
      if (meta && (meta.header || meta.dataset)) {
        const stamp = new Date().toLocaleString('zh-CN');
        const h = `<div class="out-block"><div class="out-note">执行时间：${esc(stamp)}` +
          (meta.dataset ? ` · 数据集：${esc(meta.dataset)}` : '') + '</div></div>';
        this.parts.push({ html: h });
        html += h;
      }
      (newBlocks || []).forEach(b => {
        this.blocks.push(b);
        const idx = this.blocks.length - 1;
        this.parts.push({ block: b, index: idx });
        html += renderBlock(b, idx);
      });
      if (wrap) {
        wrap.insertAdjacentHTML('beforeend', html);
        wrap.scrollTop = wrap.scrollHeight;
      }
      this.buildTree();
    },

    /** 窗口重建后把已有输出重绘一遍 */
    renderAll() {
      const wrap = document.getElementById('outputWrap');
      if (!wrap) return;
      if (!this.blocks.length) { this.clear(); return; }
      wrap.innerHTML = this.parts.map(p =>
        p.block ? renderBlock(p.block, p.index) : p.html).join('');
      this.buildTree();
      wrap.scrollTop = wrap.scrollHeight;
    },

    buildTree() {
      const tree = document.getElementById('outTree');
      if (!tree) return;
      let h = '';
      this.blocks.forEach((b, i) => {
        if (b.type === 'title') {
          h += `<div class="node ${b.level === 2 ? 'lvl2' : 'lvl1'}" data-goto="blk-${i}">` +
               `${b.level === 2 ? '· ' : '▸ '}${esc(b.text)}</div>`;
        } else if (b.type === 'table' && b.title) {
          h += `<div class="node lvl2" data-goto="blk-${i}">· ${esc(b.title)}</div>`;
        } else if (b.type === 'chart') {
          const t = b.title || (b.spec && b.spec.title) || '';
          if (t) h += `<div class="node lvl2" data-goto="blk-${i}">· ${esc(t)}</div>`;
        }
      });
      tree.innerHTML = h || '<div class="node lvl2">（空）</div>';
      tree.querySelectorAll('.node').forEach(n => {
        n.addEventListener('click', () => {
          const el = document.getElementById(n.dataset.goto);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          tree.querySelectorAll('.node').forEach(x => x.classList.remove('active'));
          n.classList.add('active');
        });
      });
    },

    clear() {
      this.blocks = [];
      this.parts = [];
      const wrap = document.getElementById('outputWrap');
      if (wrap) {
        wrap.innerHTML = `<div class="out-empty"><span class="big">📊</span>输出已清空。<br>` +
          `从「分析」菜单运行一个过程，结果会显示在这里。</div>`;
      }
      this.buildTree();
    },

    exportHtml() {
      const wrap = document.getElementById('outputWrap');
      const body = wrap ? wrap.innerHTML : '';
      const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>SPSS Web 输出</title><style>
body{font-family:"Segoe UI","Microsoft YaHei",sans-serif;font-size:13px;color:#1f2933;padding:24px;background:#fff}
.out-title1{font-size:15px;font-weight:700;color:#123b5c;border-bottom:2px solid #bcd4e9;padding-bottom:4px;margin:18px 0 10px}
.out-title2{font-size:13.5px;font-weight:700;color:#1f5c88;margin:14px 0 8px}
.out-subtitle{font-size:12px;color:#5b6b7c;margin:6px 0 4px}
.out-note{font-size:11.5px;color:#5b6b7c;margin:2px 0 8px}
.out-table-title{font-size:12.5px;font-weight:700;margin:10px 0 4px}
table.pivot{border-collapse:collapse;margin-bottom:4px;font-size:12.5px}
table.pivot th,table.pivot td{border:1px solid #b8c6d6;padding:3px 9px;text-align:right;white-space:pre-line}
table.pivot thead th{background:#e7eef7;color:#1f3f5c;font-weight:600;text-align:center}
table.pivot td.rowhead{background:#f4f7fb;text-align:left;font-weight:600;color:#26445f}
.chart-box{border:1px solid #c3d2e0;padding:8px;display:inline-block;margin:8px 0}
.chart-title{font-size:12.5px;font-weight:600;color:#26445f;margin-bottom:6px}
</style></head><body>${body}</body></html>`;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `SPSS输出_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    },
  };

  global.Viewer = Viewer;
})(window);
