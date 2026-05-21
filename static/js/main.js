// Tab switching + PIN gate
document.addEventListener('DOMContentLoaded', () => {
  const pinGate = document.getElementById('pin-gate');
  const pinInput = document.getElementById('pin-input');
  const pinSubmit = document.getElementById('pin-submit');
  const pinError = document.getElementById('pin-error');
  const appEl = document.getElementById('app');

  async function tryPin(pin) {
    API.setPin(pin);
    try {
      await API.get('/api/reports/history');
      pinGate.classList.add('hidden');
      appEl.classList.remove('hidden');
      initApp();
    } catch (e) {
      if (e.message === 'PIN_INVALID') {
        pinError.classList.remove('hidden');
        pinInput.value = '';
      } else {
        // Server reachable but no PIN set — allow through
        pinGate.classList.add('hidden');
        appEl.classList.remove('hidden');
        initApp();
      }
    }
  }

  pinSubmit.addEventListener('click', () => tryPin(pinInput.value));
  pinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryPin(pinInput.value); });

  // Auto-attempt with empty PIN (for no-PIN setups)
  tryPin('');

  function initApp() {
    setupTabs();
    populateYears();
    Dashboard.init();
    Review.init();
    Upload.init();
    Cash.init();
    Import.init();
  }

  function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(s => s.classList.add('hidden'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
      });
    });
  }

  function populateYears() {
    const now = new Date();
    const years = [];
    for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) years.push(y);

    ['dash-year', 'review-year'].forEach(id => {
      const sel = document.getElementById(id);
      years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y;
        sel.appendChild(opt);
      });
      // Default to current month
      sel.value = now.getFullYear();
      const monthSel = document.getElementById(id.replace('year', 'month'));
      if (monthSel) monthSel.value = now.getMonth() + 1;
    });
  }
});
