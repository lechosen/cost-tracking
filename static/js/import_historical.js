const VALID_CATEGORIES = [
  'Food & Groceries','Dining & Takeout','Transport','Utilities',
  'Rent & Mortgage','Health & Medical','Insurance',
  'Entertainment & Subscriptions','Shopping','House Supplies',
  'Travel','Phone & Internet','Property Tax',
  'Income','Transfer In','Transfer for Saving','Investment',
  'Other',
];

const Import = (() => {
  let parsedRows = [];

  function init() {
    const fileInput = document.getElementById('import-file-input');
    const dropZone = document.getElementById('import-drop-zone');
    const confirmBtn = document.getElementById('import-confirm');

    fileInput.addEventListener('change', e => handleFile(e.target.files[0]));

    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      handleFile(e.dataTransfer.files[0]);
    });

    confirmBtn.addEventListener('click', confirmImport);
  }

  function handleFile(file) {
    if (!file) return;
    document.getElementById('import-filename').textContent = file.name;
    document.getElementById('import-result').textContent = '';
    const reader = new FileReader();
    reader.onload = e => parseCSV(e.target.result);
    reader.readAsText(file);
  }

  function parseCSV(rawText) {
    // Strip UTF-8 BOM if present
    const text = rawText.replace(/^﻿/, '');
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) { showError('CSV has no data rows.'); return; }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const required = ['year','month','category','amount','direction'];
    const missing = required.filter(r => !headers.includes(r));
    if (missing.length) { showError(`Missing columns: ${missing.join(', ')}`); return; }

    const idx = h => headers.indexOf(h);
    const rows = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      // Skip fully-empty rows (trailing newlines or blank rows in spreadsheet exports)
      if (cols.every(c => !c)) continue;

      const year = parseInt(cols[idx('year')]);
      const month = parseInt(cols[idx('month')]);
      const category = cols[idx('category')];
      const amount = parseFloat(cols[idx('amount')]);
      const direction = (cols[idx('direction')] || '').toLowerCase();

      if (isNaN(year) || year < 2000 || year > 2100) { errors.push(`Row ${i+1}: invalid year`); continue; }
      if (isNaN(month) || month < 1 || month > 12) { errors.push(`Row ${i+1}: invalid month`); continue; }
      if (!VALID_CATEGORIES.includes(category)) { errors.push(`Row ${i+1}: unknown category "${category}"`); continue; }
      if (isNaN(amount) || amount < 0) { errors.push(`Row ${i+1}: invalid amount`); continue; }
      if (amount === 0) continue; // silently skip zero-amount rows (e.g. unused categories)
      if (!['in','out'].includes(direction)) { errors.push(`Row ${i+1}: direction must be "in" or "out"`); continue; }

      rows.push({ year, month, category, amount, direction });
    }

    parsedRows = rows;
    renderPreview(rows, errors);
    document.getElementById('import-confirm').disabled = rows.length === 0;
  }

  function renderPreview(rows, errors) {
    const el = document.getElementById('import-preview');
    if (!rows.length && !errors.length) { el.innerHTML = ''; return; }

    let html = `<h3 style="margin-top:1.5rem">Preview — ${rows.length} valid row(s)</h3>`;

    if (errors.length) {
      html += `<div class="info-box" style="color:var(--red);margin-bottom:1rem"><strong>Errors (skipped):</strong><br>${errors.join('<br>')}</div>`;
    }

    if (rows.length) {
      html += `<div id="import-table-wrap"><table id="review-table"><thead>
        <tr><th>Year</th><th>Month</th><th>Category</th><th>Amount</th><th>Direction</th></tr>
      </thead><tbody>`;
      rows.forEach(r => {
        const cls = r.direction === 'in' ? 'amount-in' : 'amount-out';
        html += `<tr>
          <td>${r.year}</td><td>${r.month.toString().padStart(2,'0')}</td>
          <td>${r.category}</td>
          <td class="${cls}">$${r.amount.toFixed(2)}</td>
          <td>${r.direction}</td>
        </tr>`;
      });
      html += '</tbody></table></div>';
    }
    el.innerHTML = html;
  }

  async function confirmImport() {
    if (!parsedRows.length) return;
    const btn = document.getElementById('import-confirm');
    const result = document.getElementById('import-result');
    btn.disabled = true;
    btn.textContent = 'Importing…';
    try {
      const res = await API.post('/api/import/historical', { rows: parsedRows });
      result.style.color = 'var(--green)';
      result.textContent = `✓ Imported ${res.imported} record(s) successfully.`;
      parsedRows = [];
      document.getElementById('import-preview').innerHTML = '';
      document.getElementById('import-filename').textContent = '';
      Dashboard.loadHistory();
    } catch (e) {
      result.style.color = 'var(--red)';
      result.textContent = 'Import failed: ' + e.message;
      btn.disabled = false;
    }
    btn.textContent = 'Import Records';
  }

  function showError(msg) {
    document.getElementById('import-preview').innerHTML =
      `<div class="info-box" style="color:var(--red)">${msg}</div>`;
    document.getElementById('import-confirm').disabled = true;
  }

  return { init };
})();
