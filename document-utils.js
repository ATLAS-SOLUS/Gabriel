// ============================================================
// document-utils.js — Criação de tabelas, arquivos DOC/PDF/TXT/CSV
// Gabriel PWA
// ============================================================

const DocumentUtils = (() => {
  const CDN = {
    jsPDF: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'
  };

  function safeName(name, fallback = 'documento') {
    return String(name || fallback)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9-_ ]/gi, '')
      .trim().replace(/\s+/g, '-')
      .slice(0, 80) || fallback;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function markdownToHtml(markdown = '') {
    let html = escapeHtml(markdown);
    html = html
      .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
      .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
    return html;
  }

  function markdownToPlain(markdown = '') {
    return String(markdown || '')
      .replace(/```[\s\S]*?```/g, block => block.replace(/```\w*|```/g, ''))
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .trim();
  }

  function parseTable(input) {
    if (!input) return { headers: [], rows: [] };
    if (Array.isArray(input)) {
      if (!input.length) return { headers: [], rows: [] };
      if (Array.isArray(input[0])) {
        const [headers = [], ...rows] = input;
        return { headers, rows };
      }
      if (typeof input[0] === 'object') {
        const headers = Object.keys(input[0]);
        const rows = input.map(item => headers.map(h => item[h] ?? ''));
        return { headers, rows };
      }
    }
    if (typeof input === 'object') {
      const headers = Array.isArray(input.headers) ? input.headers : [];
      const rows = Array.isArray(input.rows) ? input.rows : [];
      return { headers, rows };
    }
    const lines = String(input).split(/\r?\n/).filter(l => l.includes('|'));
    if (!lines.length) return { headers: [], rows: [] };
    const cleanRow = line => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const rows = lines.filter(l => !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(l)).map(cleanRow);
    return { headers: rows[0] || [], rows: rows.slice(1) };
  }

  function tableToMarkdown({ headers = [], rows = [] }) {
    if (!headers.length) return '';
    const cleanHeaders = headers.map(h => String(h || '').trim() || 'Coluna');
    const lines = [];
    lines.push('| ' + cleanHeaders.join(' | ') + ' |');
    lines.push('| ' + cleanHeaders.map(() => '---').join(' | ') + ' |');
    rows.forEach(row => lines.push('| ' + cleanHeaders.map((_, i) => String((row || [])[i] ?? '').replace(/\|/g, '/')).join(' | ') + ' |'));
    return lines.join('\n');
  }

  function tableToCsv(table) {
    const { headers, rows } = table;
    const csvEscape = v => {
      const s = String(v ?? '');
      return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [headers, ...rows].map(row => row.map(csvEscape).join(';')).join('\n');
  }

  function tableToHtml(table) {
    const { headers, rows } = table;
    if (!headers.length) return '<p>Nenhum dado de tabela informado.</p>';
    return `<table><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${headers.map((_, i) => `<td>${escapeHtml((row || [])[i] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const exists = [...document.scripts].find(s => s.src === src);
      if (exists) return resolve();
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Falha ao carregar biblioteca externa: ' + src));
      document.head.appendChild(script);
    });
  }

  async function maybeSaveToDrive(file, saveToDrive = false) {
    if (!saveToDrive) return null;
    if (!window.Google?.isConnected()) return null;
    const folderId = await window.Google.Drive.getOrCreateGabrielFolder();
    return await window.Google.Drive.upload(file, folderId);
  }

  function normalizeFormat(format) {
    const f = String(format || 'txt').toLowerCase().replace('.', '');
    if (['pdf', 'doc', 'docx', 'html', 'txt', 'md', 'csv'].includes(f)) return f;
    return 'txt';
  }

  async function createPdf({ title, content, fileName, saveToDrive }) {
    await loadScript(CDN.jsPDF);
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) throw new Error('jsPDF não carregou.');
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 42;
    const maxWidth = 512;
    let y = margin;
    const addLine = (line, size = 11, bold = false) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      const parts = doc.splitTextToSize(String(line || ''), maxWidth);
      parts.forEach(part => {
        if (y > 790) { doc.addPage(); y = margin; }
        doc.text(part, margin, y);
        y += size + 7;
      });
    };
    addLine(title || 'Documento Gabriel', 18, true);
    y += 8;
    markdownToPlain(content).split(/\r?\n/).forEach(line => {
      if (/^\s*$/.test(line)) { y += 8; return; }
      addLine(line, /^#{1,3}\s/.test(line) ? 14 : 11, /^#{1,3}\s/.test(line));
    });
    const blob = doc.output('blob');
    const finalName = safeName(fileName || title, 'documento') + '.pdf';
    const file = new File([blob], finalName, { type: 'application/pdf' });
    downloadBlob(blob, finalName);
    const drive = await maybeSaveToDrive(file, saveToDrive);
    return { fileName: finalName, mimeType: 'application/pdf', drive };
  }

  async function createDocument(params = {}) {
    const title = params.title || 'Documento Gabriel';
    const content = params.content || '';
    const format = normalizeFormat(params.format || params.type || 'txt');
    const baseName = safeName(params.fileName || title, 'documento');
    if (format === 'pdf') return await createPdf({ title, content, fileName: baseName, saveToDrive: params.saveToDrive });

    let body = '';
    let mime = 'text/plain;charset=utf-8';
    let ext = format;

    if (format === 'doc' || format === 'docx') {
      ext = 'doc';
      mime = 'application/msword;charset=utf-8';
      body = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;line-height:1.5;color:#111}h1,h2,h3{color:#111}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f2f2f2}</style></head><body><h1>${escapeHtml(title)}</h1>${markdownToHtml(content)}</body></html>`;
    } else if (format === 'html') {
      mime = 'text/html;charset=utf-8';
      body = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${markdownToHtml(content)}</body></html>`;
    } else if (format === 'md') {
      mime = 'text/markdown;charset=utf-8';
      body = content;
    } else {
      ext = 'txt';
      body = markdownToPlain(content);
    }

    const blob = new Blob([body], { type: mime });
    const finalName = `${baseName}.${ext}`;
    const file = new File([blob], finalName, { type: mime });
    downloadBlob(blob, finalName);
    const drive = await maybeSaveToDrive(file, !!params.saveToDrive);
    return { fileName: finalName, mimeType: mime, drive };
  }

  async function createTable(params = {}) {
    const title = params.title || 'Tabela Gabriel';
    const table = parseTable(params.table || { headers: params.headers || [], rows: params.rows || [] });
    const format = normalizeFormat(params.format || 'md');
    let content = tableToMarkdown(table);
    let mime = 'text/markdown;charset=utf-8';
    let ext = 'md';
    if (format === 'csv') { content = tableToCsv(table); mime = 'text/csv;charset=utf-8'; ext = 'csv'; }
    if (format === 'html' || format === 'doc' || format === 'docx') {
      content = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px}th{background:#f2f2f2}</style></head><body><h1>${escapeHtml(title)}</h1>${tableToHtml(table)}</body></html>`;
      mime = format === 'html' ? 'text/html;charset=utf-8' : 'application/msword;charset=utf-8';
      ext = format === 'html' ? 'html' : 'doc';
    }
    const blob = new Blob([content], { type: mime });
    const finalName = `${safeName(params.fileName || title, 'tabela')}.${ext}`;
    const file = new File([blob], finalName, { type: mime });
    downloadBlob(blob, finalName);
    const drive = await maybeSaveToDrive(file, !!params.saveToDrive);
    return { fileName: finalName, mimeType: mime, markdown: tableToMarkdown(table), drive };
  }

  return {
    createDocument,
    createTable,
    parseTable,
    tableToMarkdown,
    tableToCsv,
    tableToHtml,
    markdownToHtml,
    markdownToPlain,
    escapeHtml
  };
})();

window.DocumentUtils = DocumentUtils;
console.log('[Gabriel] document-utils.js carregado ✓');
