const Dashboard = (() => {
  let pieChart = null;
  let barChart = null;
  let historyChart = null;
  let cumulativeChart = null;
  let historyData = null;

  const PALETTE = [
    '#c4773b','#e8a96e','#7a9e6b','#5b7fa6','#a67ca8',
    '#d4955a','#6aac8e','#c45b5b','#8c7b4a','#5c8a7a',
    '#b87333','#7b9dc0','#cc8866','#88aa66','#aa6688',
    '#ddb870','#6699bb','#99bb66','#bb6699','#66bb99',
  ];

  function init() {
    document.getElementById('dash-load').addEventListener('click', load);
    document.getElementById('history-toggle').addEventListener('change', e => {
      if (!historyData) return;
      if (e.target.checked) renderHistoryBreakdown(historyData);
      else renderHistoryChart(historyData);
    });
    load();
    loadHistory();
  }

  async function load() {
    const year = document.getElementById('dash-year').value;
    const month = document.getElementById('dash-month').value;
    try {
      const data = await API.get(`/api/reports/monthly?year=${year}&month=${month}`);
      renderSummaryCards(data.summary);
      renderPieChart(data.expense_breakdown);
      renderMonthlyBar(data.summary);
    } catch (e) {
      console.error('Dashboard load error', e);
    }
  }

  async function loadHistory() {
    try {
      const data = await API.get('/api/reports/history');
      historyData = data.history;
      const isBreakdown = document.getElementById('history-toggle').checked;
      if (isBreakdown) renderHistoryBreakdown(historyData);
      else renderHistoryChart(historyData);
      renderCumulativeChart(historyData);
    } catch (e) {
      console.error('History load error', e);
    }
  }

  function renderSummaryCards(s) {
    if (!s) return;
    const net = s.net || 0;
    document.getElementById('dash-summary').innerHTML = `
      <div class="card"><div class="label">Income</div><div class="value income">$${fmt(s.total_income)}</div></div>
      <div class="card"><div class="label">Expenses</div><div class="value expense">$${fmt(s.total_expense)}</div></div>
      <div class="card"><div class="label">Net Expense</div><div class="value expense">$${fmt(s.net_expense)}</div></div>
      <div class="card"><div class="label">Savings</div><div class="value income">$${fmt(s.savings)}</div></div>
      <div class="card"><div class="label">Investment</div><div class="value income">$${fmt(s.investment)}</div></div>
      <div class="card"><div class="label">Balance</div><div class="value ${net >= 0 ? 'income' : 'expense'}">$${fmt(net)}</div></div>
    `;
  }

  function renderPieChart(breakdown) {
    const labels = Object.keys(breakdown || {}).filter(k => breakdown[k] > 0);
    const values = labels.map(k => breakdown[k]);

    const ctx = document.getElementById('category-chart').getContext('2d');
    if (pieChart) pieChart.destroy();

    if (!labels.length) {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      return;
    }

    pieChart = new Chart(ctx, {
      type: 'doughnut',
      plugins: [ChartDataLabels],
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: PALETTE.slice(0, labels.length),
          borderColor: '#f7f2ec',
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#3a2a1a', font: { size: 12 }, padding: 14 },
          },
          tooltip: {
            callbacks: {
              label: ctx => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? (ctx.parsed / total * 100).toFixed(1) : '0.0';
                return ` ${ctx.label}: $${fmt(ctx.parsed)} (${pct}%)`;
              },
            },
          },
          datalabels: {
            formatter: (value, ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? (value / total * 100).toFixed(1) : 0;
              return pct >= 4 ? pct + '%' : '';
            },
            color: '#fff',
            font: { weight: 'bold', size: 11 },
          },
        },
      },
    });
  }

  function renderMonthlyBar(s) {
    if (!s) return;
    const ctx = document.getElementById('monthly-bar-chart').getContext('2d');
    if (barChart) barChart.destroy();
    barChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Income', 'Expenses', 'Net Expense', 'Savings', 'Investment'],
        datasets: [{
          data: [s.total_income, s.total_expense, s.net_expense, s.savings, s.investment],
          backgroundColor: ['#7a9e6b','#c4773b','#e8a96e','#5b7fa6','#a67ca8'],
          borderRadius: 5,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#7a6655' }, grid: { color: '#ddd5c8' } },
          y: { ticks: { color: '#7a6655', callback: v => '$' + v.toLocaleString() }, grid: { color: '#ddd5c8' } },
        },
      },
    });
  }

  function renderHistoryChart(history) {
    const labels = Object.keys(history || {}).sort();
    const incomes = labels.map(k => history[k].income || 0);
    const expenses = labels.map(k => history[k].net_expense || 0);

    const ctx = document.getElementById('history-chart').getContext('2d');
    if (historyChart) historyChart.destroy();

    if (!labels.length) return;

    historyChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Income', data: incomes, borderColor: '#7a9e6b', backgroundColor: '#7a9e6b18', fill: true, tension: .35, pointRadius: 3 },
          { label: 'Net Expense', data: expenses, borderColor: '#c4773b', backgroundColor: '#c4773b18', fill: true, tension: .35, pointRadius: 3 },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: '#3a2a1a', font: { size: 12 } } },
        },
        scales: {
          x: { ticks: { color: '#7a6655', maxRotation: 45 }, grid: { color: '#ddd5c8' } },
          y: { ticks: { color: '#7a6655', callback: v => '$' + v.toLocaleString() }, grid: { color: '#ddd5c8' } },
        },
      },
    });
  }

  function renderHistoryBreakdown(history) {
    const labels = Object.keys(history || {}).sort();
    if (!labels.length) return;

    // Collect all categories that appear across all months
    const catSet = new Set();
    labels.forEach(k => Object.keys(history[k].breakdown || {}).forEach(c => catSet.add(c)));
    const categories = [...catSet].sort();

    const ctx = document.getElementById('history-chart').getContext('2d');
    if (historyChart) historyChart.destroy();

    const datasets = categories.map((cat, i) => ({
      label: cat,
      data: labels.map(k => Math.round(((history[k].breakdown || {})[cat] || 0) * 100) / 100),
      backgroundColor: PALETTE[i % PALETTE.length],
      borderRadius: 2,
      borderSkipped: false,
    }));

    historyChart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: '#3a2a1a', font: { size: 11 }, boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: $${fmt(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          x: { stacked: true, ticks: { color: '#7a6655', maxRotation: 45 }, grid: { color: '#ddd5c8' } },
          y: { stacked: true, ticks: { color: '#7a6655', callback: v => '$' + v.toLocaleString() }, grid: { color: '#ddd5c8' } },
        },
      },
    });
  }

  function renderCumulativeChart(history) {
    const labels = Object.keys(history || {}).sort();
    if (!labels.length) return;

    let cumSavings = 0;
    let cumInvestment = 0;
    const savingsLine = labels.map(k => { cumSavings += history[k].savings || 0; return Math.round(cumSavings * 100) / 100; });
    const investmentLine = labels.map(k => { cumInvestment += history[k].investment || 0; return Math.round(cumInvestment * 100) / 100; });

    const ctx = document.getElementById('cumulative-chart').getContext('2d');
    if (cumulativeChart) cumulativeChart.destroy();

    cumulativeChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Savings', data: savingsLine, borderColor: '#5b7fa6', backgroundColor: '#5b7fa618', fill: true, tension: .35, pointRadius: 3 },
          { label: 'Investment', data: investmentLine, borderColor: '#a67ca8', backgroundColor: '#a67ca818', fill: true, tension: .35, pointRadius: 3 },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: '#3a2a1a', font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: $${fmt(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          x: { ticks: { color: '#7a6655', maxRotation: 45 }, grid: { color: '#ddd5c8' } },
          y: { ticks: { color: '#7a6655', callback: v => '$' + v.toLocaleString() }, grid: { color: '#ddd5c8' } },
        },
      },
    });
  }

  function fmt(n) {
    return (n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return { init, loadHistory };
})();
