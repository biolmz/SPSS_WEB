/* ============ 后端 API 封装 ============ */
(function (global) {
  'use strict';

  const BASE = '';

  async function req(method, path, body, isForm) {
    const opt = { method, headers: {} };
    if (body !== undefined && body !== null) {
      if (isForm) { opt.body = body; }
      else { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    }
    const res = await fetch(BASE + path, opt);
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        msg = j.detail || j.message || msg;
      } catch (e) { /* ignore */ }
      throw new Error(msg);
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res;
  }

  const API = {
    listDatasets: () => req('GET', '/api/datasets'),
    createDataset: (payload) => req('POST', '/api/datasets', payload || {}),
    getDataset: (id, offset, limit) => req('GET', `/api/datasets/${id}` + (limit ? `?offset=${offset || 0}&limit=${limit}` : '')),
    deleteDataset: (id) => req('DELETE', `/api/datasets/${id}`),
    renameDataset: (id, payload) => req('PATCH', `/api/datasets/${id}`, payload),

    updateCells: (id, cells) => req('PUT', `/api/datasets/${id}/cells`, { cells }),
    insertRows: (id, payload) => req('POST', `/api/datasets/${id}/rows`, payload),
    deleteRows: (id, indexes) => req('DELETE', `/api/datasets/${id}/rows?indexes=${indexes.join(',')}`),
    addVariable: (id, payload) => req('POST', `/api/datasets/${id}/variables`, payload),
    updateVariable: (id, name, payload) => req('PUT', `/api/datasets/${id}/variables/${encodeURIComponent(name)}`, payload),
    deleteVariable: (id, name) => req('DELETE', `/api/datasets/${id}/variables/${encodeURIComponent(name)}`),

    importFile: (id, file) => {
      const fd = new FormData();
      fd.append('file', file);
      return req('POST', `/api/datasets/${id}/import`, fd, true);
    },
    exportUrl: (id, format) => `${BASE}/api/datasets/${id}/export?format=${format}`,

    analyze: (id, procedure, params) => req('POST', `/api/datasets/${id}/analyze`, { procedure, params }),
    transform: (id, transform, params) => req('POST', `/api/datasets/${id}/transform`, { transform, params }),
    runSyntax: (id, syntax) => req('POST', `/api/datasets/${id}/syntax`, { syntax }),

    samples: () => req('GET', '/api/samples'),
    loadSample: (kind) => req('POST', `/api/samples/${kind}`),

    spssSamples: () => req('GET', '/api/spss-samples'),
    loadSpssSample: (file) => req('POST', `/api/spss-samples/${encodeURIComponent(file)}`),

    // 语法命令定义库（来自 syntax_xml 的 328 份命令定义）
    syntaxStats: () => req('GET', '/api/syntax/stats'),
    syntaxCommands: (q, supported) =>
      req('GET', `/api/syntax/commands?q=${encodeURIComponent(q || '')}` + (supported ? '&supported=1' : '')),
    syntaxCommand: (name) => req('GET', `/api/syntax/commands/${encodeURIComponent(name)}`),
    syntaxComplete: (text, offset) =>
      req('GET', `/api/syntax/complete?text=${encodeURIComponent(text)}&offset=${offset}`),
    syntaxCheck: (syntax) => req('POST', '/api/syntax/check', { syntax }),
  };

  global.API = API;
})(window);
