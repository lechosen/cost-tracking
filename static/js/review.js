const CATEGORIES = [
  'Food & Groceries','Dining & Takeout','Transport','Utilities',
  'Rent & Mortgage','Health & Medical','Insurance',
  'Entertainment & Subscriptions','Shopping','House Supplies',
  'Travel','Phone & Internet','Property Tax',
  'Income','Transfer In','Transfer for Saving','Investment',
  'Other',
];

const EXPENSE_CATEGORIES = CATEGORIES.filter(
  c => !['Transfer In','Transfer for Saving','Investment','Income'].includes(c)
);

const Review = (() => {
  let transactions = [];

  function init() {
    document.getElementById('review-load').addEventListener('click', load);
    document.getElementById('publish-selected').addEventListener('click', publishSelected);
    document.getElementById('remove-selected').addEventListener('click', removeSelected);
    document.getElementById('select-all').addEventListener('change', toggleAll);
    document.getElementById('review-filter').addEventListener('change', () => {
      updateBulkBar();
    });
  }

  async function load() {
    const year = document.getElementById('review-year').value;
    const month = document.getElementById('review-month').value;
    const filter = document.getElementById('review-filter').value;

    let params = `year=${year}&month=${month}`;
    if (filter === 'pending')   params += '&published=false&reviewed=false';
    if (filter === 'reviewed')  params += '&published=false&reviewed=true';
    if (filter === 'published') params += '&published=true';

    try {
      transactions = await API.get(`/api/transactions?${params}`);
      document.getElementById('select-all').checked = false;
      document.getElementById('bulk-actions-bar').style.display = 'none';
      renderTable(filter === 'published');
      buildColumnFilters();
    } catch (e) {
      console.error('Review load error', e);
    }
  }

  function renderTable(isPublishedView) {
    const tbody = document.getElementById('review-body');
    tbody.innerHTML = '';
    if (!transactions.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:2rem">No transactions</td></tr>';
      return;
    }
    transactions.forEach(t => {
      const tr = document.createElement('tr');
      tr.dataset.id = t.id;
      const amtClass = t.direction === 'in' ? 'amount-in' : 'amount-out';
      const amtPrefix = t.direction === 'in' ? '+' : '-';
      const currentCat = t.confirmed_category || t.raw_category || '';
      const catOptions = CATEGORIES.map(c =>
        `<option value="${c}" ${c === currentCat ? 'selected' : ''}>${c}</option>`
      ).join('');

      const isTransferIn = currentCat === 'Transfer In';
      const offsetOptions = EXPENSE_CATEGORIES
        .map(c => `<option value="${c}" ${c === (t.offset_category || '') ? 'selected' : ''}>${c}</option>`)
        .join('');
      const offsetCell = `<select class="offset-select" style="display:${isTransferIn ? 'inline-block' : 'none'};font-size:.8rem;margin-top:.2rem">
        <option value="">— no target —</option>${offsetOptions}</select>`;

      const actions = isPublishedView
        ? `<button class="btn-unpublish" title="Unpublish (move back to review)" style="color:var(--accent)">↩</button>
           <button class="btn-del" title="Delete" style="color:var(--red);margin-left:.25rem">✕</button>`
        : `<button class="btn-save" title="Save">✓</button>
           <button class="btn-del" title="Delete" style="color:var(--red);margin-left:.25rem">✕</button>`;

      tr.innerHTML = `
        <td><input type="checkbox" class="row-check" onchange="Review._updateBulkBar()" /></td>
        <td style="white-space:nowrap">${t.date}</td>
        <td title="${t.description}">${t.description.substring(0, 48)}${t.description.length > 48 ? '…' : ''}</td>
        <td class="${amtClass}" style="white-space:nowrap">${amtPrefix}$${Math.abs(t.amount).toFixed(2)}</td>
        <td>${t.account_type || '—'}</td>
        <td><span class="badge">${t.raw_category || '—'}</span></td>
        <td>
          <select class="cat-select">${catOptions}</select>
          ${offsetCell}
        </td>
        <td><input class="notes-input" type="text" placeholder="add note…" value="${t.notes || ''}" /></td>
        <td style="white-space:nowrap">${actions}</td>
      `;

      tr.querySelector('.cat-select').addEventListener('change', e => {
        tr.querySelector('.offset-select').style.display =
          e.target.value === 'Transfer In' ? 'inline-block' : 'none';
      });

      if (!isPublishedView) {
        tr.querySelector('.btn-save').addEventListener('click', () => saveReview(t.id, tr));
      } else {
        tr.querySelector('.btn-unpublish').addEventListener('click', () => unpublishRow(t.id, tr));
      }
      tr.querySelector('.btn-del').addEventListener('click', () => deleteRow(t.id, tr));
      tbody.appendChild(tr);
    });
  }

  function buildColumnFilters() {
    const unique = col => [...new Set(transactions.map(t => t[col] || '').filter(Boolean))].sort();

    const populate = (dataCol, values) => {
      const sel = document.querySelector(`.col-filter[data-col="${dataCol}"]`);
      if (!sel) return;
      const first = sel.options[0].outerHTML;
      sel.innerHTML = first + values.map(v => `<option value="${v}">${v}</option>`).join('');
    };

    populate('date',    unique('date'));
    populate('account', unique('account_type'));
    populate('llm',     unique('raw_category'));
    populate('confirmed', [...new Set(transactions.map(t => t.confirmed_category || t.raw_category || '').filter(Boolean))].sort());

    // Attach listeners (replace old ones by cloning)
    document.querySelectorAll('.col-filter').forEach(sel => {
      const fresh = sel.cloneNode(true);
      sel.replaceWith(fresh);
      fresh.addEventListener('change', applyFilters);
    });
    const textInput = document.querySelector('.col-filter-text');
    if (textInput) {
      const fresh = textInput.cloneNode(true);
      textInput.replaceWith(fresh);
      fresh.addEventListener('input', applyFilters);
    }
  }

  function applyFilters() {
    const val = col => (document.querySelector(`.col-filter[data-col="${col}"]`)?.value || '').toLowerCase();
    const descVal = (document.querySelector('.col-filter-text')?.value || '').toLowerCase();
    const fDate = val('date'), fDir = val('dir'), fAcc = val('account'), fLlm = val('llm'), fCat = val('confirmed');

    document.querySelectorAll('#review-body tr').forEach(tr => {
      const id = parseInt(tr.dataset.id);
      const t = transactions.find(x => x.id === id);
      if (!t) return;
      const cat = (t.confirmed_category || t.raw_category || '').toLowerCase();
      const visible =
        (!fDate || t.date === fDate) &&
        (!fDir  || t.direction === fDir) &&
        (!fAcc  || (t.account_type || '').toLowerCase() === fAcc) &&
        (!fLlm  || (t.raw_category || '').toLowerCase() === fLlm) &&
        (!fCat  || cat === fCat) &&
        (!descVal || t.description.toLowerCase().includes(descVal));
      tr.style.display = visible ? '' : 'none';
    });
  }

  async function saveReview(id, tr) {
    const cat = tr.querySelector('.cat-select').value;
    const notes = tr.querySelector('.notes-input').value;
    const offsetEl = tr.querySelector('.offset-select');
    const offset_category = (cat === 'Transfer In' && offsetEl) ? (offsetEl.value || null) : null;
    if (cat === 'Transfer In') {
      const txn = transactions.find(x => x.id === id);
      if (txn && txn.direction === 'out') {
        alert('Transfer In can only be applied to incoming transactions (money flowing in). This is an outgoing transaction.');
        return;
      }
    }
    try {
      await API.patch(`/api/transactions/${id}/review`, { confirmed_category: cat, notes, offset_category });
      const btn = tr.querySelector('.btn-save');
      btn.textContent = '✓✓';
      btn.style.color = 'var(--green)';
    } catch (e) {
      alert('Save failed: ' + e.message);
    }
  }

  async function unpublishRow(id, tr) {
    if (!confirm('Move this transaction back to Pending Review? It will not be deleted.')) return;
    try {
      await API.post(`/api/transactions/${id}/unpublish`, {});
      tr.remove();
      Dashboard.loadHistory();
    } catch (e) {
      alert('Unpublish failed: ' + e.message);
    }
  }

  async function deleteRow(id, tr) {
    if (!confirm('Permanently delete this transaction?')) return;
    try {
      await API.delete(`/api/transactions/${id}`);
      tr.remove();
    } catch (e) {
      alert('Delete failed: ' + e.message);
    }
  }

  async function publishSelected() {
    const checked = [...document.querySelectorAll('.row-check:checked')];
    if (!checked.length) { alert('Select at least one transaction'); return; }

    for (const cb of checked) {
      const tr = cb.closest('tr');
      const id = parseInt(tr.dataset.id);
      await saveReview(id, tr);
    }

    const ids = checked.map(cb => parseInt(cb.closest('tr').dataset.id));
    try {
      const res = await API.post('/api/transactions/publish', { ids });
      alert(`Published ${res.published} transaction(s)`);
      load();
      Dashboard.loadHistory();
    } catch (e) {
      alert('Publish failed: ' + e.message);
    }
  }

  function toggleAll(e) {
    document.querySelectorAll('.row-check').forEach(cb => cb.checked = e.target.checked);
    updateBulkBar();
  }

  function updateBulkBar() {
    const count = document.querySelectorAll('.row-check:checked').length;
    const bar = document.getElementById('bulk-actions-bar');
    const isPublished = document.getElementById('review-filter').value === 'published';

    if (count > 0) {
      bar.style.display = 'flex';
      document.getElementById('bulk-count').textContent = `${count} selected`;
      document.getElementById('publish-selected').style.display = isPublished ? 'none' : '';
      document.getElementById('remove-selected').textContent = `Remove Selected (${count})`;
    } else {
      bar.style.display = 'none';
    }
  }

  async function removeSelected() {
    const checked = [...document.querySelectorAll('.row-check:checked')];
    if (!checked.length) return;
    if (!confirm(`Permanently delete ${checked.length} transaction(s)?`)) return;

    for (const cb of checked) {
      const tr = cb.closest('tr');
      const id = parseInt(tr.dataset.id);
      try {
        await API.delete(`/api/transactions/${id}`);
        tr.remove();
      } catch (e) {
        alert(`Delete failed for id ${id}: ${e.message}`);
      }
    }
    // uncheck select-all after deletion
    document.getElementById('select-all').checked = false;
    updateBulkBar();
  }

  return { init, _updateBulkBar: updateBulkBar };
})();
