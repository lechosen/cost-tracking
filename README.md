# Cost Tracking — Household Expense Tracker

A locally-hosted web app for tracking household finances. Members upload monthly bank CSV/XLSX exports, an LLM categorizes each transaction automatically, and a shared dashboard shows spending and earnings by month across all historical years. No cloud accounts required — everything runs on your home network.

---

## Features

- Upload bank exports (CSV / XLSX) from multiple members
- Automatic transaction categorization via Claude API (Food, Rent, Utilities, Transport, Entertainment, Health, Other)
- Manual review and correction before publishing results
- Monthly earnings vs. spending dashboard with full history
- Manual cash entry per member
- Lightweight PIN authentication — no accounts or OAuth needed

---

## Requirements

- Python 3.11+
- An [Anthropic API key](https://console.anthropic.com/) for LLM categorization

---

## Setup

```bash
# 1. Clone the repo
git clone https://github.com/lechosen/cost-tracking.git
cd cost-tracking

# 2. Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate        # macOS / Linux
# .venv\Scripts\activate         # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment
cp .env.example .env
# Edit .env and fill in your ANTHROPIC_API_KEY
```

`.env` template (also provided as `.env.example`):

```
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=sqlite:///./cost_tool.db
PIN=1234
```

---

## Running

```bash
# Start the server (accessible on your LAN)
uvicorn app.main:app --host 0.0.0.0 --port 3988 --reload
```

Open `http://<your-machine-ip>:3988` from any device on the same Wi-Fi network.

The Swagger UI (API explorer) is available at `http://localhost:3988/docs`.

---

## Usage Workflow

1. **Upload** — go to the Upload page, select a member, choose your bank's CSV/XLSX export, and submit.
2. **Review** — the LLM categorizes each transaction automatically. Browse the Review page to correct any mistakes.
3. **Publish** — once satisfied, publish the month. The dashboard updates immediately.
4. **Cash entries** — add any cash transactions manually via the Cash page.

---

## Project Structure

```
cost_tool/
├── app/
│   ├── main.py              # FastAPI app entry point
│   ├── models.py            # SQLAlchemy ORM models
│   ├── database.py          # SQLite engine & session
│   ├── routers/
│   │   ├── uploads.py       # POST /upload — file ingestion
│   │   ├── transactions.py  # GET/PATCH transactions, cash entry
│   │   ├── imports.py       # Historical import helpers
│   │   └── reports.py       # Monthly summaries
│   └── services/
│       ├── parser.py        # Normalizes CSV/XLSX → transaction rows
│       └── categorizer.py   # Batches descriptions → Claude API → categories
├── static/
│   ├── index.html
│   ├── css/main.css
│   └── js/                  # Vanilla JS — upload, review, dashboard, cash
├── .env.example
└── requirements.txt
```

---

## Maintenance

### Updating dependencies

```bash
pip install --upgrade -r requirements.txt
```

### Database migrations

The app auto-creates tables on first run via SQLAlchemy. For schema changes, add an Alembic migration or drop and recreate the DB (data loss — export first).

### Adding a new bank format

Bank CSV/XLSX formats vary. `parser.py` normalizes columns automatically using a small LLM prompt for unknown headers. If a new format fails, open `app/services/parser.py` and add a manual mapping under `COLUMN_ALIASES`.

### Changing categories

Edit the `CATEGORIES` list in `app/services/categorizer.py` and update the system prompt. Existing categorized transactions keep their old labels; re-run categorization on those months if needed.

---

## Roadmap / Future Improvements

- [ ] Export reports to CSV / PDF
- [ ] Per-category budgets with alerts
- [ ] Multi-household support (separate PIN spaces)
- [ ] Replace SQLite with PostgreSQL for households with larger history
- [ ] Dark mode
- [ ] Mobile-friendly layout improvements
- [ ] Recurring transaction detection

---

## Privacy

All data stays local — nothing leaves your machine except the transaction *descriptions* sent to the Anthropic API for categorization. Bank account numbers, balances, and raw files are never transmitted. If you prefer fully offline categorization, the categorizer can be swapped for a local Ollama model (see `app/services/categorizer.py`).

---

## License

MIT
