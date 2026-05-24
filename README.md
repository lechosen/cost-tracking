# Cost Tracking — Household Expense Tracker

A locally-hosted web app for tracking household finances. Members upload monthly bank CSV/XLSX exports, a **local LLM (via [Ollama](https://ollama.com)) categorizes each transaction on-device**, and a shared dashboard shows spending and earnings by month across all historical years.

**No API keys. No cloud. No data leaves your machine.**
<img width="3200" height="1670" alt="image" src="https://github.com/user-attachments/assets/7e218175-78d2-49c1-9700-c7d811fb78e5" />

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | ![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white) ![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi&logoColor=white) |
| **Frontend** | ![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white) ![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white) ![JavaScript](https://img.shields.io/badge/Vanilla_JS-F7DF1E?logo=javascript&logoColor=black) |
| **Database** | ![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white) via SQLAlchemy ORM |
| **File Parsing** | ![pandas](https://img.shields.io/badge/pandas-150458?logo=pandas&logoColor=white) + openpyxl (CSV & XLSX) |
| **LLM** | ![Ollama](https://img.shields.io/badge/Ollama-local-black) `qwen2.5` — fully on-device, no API key |
| **Auth** | Lightweight PIN — no OAuth, no sessions |
| **Deployment** | LAN-hosted via `uvicorn`, accessible from any device on the same Wi-Fi |

---

## Features

- Upload bank exports (CSV / XLSX) from multiple members
- Automatic transaction categorization via a **local Ollama model** — runs fully on your machine, no internet required
- Manual review and correction before publishing results
- Monthly earnings vs. spending dashboard with full history
- Manual cash entry per member
- Lightweight PIN authentication — no accounts or OAuth needed

---

## Requirements

- Python 3.11+
- [Ollama](https://ollama.com) installed and running locally (used for LLM categorization — **no API key needed**)
  - Default model: `qwen2.5:latest` — pull it once with `ollama pull qwen2.5`
  - Any other Ollama-compatible model works; set `OLLAMA_MODEL` in `.env` to override

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
DATABASE_URL=sqlite:///./cost_tool.db
PIN=1234
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:latest
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

### Changing categories or categorization rules

Edit `CATEGORIES` and the rules block inside `build_system_prompt()` in [app/services/categorizer.py](app/services/categorizer.py). Existing confirmed transactions keep their labels; re-trigger categorization on those months if needed.

### Swapping the Ollama model

Set `OLLAMA_MODEL` in `.env` to any model you have pulled locally (e.g. `llama3.2`, `mistral`). Larger models are more accurate but slower — `qwen2.5:latest` (7.6B) is a good balance for a home server.

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

**Everything stays on your machine.** Transaction categorization runs via a local Ollama model — no data is ever sent to an external API or third-party service. Bank account numbers, balances, and raw files never leave your network.

---

## License

MIT
