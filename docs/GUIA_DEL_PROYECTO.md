# Guía del Proyecto ISP Platform

## Resumen

ISP Platform es una plataforma para la gestión centralizada de ISPs/WISPs. El proyecto combina una API en FastAPI, un panel web en React y servicios auxiliares para PostgreSQL, Redis y tareas en segundo plano con Celery.

La solución está orientada a operar con routers MikroTik, gestionar clientes, planes, usuarios, compañías, tráfico y flujos de suspensión/reactivación.

## Arquitectura General

El repositorio está organizado como monorepo:

- Backend: API, modelos, esquemas, servicios e integración con MikroTik.
- Frontend: panel administrativo web.
- Infraestructura: Docker Compose, Nginx y recursos de arquitectura.

Los componentes principales se comunican así:

- El frontend consume la API HTTP del backend.
- El backend persiste datos en PostgreSQL.
- Redis se usa para refresh tokens, sesiones y colas/tareas.
- Celery ejecuta procesos asíncronos como health checks, tráfico y suspensiones.

## Stack Tecnológico

### Backend

- Python 3.12+
- FastAPI
- SQLAlchemy
- Alembic
- PostgreSQL 16
- Redis 7
- Celery
- librouteros para comunicación con MikroTik

### Frontend

- React 19
- Vite
- TypeScript
- React Router
- TanStack Query
- Zustand
- Tailwind CSS
- Recharts
- React Hook Form y Zod

## Módulos Principales del Backend

### `app.main`

Punto de entrada de FastAPI. Monta el lifespan, CORS y registra los routers principales.

### Routers de API

- `auth`: login, refresh, logout, perfil actual y setup inicial del administrador.
- `users`: gestión de usuarios y estadísticas.
- `company`: datos de la compañía.
- `routers`: alta, edición, test de conexión, estado, queues e importación de clientes.
- `clients`: CRUD de clientes, asignación de planes, sincronización con router, suspensión, pagos, tickets y tráfico.
- `plans`: CRUD de planes.
- `traffic`: WebSocket y consulta de historial por cliente.

### Servicios

- `services/mikrotik`: utilidades para colas, address lists, pools y health checks.
- `services/notifications`: integraciones de notificación.

### Workers

- `workers/health_check.py`
- `workers/traffic.py`
- `workers/suspension.py`
- `workers/celery_app.py`

## Pantallas del Frontend

La aplicación web incluye estas vistas principales:

- Login
- Dashboard
- Routers
- Detalle de router
- Clients
- Detalle de cliente
- Plans
- Profile

También existen rutas preparadas para futuras fases:

- Users
- Alerts

## Flujo Funcional Principal

1. El usuario inicia sesión en el panel web.
2. El frontend obtiene tokens y consulta el perfil autenticado.
3. Se administra la compañía, usuarios, routers, clientes y planes desde la API.
4. Los cambios sobre clientes pueden sincronizarse con MikroTik.
5. Los procesos de fondo actualizan tráfico, health checks y eventos de suspensión.

## Variables de Entorno

El archivo base es [.env.example](../.env.example).

Variables clave:

- `ENVIRONMENT`: `development` o `production`
- `DATABASE_URL`: conexión a PostgreSQL
- `REDIS_URL`: conexión a Redis
- `SECRET_KEY`: firma de JWT
- `FERNET_KEY`: cifrado de credenciales de routers
- `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`, `ADMIN_SEED_NOMBRE`
- `ADMIN_SEED_KEY`: clave para `POST /api/auth/setup`
- `ALLOWED_ORIGINS`: orígenes permitidos para CORS

## Arranque Rápido

### Con Docker Compose

1. Copia el archivo de ejemplo:

   ```bash
   cp .env.example .env
   ```

2. Levanta los servicios:

   ```bash
   docker compose up --build
   ```

Servicios expuestos por defecto:

- API: `http://localhost:8000`
- Frontend: `http://localhost:5173`
- Adminer: `http://localhost:8080`

### Sin Docker

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:lifespan_app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Pruebas

El backend incluye pruebas con Pytest.

```bash
cd backend
pip install -r requirements-test.txt
DATABASE_URL="sqlite:///:memory:" REDIS_URL="redis://localhost:6379/0" SECRET_KEY="testkey123456789testkey123456789xx" FERNET_KEY="wlphuDlhKvtsvUg8lnnjWzNKJSP1dDzCZuYMFdhLcJg=" ENVIRONMENT=development python3 -m pytest tests/
```

## Estructura del Proyecto

- `backend/`: API, modelos, esquemas, servicios y workers.
- `frontend/`: panel web.
- `architecture/`: diagramas SVG.
- `nginx/`: configuración de proxy inverso.
- `docker-compose.yml`: orquestación local.

## Observaciones de Diseño

- El backend crea tablas y ejecuta seed solo en modo desarrollo.
- El endpoint `POST /api/auth/setup` permite crear el primer administrador si se dispone de `ADMIN_SEED_KEY`.
- El proyecto ya contempla integraciones futuras para notificaciones y facturación.
