# RetailPyme — Predictive Sales System v2.0

> Thesis project — UPC · Information Systems Engineering  
> Predictive Sales & Inventory Management for Retail SMEs in Lima

---

## Tech Stack

| Layer      | Technology |
|------------|-----------|
| Backend    | Python 3.12 · FastAPI · SQLAlchemy 2.0 (async) |
| Auth       | JWT (python-jose) · bcrypt 4.0.1 |
| Database   | PostgreSQL 16 |
| Frontend   | React 18 · Vite · Tailwind CSS |
| Charts     | Recharts |
| Email      | aiosmtplib (SMTP) |
| **ML**     | **Microservicio XGBoost separado (`ml-service/`, puerto 8001)** |

> 🧠 **Integración del modelo XGBoost:** ver **[`INTEGRACION_ML.md`](./INTEGRACION_ML.md)**.
> El cliente sube su CSV/Excel de ventas y el sistema predice qué productos tienen
> sobre-stock, cuánto exceso y cuándo. Para levantar todo a la vez usa `run_all.sh`
> (Linux/Mac) o `run_all.bat` (Windows), y aparte `cd frontend && npm run dev`.

---

## Setup — Manual (No Docker)

### 1. PostgreSQL

```bash
# Create the database
psql -U postgres -c "CREATE DATABASE retail_pyme_db;"

# Apply schema
psql -U postgres -d retail_pyme_db -f database/schema.sql
```

### 2. Create first admin user (one-time seed)

After running the backend once (tables created), run:

```bash
cd backend
python -c "
from app.core.security import hash_password
print(hash_password('your_secure_password'))
"
```

Then insert into psql:
```sql
INSERT INTO companies (name, tax_id, email) VALUES ('Your Company', '20000000001', 'admin@company.com');

INSERT INTO users (company_id, name, email, password_hash, role)
SELECT id, 'Administrator', 'admin@company.com', '<HASH_FROM_ABOVE>', 'admin'
FROM companies WHERE tax_id = '20000000001';
```

### 3. Backend

```bash
cd backend

python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

pip install -r requirements.txt

cp .env.example .env
# Edit .env with your DB credentials and SMTP settings

python -m uvicorn app.main:app --reload
```

API available at: http://localhost:8000  
Swagger docs: http://localhost:8000/docs

### 4. Frontend

```bash
cd frontend

npm install
npm run dev
```

App available at: http://localhost:3000

---

## Environment Variables (.env)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL async connection string |
| `SECRET_KEY` | JWT secret (use a long random string in production) |
| `SMTP_HOST` | SMTP server (e.g. smtp.gmail.com) |
| `SMTP_USER` | Sender email address |
| `SMTP_PASSWORD` | App password (Gmail: generate in Google Account settings) |
| `SMTP_FROM` | From address shown in emails |

---

## Roles

| Role | Access |
|------|--------|
| `admin` | Full access: all modules + Users + ML Datasets + Training Jobs |
| `client` | Dashboard, Sales, Products, Inventory, Customers, Predictions |

---

## ML Integration Points

The system is designed to plug in an external ML microservice:

1. **Upload dataset** → `POST /api/v1/ml/datasets/upload`  
   Accepts CSV or Excel files (sales history, inventory, etc.)

2. **Queue training job** → `POST /api/v1/ml/training-jobs`  
   Specify dataset + model type (xgboost, prophet, arima, lstm, ensemble)

3. **ML service updates job** → `PATCH /api/v1/ml/training-jobs/{id}/result`  
   External service posts metrics, model path, and status

4. **Store predictions** → insert into `demand_predictions` table  
   Fields: product_id, prediction_date, predicted_demand, confidence, bounds

5. **View predictions** → `GET /api/v1/ml/predictions`

6. **Restock recommendations** → insert into `restock_recommendations`  
   Viewed at `GET /api/v1/ml/restock-recommendations`

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/auth/login | Login → JWT |
| POST | /api/v1/auth/forgot-password | Send reset email |
| POST | /api/v1/auth/reset-password | Reset with token |
| GET  | /api/v1/dashboard/kpis | KPIs |
| GET  | /api/v1/products | List products |
| POST | /api/v1/products | Create product |
| POST | /api/v1/sales | Record sale |
| GET  | /api/v1/ml/datasets | List datasets |
| POST | /api/v1/ml/datasets/upload | Upload dataset |
| POST | /api/v1/ml/training-jobs | Queue training |
| GET  | /api/v1/ml/predictions | Demand predictions |

Full docs available at `/docs` (Swagger UI).
# retail-pyme-v2
