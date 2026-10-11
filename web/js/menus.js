/* ============ 菜单栏渲染（SPSS 风格：带访问键、复选、二级菜单） ============ */
(function (global) {
  'use strict';

  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function closeAll() {
    document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('show'));
    document.querySelectorAll('.menu-item').forEach(d => d.classList.remove('open'));
  }

  /**
   * 把下拉面板对齐到它所属菜单项的正下方。
   * `.dropdown` 是绝对定位元素，若不显式给 left，其静态位置会回落到
   * 菜单栏（flex 容器）的起始边 —— 也就是全屏最左侧，这就是「下拉跑到最左边」的原因。
   */
  function place(item, dd) {
    const bar = item.parentElement;
    if (!bar) return;
    let left = item.offsetLeft;
    const w = dd.offsetWidth || 218;
    const maxLeft = bar.clientWidth - w - 2;
    if (left > maxLeft) left = Math.max(0, maxLeft);
    dd.style.left = left + 'px';
  }

  /** 二级菜单向右展开时若越出窗口右缘，则改为向左展开 */
  function placeSub(anchor, sub) {
    sub.style.left = '100%';
    sub.style.right = 'auto';
    const r = anchor.getBoundingClientRect();
    const w = sub.offsetWidth || 200;
    if (r.right + w > window.innerWidth - 4) {
      sub.style.left = 'auto';
      sub.style.right = '100%';
    }
  }

  /** 重排当前展开的下拉（窗口尺寸变化时用） */
  function reflow() {
    document.querySelectorAll('.menu-item.open').forEach(item => {
      const dd = item.parentElement.querySelector(`.dropdown[data-mi="${item.dataset.mi}"]`);
      if (dd && dd.classList.contains('show')) place(item, dd);
    });
  }

  /** 渲染一整条菜单栏 */
  function render(menubar, menus) {
    menubar.innerHTML = '';
    menus.forEach((menu, mi) => {
      const item = document.createElement('div');
      item.className = 'menu-item';
      item.dataset.mi = mi;
      const acc = menu.acc ? `<span class="acc">${esc(menu.acc)}</span>` : '';
      item.innerHTML = `${esc(menu.label)}(${acc})`;

      const dd = document.createElement('div');
      dd.className = 'dropdown';
      dd.dataset.mi = mi;
      buildItems(dd, menu.items || []);

      menubar.appendChild(item);
      menubar.appendChild(dd);

      const show = () => {
        closeAll();
        dd.classList.add('show');
        item.classList.add('open');
        place(item, dd);
      };

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const wasOpen = dd.classList.contains('show');
        closeAll();
        if (!wasOpen) show();
      });
      item.addEventListener('mouseenter', () => {
        if (menubar.querySelector('.dropdown.show')) show();
      });
    });

    if (!menubar._bound) {
      menubar._bound = true;
      document.addEventListener('click', closeAll);
      window.addEventListener('resize', reflow);
    }
  }

  function buildItems(container, items) {
    items.forEach(it => {
      if (it.sep) {
        const s = document.createElement('div');
        s.className = 'dd-sep';
        container.appendChild(s);
        return;
      }
      const el = document.createElement('div');
      const disabled = typeof it.enabled === 'function' ? !it.enabled() : !!it.disabled;
      el.className = 'dd-item' + (it.submenu ? ' dd-sub' : '') + (disabled ? ' disabled' : '');
      const checked = it.check && it.check() ? '✓' : '';
      el.innerHTML =
        (it.check ? `<span class="dd-check">${checked}</span>` : '') +
        `<span>${esc(it.label)}</span>` +
        (it.hint ? `<span class="dd-hint">${esc(it.hint)}</span>` : '');
      container.appendChild(el);

      if (it.submenu) {
        const sub = document.createElement('div');
        sub.className = 'dropdown sub';
        buildItems(sub, it.submenu);
        el.appendChild(sub);
        el.addEventListener('mouseenter', () => {
          if (disabled) return;
          sub.classList.add('show');
          placeSub(el, sub);
        });
        el.addEventListener('mouseleave', (e) => {
          if (!sub.contains(e.relatedTarget)) sub.classList.remove('show');
        });
        sub.addEventListener('mouseleave', (e) => {
          if (!el.contains(e.relatedTarget)) sub.classList.remove('show');
        });
      } else if (!disabled) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          closeAll();
          if (it.action) setTimeout(it.action, 0);
        });
      }
    });
  }

  global.Menus = { render, closeAll };
})(window);
