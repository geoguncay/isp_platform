import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from unittest.mock import ANY, AsyncMock, patch

from app.core import database as db_module
from app.core.database import Base
from app.core.deps import get_db
from app.core.security import hash_password
from app.main import app
from app.models.user import User
from app.models.router import Router
from app.models.client import Client
from app.models.plan import Plan
from app.models.client_plan import ClientPlan
from app.models.static_ip import StaticIP

engine_test = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def make_redis_mock() -> AsyncMock:
    mock = AsyncMock()
    mock.setex = AsyncMock(return_value=True)
    mock.get = AsyncMock(return_value=None)
    mock.delete = AsyncMock(return_value=True)
    return mock


@pytest.fixture(autouse=True)
def setup_db(monkeypatch):
    monkeypatch.setattr(db_module, "engine", engine_test)
    monkeypatch.setattr(db_module, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.api.auth.redis_client", make_redis_mock())

    Base.metadata.create_all(bind=engine_test)

    db = TestingSessionLocal()
    # Agregar un administrador
    db.add(User(
        nombre="Test Admin",
        email="admin@test.com",
        hashed_password=hash_password("adminpass123"),
        rol="admin",
        activo=True,
    ))
    # Agregar un router
    r = Router(
        nombre="Router Central",
        ip="10.0.0.1",
        puerto_api=8728,
        usuario_api="admin",
        password_enc="enc_pass",
        activo=True,
    )
    db.add(r)
    p = Plan(
        nombre="Plan Fibra 20M",
        velocidad_down_mbps=20,
        velocidad_up_mbps=10,
        velocidad_down_kbps=20000,
        velocidad_up_kbps=10000,
        precio=22.40,
    )
    db.add(p)
    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=engine_test)


@pytest.fixture
def client():
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@patch("app.api.clients.sync_ip_in_address_list")
@patch("app.api.clients.sync_client_queue")
def test_create_client_creates_queue(mock_sync_queue, mock_sync_ip, client: TestClient):
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@test.com", "password": "adminpass123"},
    )
    token = login.json()["access_token"]

    db = TestingSessionLocal()
    router = db.query(Router).first()
    plan = db.query(Plan).first()
    router_id = str(router.id)
    plan_id = str(plan.id)
    db.close()

    response = client.post(
        "/api/clients",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "nombre": "Juan Valdes",
            "cedula": "1724024888",
            "telefono": "0999999999",
            "direccion": "Quito",
            "router_id": router_id,
            "tipo": "static",
            "ip": "192.168.10.15",
            "plan_id": plan_id
        },
    )
    assert response.status_code == 201
    assert mock_sync_queue.call_count == 1
    mock_sync_queue.assert_called_with(
        router=ANY,
        client_name="Juan Valdes",
        ip="192.168.10.15",
        speed_up=10000,
        speed_down=20000,
        plan_name="Plan Fibra 20M",
        limit_at_up=None,
        limit_at_down=None,
        burst_threshold_up=None,
        burst_threshold_down=None,
        prioridad=8,
        parent="isp_padre"
    )


@patch("app.api.clients.sync_ip_in_address_list")
@patch("app.api.clients.sync_client_queue")
def test_assign_plan_updates_queue(mock_sync_queue, mock_sync_ip, client: TestClient):
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@test.com", "password": "adminpass123"},
    )
    token = login.json()["access_token"]

    db = TestingSessionLocal()
    router = db.query(Router).first()
    plan = db.query(Plan).first()
    
    # Crear cliente manualmente
    c = Client(
        nombre="Pepe Lucho",
        cedula="1724024888",
        telefono="0999999999",
        direccion="Quito",
        router_id=router.id,
        tipo="static",
        activo=True
    )
    db.add(c)
    db.flush()
    ip = StaticIP(cliente_id=c.id, ip="192.168.10.20", router_id=router.id)
    db.add(ip)
    db.commit()
    client_id = str(c.id)
    plan_id = str(plan.id)
    db.close()

    mock_sync_queue.reset_mock()

    response = client.post(
        f"/api/clients/{client_id}/assign-plan",
        headers={"Authorization": f"Bearer {token}"},
        params={"plan_id": plan_id}
    )
    assert response.status_code == 200
    assert mock_sync_queue.call_count == 1


@patch("app.api.clients.toggle_client_queue")
def test_toggle_client_queue_endpoint(mock_toggle_queue, client: TestClient):
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@test.com", "password": "adminpass123"},
    )
    token = login.json()["access_token"]

    db = TestingSessionLocal()
    router = db.query(Router).first()
    c = Client(
        nombre="Maria C",
        cedula="1724024888",
        telefono="0999999999",
        direccion="Quito",
        router_id=router.id,
        tipo="static",
        activo=True
    )
    db.add(c)
    db.flush()
    ip = StaticIP(cliente_id=c.id, ip="192.168.10.30", router_id=router.id)
    db.add(ip)
    db.commit()
    client_id = str(c.id)
    db.close()

    response = client.post(
        f"/api/clients/{client_id}/toggle-queue",
        headers={"Authorization": f"Bearer {token}"},
        params={"disabled": True}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    assert mock_toggle_queue.call_count == 1
    mock_toggle_queue.assert_called_with(ANY, "192.168.10.30", True)


@patch("app.api.routers_api.fetch_queues")
def test_get_router_queues_enriched(mock_fetch_queues, client: TestClient):
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@test.com", "password": "adminpass123"},
    )
    token = login.json()["access_token"]

    db = TestingSessionLocal()
    router = db.query(Router).first()
    plan = db.query(Plan).first()
    c = Client(
        nombre="Jose Ortiz",
        cedula="1724024888",
        telefono="0999999999",
        direccion="Quito",
        router_id=router.id,
        tipo="static",
        activo=True
    )
    db.add(c)
    db.flush()
    ip = StaticIP(cliente_id=c.id, ip="192.168.10.40", router_id=router.id)
    db.add(ip)
    cp = ClientPlan(cliente_id=c.id, plan_id=plan.id, estado="activo")
    db.add(cp)
    db.commit()
    router_id = str(router.id)
    client_id = str(c.id)
    db.close()

    # Mock fetch_queues returns queues from MikroTik
    mock_fetch_queues.return_value = [
        {
            "id": "*1",
            "name": "Jose Ortiz",
            "target": "192.168.10.40/32",
            "max_limit": "10M/20M",
            "rate": "12345/67890",
            "parent": "PADRE",
            "comment": "Plan Fibra 20M",
            "disabled": False
        },
        {
            "id": "*2",
            "name": "Orphan Queue",
            "target": "192.168.10.99/32",
            "max_limit": "5M/5M",
            "rate": "0/0",
            "parent": "PADRE",
            "comment": "Unknown Plan",
            "disabled": True
        }
    ]

    response = client.get(
        f"/api/routers/{router_id}/queues",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    
    # First queue should be enriched with db client data
    assert data[0]["cliente_id"] == client_id
    assert data[0]["cliente_nombre"] == "Jose Ortiz"
    assert data[0]["plan_activo"]["nombre"] == "Plan Fibra 20M"
    assert "↑ 12.3 Kbps / ↓ 67.9 Kbps" in data[0]["rate_human"]
    
    # Second queue has no db client matching IP
    assert data[1]["cliente_id"] is None
    assert data[1]["cliente_nombre"] is None
    assert data[1]["plan_activo"] is None


@patch("app.api.routers_api.get_parent_queue_limit")
def test_get_parent_queue(mock_get_limit, client: TestClient):
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@test.com", "password": "adminpass123"},
    )
    token = login.json()["access_token"]

    db = TestingSessionLocal()
    router = db.query(Router).first()
    router_id = str(router.id)
    db.close()

    mock_get_limit.return_value = {"name": "PADRE", "limit_up": 50, "limit_down": 100}

    response = client.get(
        f"/api/routers/{router_id}/parent-queue",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "PADRE"
    assert data["limit_up"] == 50
    assert data["limit_down"] == 100
    mock_get_limit.assert_called_once()


@patch("app.api.routers_api.update_parent_queue_limit")
def test_set_parent_queue_limit(mock_update_limit, client: TestClient):
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@test.com", "password": "adminpass123"},
    )
    token = login.json()["access_token"]

    db = TestingSessionLocal()
    router = db.query(Router).first()
    router_id = str(router.id)
    db.close()

    response = client.post(
        f"/api/routers/{router_id}/parent-queue",
        headers={"Authorization": f"Bearer {token}"},
        params={"limit_up_mbps": 50, "limit_down_mbps": 100}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    mock_update_limit.assert_called_once_with(ANY, 50, 100)
