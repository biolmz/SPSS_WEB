/* ============ SPSS 风格 SVG 图标库 ============ */
(function (global) {
  'use strict';

  const S = (inner, vb) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb || '0 0 24 24'}" width="20" height="20" ` +
    `shape-rendering="geometricPrecision" style="display:block">${inner}</svg>`;

  const ICONS = {
    /* ---------- 文件 ---------- */
    open: S(`
      <path d="M2.5 6.5h6.2l1.8 2.2h11v10.3a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5z" fill="#e8a33d" stroke="#b07420" stroke-width="1"/>
      <path d="M2.5 9.4h19v9.6a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5z" fill="#f6c667" stroke="#b07420" stroke-width="1"/>
      <path d="M12 4.2v7.4M9.3 8.9l2.7 2.7 2.7-2.7" fill="none" stroke="#8a5a12" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`),

    save: S(`
      <path d="M4 4h13.2L20 6.8V20H4z" fill="#5b7fa6" stroke="#33506f" stroke-width="1"/>
      <rect x="7" y="4" width="9" height="6.5" fill="#e8eef5" stroke="#33506f" stroke-width="1"/>
      <rect x="7.8" y="5" width="7.4" height="2" fill="#8fa8c4"/>
      <rect x="6.5" y="13" width="11" height="7" fill="#f2f6fa" stroke="#33506f" stroke-width="1"/>
      <rect x="8" y="14.6" width="8" height="1.3" fill="#9fb3c8"/>
      <rect x="8" y="16.8" width="8" height="1.3" fill="#9fb3c8"/>`),

    saveAs: S(`
      <path d="M3 5h11.4L17 7.6V15H3z" fill="#8fa8c4" stroke="#5b7fa6" stroke-width="1"/>
      <rect x="5.5" y="5" width="7.5" height="5" fill="#e8eef5" stroke="#5b7fa6" stroke-width="1"/>
      <path d="M13 19.5 19.5 13l2 2L15 21.5h-2z" fill="#e8a33d" stroke="#b07420" stroke-width="1"/>
      <path d="M18.6 12.6l1.9 1.9" stroke="#b07420" stroke-width="1"/>`),

    print: S(`
      <rect x="4" y="9" width="16" height="8" rx="1" fill="#9aa5b1" stroke="#5c6873" stroke-width="1"/>
      <rect x="7" y="3.5" width="10" height="6" fill="#f4f6f8" stroke="#5c6873" stroke-width="1"/>
      <rect x="7" y="14" width="10" height="6.5" fill="#fbfcfd" stroke="#5c6873" stroke-width="1"/>
      <rect x="8.6" y="15.4" width="6.8" height="1.1" fill="#a8b3bf"/>
      <rect x="8.6" y="17.3" width="6.8" height="1.1" fill="#a8b3bf"/>
      <circle cx="17.6" cy="11.2" r="1" fill="#3fae6a"/>`),

    /* ---------- 编辑 ---------- */
    undo: S(`
      <path d="M8 7.5H14.5a5 5 0 0 1 0 10H9" fill="none" stroke="#5c6873" stroke-width="2" stroke-linecap="round"/>
      <path d="M11 4.5 7.4 7.5 11 10.6z" fill="#5c6873"/>`, '0 0 24 24'),

    redo: S(`
      <path d="M16 7.5H9.5a5 5 0 0 0 0 10H15" fill="none" stroke="#5c6873" stroke-width="2" stroke-linecap="round"/>
      <path d="M13 4.5 16.6 7.5 13 10.6z" fill="#5c6873"/>`),

    find: S(`
      <circle cx="9.5" cy="9.5" r="5.6" fill="#cfe0ef" stroke="#4a5a6a" stroke-width="1.5"/>
      <circle cx="9.5" cy="9.5" r="3" fill="#eaf3fb" stroke="#7f93a6" stroke-width="1"/>
      <path d="M13.8 13.8 19.5 19.5" stroke="#4a5a6a" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="17.6" cy="6" r="3.2" fill="#cfe0ef" stroke="#4a5a6a" stroke-width="1.3"/>
      <path d="M17.6 4.4v3.2M16 6h3.2" stroke="#4a5a6a" stroke-width="1"/>`),

    /* ---------- 变量 / 值标签 ---------- */
    variables: S(`
      <rect x="3" y="4.5" width="18" height="15" rx="1" fill="#ffffff" stroke="#5c6873" stroke-width="1"/>
      <path d="M3 9h18M3 13.5h18M9 4.5v15M15 4.5v15" stroke="#8d9aa7" stroke-width="1"/>
      <rect x="3" y="4.5" width="18" height="4.5" fill="#d7e2ee" stroke="#5c6873" stroke-width="1"/>`),

    labelsNum: S(`
      <rect x="3" y="3.5" width="18" height="17" rx="1.5" fill="#fff" stroke="#b9c3cc" stroke-width="1"/>
      <text x="12" y="17" font-family="Segoe UI, Arial" font-size="13" font-weight="700" fill="#c0392b" text-anchor="middle">1</text>`),

    labelsText: S(`
      <rect x="3" y="3.5" width="18" height="17" rx="1.5" fill="#fff" stroke="#b9c3cc" stroke-width="1"/>
      <text x="12" y="17" font-family="Segoe UI, Arial" font-size="13" font-weight="700" fill="#1f6fb2" text-anchor="middle">A</text>`),

    labelsBoth: S(`
      <rect x="3" y="3.5" width="18" height="17" rx="1.5" fill="#fff" stroke="#b9c3cc" stroke-width="1"/>
      <text x="8" y="12" font-family="Segoe UI, Arial" font-size="10" font-weight="700" fill="#1e8449" text-anchor="middle">A</text>
      <text x="16" y="18" font-family="Segoe UI, Arial" font-size="9" font-weight="700" fill="#c0392b" text-anchor="middle">1</text>`),

    /* ---------- 数据编辑 ---------- */
    insertCase: S(`
      <rect x="3" y="6" width="11" height="12" rx="1" fill="#e8eef5" stroke="#7f93a6" stroke-width="1"/>
      <path d="M3 11.5h11M3 15h11" stroke="#a9b8c7" stroke-width="1"/>
      <circle cx="18" cy="15.5" r="5.6" fill="#3fae6a" stroke="#27703a" stroke-width="1"/>
      <path d="M18 12.6v5.8M15.1 15.5h5.8" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>`),

    insertVar: S(`
      <rect x="6" y="3" width="12" height="11" rx="1" fill="#e8eef5" stroke="#7f93a6" stroke-width="1"/>
      <path d="M10.5 3v11M14.5 3v11" stroke="#a9b8c7" stroke-width="1"/>
      <circle cx="15.5" cy="18" r="5.6" fill="#2e8fd0" stroke="#17598f" stroke-width="1"/>
      <path d="M15.5 15.1v5.8M12.6 18h5.8" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>`),

    delCase: S(`
      <rect x="3" y="6" width="11" height="12" rx="1" fill="#e8eef5" stroke="#7f93a6" stroke-width="1"/>
      <path d="M3 11.5h11M3 15h11" stroke="#a9b8c7" stroke-width="1"/>
      <circle cx="18" cy="15.5" r="5.6" fill="#c0504d" stroke="#8e3532" stroke-width="1"/>
      <path d="M15.1 15.5h5.8" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>`),

    delVar: S(`
      <rect x="6" y="3" width="12" height="11" rx="1" fill="#e8eef5" stroke="#7f93a6" stroke-width="1"/>
      <path d="M10.5 3v11M14.5 3v11" stroke="#a9b8c7" stroke-width="1"/>
      <circle cx="15.5" cy="18" r="5.6" fill="#c0504d" stroke="#8e3532" stroke-width="1"/>
      <path d="M12.6 18h5.8" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>`),

    gotoCase: S(`
      <rect x="3" y="4" width="13" height="16" rx="1" fill="#eef3f8" stroke="#7f93a6" stroke-width="1"/>
      <path d="M3 9h13M3 14h13M3 19h13" stroke="#a9b8c7" stroke-width="1"/>
      <path d="M12 12h8.5M17 8.6l3.4 3.4-3.4 3.4" fill="none" stroke="#2e8fd0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`),

    weight: S(`
      <path d="M12 4v15" stroke="#5c6873" stroke-width="1.6"/>
      <path d="M5 8h14" stroke="#5c6873" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M5 8 2.2 14.2h5.6z" fill="#cfe0ef" stroke="#4a5a6a" stroke-width="1.1"/>
      <path d="M19 8l-2.8 6.2h5.6z" fill="#cfe0ef" stroke="#4a5a6a" stroke-width="1.1"/>
      <path d="M7 20h10" stroke="#5c6873" stroke-width="2" stroke-linecap="round"/>`),

    selectCases: S(`
      <path d="M3 5h18l-7 8v6.5l-4 2V13z" fill="#e8a33d" stroke="#b07420" stroke-width="1" stroke-linejoin="round"/>
      <path d="M3 5h18" stroke="#b07420" stroke-width="1.4"/>`),

    splitFile: S(`
      <rect x="3" y="4" width="8" height="16" rx="1" fill="#dbe7f2" stroke="#5b7fa6" stroke-width="1"/>
      <rect x="13" y="4" width="8" height="16" rx="1" fill="#f6e2c3" stroke="#b07420" stroke-width="1"/>
      <path d="M11.4 12h1.2" stroke="#5c6873" stroke-width="1.4"/>`),

    /* ---------- 分析 ---------- */
    freq: S(`
      <rect x="3" y="4" width="18" height="16" rx="1" fill="#fbfcfd" stroke="#7f93a6" stroke-width="1"/>
      <rect x="5.5" y="12" width="3.2" height="5.5" fill="#6aa9d8" stroke="#2e8fd0" stroke-width=".8"/>
      <rect x="10.4" y="8" width="3.2" height="9.5" fill="#6aa9d8" stroke="#2e8fd0" stroke-width=".8"/>
      <rect x="15.3" y="14" width="3.2" height="3.5" fill="#6aa9d8" stroke="#2e8fd0" stroke-width=".8"/>`),

    descriptives: S(`
      <rect x="3" y="4" width="18" height="16" rx="1" fill="#fbfcfd" stroke="#7f93a6" stroke-width="1"/>
      <path d="M3 9h18M3 14h18" stroke="#c3cfdb" stroke-width="1"/>
      <path d="M6 7h3M6 11.5h7M6 16.5h4" stroke="#4a5a6a" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M14 11.5h5M15.5 16.5h3.5" stroke="#1e8449" stroke-width="1.4" stroke-linecap="round"/>`),

    crosstabs: S(`
      <rect x="3" y="4" width="18" height="16" rx="1" fill="#fbfcfd" stroke="#7f93a6" stroke-width="1"/>
      <path d="M3 9.5h18M9.7 4v16M15.3 9.5v10.5M3 15h18" stroke="#8d9aa7" stroke-width="1"/>
      <rect x="3" y="4" width="18" height="5.5" fill="#d7e2ee" stroke="#7f93a6" stroke-width="1"/>
      <rect x="3" y="4" width="6.7" height="16" fill="#e8eff7" stroke="#7f93a6" stroke-width="1"/>`),

    means: S(`
      <path d="M4 18V6" stroke="#7f93a6" stroke-width="1.4"/>
      <path d="M4 18h16" stroke="#7f93a6" stroke-width="1.4"/>
      <path d="M7 14h3v4H7zM12 9h3v9h-3zM17 12h3v6h-3z" fill="#6aa9d8" stroke="#2e8fd0" stroke-width=".8"/>
      <path d="M5.5 8.5 12 5l6.5 3.5" fill="none" stroke="#c0504d" stroke-width="1.5" stroke-linecap="round"/>`),

    compare: S(`
      <path d="M4 18V6M4 18h16" stroke="#7f93a6" stroke-width="1.4"/>
      <circle cx="9" cy="11" r="2.6" fill="#6aa9d8" stroke="#2e8fd0"/>
      <circle cx="16" cy="13.5" r="2.6" fill="#f0a86a" stroke="#c9762e"/>
      <path d="M9 8.4V6.6M16 16.1v1.8" stroke="#7f93a6" stroke-width="1.2"/>`),

    correlation: S(`
      <path d="M4 18V6M4 18h16" stroke="#7f93a6" stroke-width="1.4"/>
      <circle cx="8" cy="15" r="1.5" fill="#2e8fd0"/><circle cx="11" cy="12.5" r="1.5" fill="#2e8fd0"/>
      <circle cx="14" cy="11" r="1.5" fill="#2e8fd0"/><circle cx="17" cy="8" r="1.5" fill="#2e8fd0"/>
      <path d="M6.5 16.4 18.5 7" stroke="#c0504d" stroke-width="1.4" stroke-dasharray="3 2"/>`),

    regression: S(`
      <path d="M4 18V6M4 18h16" stroke="#7f93a6" stroke-width="1.4"/>
      <path d="M6 16.5 10 13 13.5 14 19 7" fill="none" stroke="#2e8fd0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="10" cy="13" r="1.3" fill="#c0504d"/><circle cx="13.5" cy="14" r="1.3" fill="#c0504d"/>
      <circle cx="19" cy="7" r="1.3" fill="#c0504d"/>`),

    factor: S(`
      <circle cx="12" cy="12" r="3" fill="#f0a86a" stroke="#c9762e" stroke-width="1"/>
      <circle cx="5.5" cy="6" r="2.2" fill="#6aa9d8" stroke="#2e8fd0"/><circle cx="18.5" cy="6" r="2.2" fill="#6aa9d8" stroke="#2e8fd0"/>
      <circle cx="5.5" cy="18" r="2.2" fill="#6aa9d8" stroke="#2e8fd0"/><circle cx="18.5" cy="18" r="2.2" fill="#6aa9d8" stroke="#2e8fd0"/>
      <path d="M7.2 7.2 9.9 10M16.8 7.2 14.1 10M7.2 16.8 9.9 14M16.8 16.8 14.1 14" stroke="#8d9aa7" stroke-width="1.2"/>`),

    reliability: S(`
      <circle cx="12" cy="12" r="8.2" fill="none" stroke="#8d9aa7" stroke-width="2"/>
      <path d="M12 3.8A8.2 8.2 0 0 1 20.2 12" fill="none" stroke="#3fae6a" stroke-width="3"/>
      <path d="M12 12V6" stroke="#4a5a6a" stroke-width="1.6" stroke-linecap="round"/>`),

    nonparam: S(`
      <path d="M4 19h16" stroke="#7f93a6" stroke-width="1.4"/>
      <path d="M5 19V9.5h2.6V19zM9.4 19V5h2.6v14zM13.8 19v-8h2.6v8zM18.2 19v-5.5h2.6V19z" fill="#c8dcee" stroke="#5b7fa6" stroke-width="1"/>`),

    chart: S(`
      <circle cx="12" cy="12" r="8.6" fill="#eaf3fb" stroke="#5b7fa6" stroke-width="1.2"/>
      <path d="M12 12V3.4A8.6 8.6 0 0 1 20.6 12z" fill="#6aa9d8"/>
      <path d="M12 12h8.6A8.6 8.6 0 0 1 15.7 19.9z" fill="#f0a86a"/>
      <path d="M12 12 6.2 19.1A8.6 8.6 0 0 1 3.4 12z" fill="#9ccb9c"/>`),

    /* ---------- 其他 ---------- */
    search: S(`
      <circle cx="10.5" cy="10.5" r="6.6" fill="#eaf3fb" stroke="#4a5a6a" stroke-width="1.8"/>
      <path d="M15.3 15.3 21 21" stroke="#4a5a6a" stroke-width="2.6" stroke-linecap="round"/>`),

    info: S(`
      <circle cx="12" cy="12" r="8.6" fill="#eaf3fb" stroke="#5b7fa6" stroke-width="1.4"/>
      <path d="M12 10.6v6" stroke="#1f6fb2" stroke-width="2" stroke-linecap="round"/>
      <circle cx="12" cy="7.6" r="1.25" fill="#1f6fb2"/>`),

    syntax: S(`
      <path d="M5 3h9.5L19 7.5V21H5z" fill="#fbfcfd" stroke="#5c6873" stroke-width="1"/>
      <path d="M14.5 3v4.5H19" fill="#e2eaf3" stroke="#5c6873" stroke-width="1"/>
      <path d="M7.6 11.5h8M7.6 14.5h6M7.6 17.5h4" stroke="#5b7fa6" stroke-width="1.3" stroke-linecap="round"/>`),

    output: S(`
      <rect x="3.5" y="3.5" width="17" height="17" rx="1" fill="#fbfcfd" stroke="#5c6873" stroke-width="1"/>
      <rect x="3.5" y="3.5" width="17" height="4.5" fill="#d7e2ee" stroke="#5c6873" stroke-width="1"/>
      <path d="M6.5 11h11M6.5 14h11M6.5 17h7" stroke="#8d9aa7" stroke-width="1.2"/>`),

    dataEditor: S(`
      <rect x="3" y="3.5" width="18" height="17" rx="1" fill="#fbfcfd" stroke="#5c6873" stroke-width="1"/>
      <path d="M3 8h18M3 12.5h18M3 17h18M9 3.5v17M15 3.5v17" stroke="#a9b8c7" stroke-width="1"/>
      <rect x="3" y="3.5" width="18" height="4.5" fill="#d7e2ee" stroke="#5c6873" stroke-width="1"/>`),

    close: S(`
      <path d="M6 6l12 12M18 6L6 18" stroke="#8e3532" stroke-width="2.4" stroke-linecap="round"/>`),

    export: S(`
      <path d="M12 3.5v10.5M8 10.2l4 4 4-4" fill="none" stroke="#2e8fd0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M4.5 16v3.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V16" fill="none" stroke="#2e8fd0" stroke-width="1.8" stroke-linecap="round"/>`),

    printOut: S(`
      <rect x="4" y="8.5" width="16" height="8" rx="1" fill="#9aa5b1" stroke="#5c6873" stroke-width="1"/>
      <rect x="7" y="3.5" width="10" height="5.5" fill="#f4f6f8" stroke="#5c6873" stroke-width="1"/>
      <rect x="7" y="13.5" width="10" height="7" fill="#fbfcfd" stroke="#5c6873" stroke-width="1"/>
      <rect x="8.6" y="15" width="6.8" height="1.1" fill="#a8b3bf"/>
      <rect x="8.6" y="17" width="6.8" height="1.1" fill="#a8b3bf"/>`),

    tree: S(`
      <path d="M4 6h6M4 12h10M4 18h8" stroke="#5b7fa6" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="4" cy="6" r="1.4" fill="#2e8fd0"/><circle cx="4" cy="12" r="1.4" fill="#2e8fd0"/><circle cx="4" cy="18" r="1.4" fill="#2e8fd0"/>`),

    promote: S(`<path d="M12 5v14M6.5 10.5 12 5l5.5 5.5" fill="none" stroke="#4a5a6a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`),
    demote: S(`<path d="M12 19V5M6.5 13.5 12 19l5.5-5.5" fill="none" stroke="#4a5a6a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`),
    run: S(`
      <circle cx="12" cy="12" r="8.6" fill="#3fae6a" stroke="#27703a" stroke-width="1"/>
      <path d="M10 8.2 16 12l-6 3.8z" fill="#fff"/>`),
    expandAll: S(`
      <path d="M12 4v16M4 12h16" stroke="#5b7fa6" stroke-width="2" stroke-linecap="round"/>`),
    collapseAll: S(`
      <path d="M4 12h16" stroke="#5b7fa6" stroke-width="2" stroke-linecap="round"/>`),
    check: S(`
      <circle cx="12" cy="12" r="8.6" fill="#4a7fb5" stroke="#2f5c8a" stroke-width="1"/>
      <path d="m8.2 12.4 2.6 2.6 5-5.4" fill="none" stroke="#fff" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>`),
  };

  function get(name, size) {
    const svg = ICONS[name] || ICONS.info;
    if (!size) return svg;
    return svg.replace(/width="20" height="20"/, `width="${size}" height="${size}"`);
  }

  global.Icons = { get, all: ICONS };
})(window);
