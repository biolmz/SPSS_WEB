/* ============ 窗口管理器（数据编辑器 / 输出查看器 / 语法编辑器） ============ */
(function (global) {
  'use strict';

  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const REGISTRY = {};
  const WINDOWS = {};
  let activeType = null;
  const focusHandlers = [];

  /** 注册一种窗口类型 */
  function register(type, def) {
    REGISTRY[type] = def;
  }

  function get(type) { return WINDOWS[type]; }
  function isOpen(type) { return !!WINDOWS[type]; }
  function list() { return Object.keys(WINDOWS); }
  function active() { return activeType ? WINDOWS[activeType] : null; }

  /** 打开（或聚焦）一个窗口 */
  function open(type, opts) {
    if (WINDOWS[type]) {
      focus(type);
      if (opts && opts.rebuild) rebuild(type);
      return WINDOWS[type];
    }
    const def = REGISTRY[type];
    if (!def) throw new Error('未注册的窗口类型：' + type);

    const host = document.getElementById('windows');
    const el = document.createElement('div');
    el.className = 'wb-window';
    el.dataset.type = type;

    // ---- 菜单栏
    const menubar = document.createElement('div');
    menubar.className = 'menubar';
    menubar.dataset.role = 'menubar';
    el.appendChild(menubar);

    // ---- 工具栏
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    toolbar.dataset.role = 'toolbar';
    el.appendChild(toolbar);

    // ---- 内容区
    const content = document.createElement('div');
    content.dataset.role = 'content';
    content.style.cssText = 'flex:1 1 auto;display:flex;flex-direction:column;min-height:0;';
    el.appendChild(content);

    // ---- 状态栏
    const status = document.createElement('div');
    status.className = 'statusbar';
    status.dataset.role = 'statusbar';
    el.appendChild(status);

    host.appendChild(el);

    const win = { type, el, menubar, toolbar, content, status, def };
    WINDOWS[type] = win;

    Menus.render(menubar, def.menus || []);
    renderToolbar(win);
    if (def.content) def.content(content, win);
    refreshStatus(type);

    focus(type);
    return win;
  }

  function close(type) {
    const win = WINDOWS[type];
    if (!win) return;
    win.el.remove();
    delete WINDOWS[type];
    if (activeType === type) {
      activeType = null;
      const rest = list();
      if (rest.length) focus(rest[0]);
      else if (REGISTRY.data) open('data');
    }
  }

  function focus(type) {
    const win = WINDOWS[type];
    if (!win) return;
    Object.keys(WINDOWS).forEach(t => WINDOWS[t].el.classList.toggle('active', t === type));
    activeType = type;
    document.title = win.def.title ? win.def.title() : type;
    focusHandlers.forEach(fn => { try { fn(type); } catch (e) { /* ignore */ } });
  }

  function rebuild(type) {
    const win = WINDOWS[type];
    if (!win) return;
    win.content.innerHTML = '';
    if (win.def.content) win.def.content(win.content, win);
    refreshStatus(type);
  }

  function renderToolbar(win) {
    const tb = win.toolbar;
    tb.innerHTML = '';
    (win.def.toolbar || []).forEach(b => {
      if (b.sep) {
        const s = document.createElement('span');
        s.className = 'tsep';
        tb.appendChild(s);
        return;
      }
      const btn = document.createElement('button');
      btn.className = 'tbtn' + (b.wide ? ' wide' : '') + (b.disabled ? ' disabled' : '');
      btn.title = b.title || '';
      btn.innerHTML = Icons.get(b.icon, b.wide ? 22 : 20);
      if (!b.disabled && b.action) btn.addEventListener('click', b.action);
      if (b.id) btn.id = b.id;
      tb.appendChild(btn);
    });
  }

  function refreshStatus(type) {
    const win = WINDOWS[type];
    if (!win || !win.def.statusBar) return;
    const segs = win.def.statusBar() || [];
    win.status.innerHTML = segs.map(s => {
      if (s.right) {
        return `<span class="sb-right">${s.html || esc(s.text || '')}</span>`;
      }
      return `<span class="sb-seg${s.flat ? ' flat' : ''}">${s.html || esc(s.text || '')}</span>`;
    }).join('');
  }

  function refreshAllStatus() {
    Object.keys(WINDOWS).forEach(refreshStatus);
  }

  /** SPSS 状态栏右侧固定文案 */
  function readySegments(extra) {
    const segs = (extra || []).slice();
    segs.push({ right: true, html:
      `${esc('IBM SPSS Statistics 处理器就绪')} <span class="sb-ok">✔</span>` +
      `&nbsp;&nbsp;&nbsp;${esc('Unicode: 开')}` });
    return segs;
  }

  global.Windows = {
    register, open, close, focus, rebuild, get, isOpen, list, active,
    refreshStatus, refreshAllStatus, readySegments,
    onFocus: (fn) => focusHandlers.push(fn),
    get activeType() { return activeType; },
  };
})(window);
