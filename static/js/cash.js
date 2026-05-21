const Cash = (() => {
  function init() {
    document.getElementById('cash-form').addEventListener('submit', submit);
    loadRecent();
  }

  async function submit(e) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    data.amount = parseFloat(data.amount);
    const resultEl = document.getElementById('cash-result');
    try {
      await API.post('/api/transactions/cash', data);
      resultEl.textContent = 'Entry added.';
      resultEl.style.color = 'var(--green)';
      form.reset();
      loadRecent();
    } catch (err) {
      resultEl.textContent = 'Error: ' + err.message;
      resultEl.style.color = 'var(--red)';
    }
  }

  async function loadRecent() {
    const now = new Date();
    const list = document.getElementById('cash-list');
    try {
      const entries = await API.get(
        `/api/transactions/cash?year=${now.getFullYear()}&month=${now.getMonth() + 1}`
      );
      if (!entries.length) {
        list.innerHTML = '<p style="color:var(--muted)">No cash entries this month.</p>';
        return;
      }
      list.innerHTML = `<table>
        <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Category</th></tr></thead>
        <tbody>${entries.map(e => `
          <tr>
            <td>${e.date}</td>
            <td>${e.description}</td>
            <td class="${e.direction === 'in' ? 'amount-in' : 'amount-out'}">
              ${e.direction === 'in' ? '+' : '-'}$${Math.abs(e.amount).toFixed(2)}
            </td>
            <td>${e.category || '—'}</td>
          </tr>`).join('')}
        </tbody></table>`;
    } catch (err) {
      list.innerHTML = '<p style="color:var(--red)">Failed to load entries.</p>';
    }
  }

  return { init };
})();
