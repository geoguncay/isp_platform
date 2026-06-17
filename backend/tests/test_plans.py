import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from unittest.mock import AsyncMock

from app.core import database as db_module
from app.core.database import Base
from app.core.deps import get_db
from app.core.security import hash_password
from app.main import app
from app.models.user import User
from app.models.plan import Plan
from app.models.router import Router
from app.models.client import Client
from app.models.client_plan import ClientPlan

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
    # Agregar un técnico
    db.add(User(
        nombre="Test Tecnico",
        email="tecnico@test.com",
        hashed_password=hash_password("tecnicopass123"),
        rol="tecnico",
        activo=True,
    ))
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


def test_list_plans(client: TestClient):
    # Obtener token de técnico (cualquier usuario autenticado puede ver planes)
    login = client.post(
        "/api/auth/login",
        json={"email": "tecnico@test.com", "password": "tecnicopass123"},
    )
    token = login.json()["access_token"]

    response = client.get(
        "/api/plans", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    # Por defecto no hay planes en la BD de pruebas vacía (a menos que se hayan creado)
    assert len(response.json()) == 0


def test_create_plan_forbidden_for_tecnico(client: TestClient):
    login = client.post(
        "/api/auth/login",
        json={"email": "tecnico@test.com", "password": "tecnicopass123"},
    )
    token = login.json()["access_token"]

    response = client.post(
        "/api/plans",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "nombre": "Plan Oro 50M",
            "velocidad_down_mbps": 50,
            "velocidad_up_mbps": 25,
            "precio": 30.00,
        },
    )
    assert response.status_code == 403


def test_create_plan_success_for_admin(client: TestClient):
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@test.com", "password": "adminpass123"},
    )
    token = login.json()["access_token"]

    response = client.post(
        "/api/plans",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "nombre": "Plan Oro 50M",
            "velocidad_down_mbps": 50,
            "velocidad_up_mbps": 25,
            "precio": 30.00,
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["nombre"] == "Plan Oro 50M"
    assert data["velocidad_down_mbps"] == 50
    assert data["precio"] == 30.00


def test_update_plan(client: TestClient):
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@test.com", "password": "adminpass123"},
    )
    token = login.json()["access_token"]

    # Crear plan primero
    create_resp = client.post(
        "/api/plans",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "nombre": "Plan Oro 50M",
            "velocidad_down_mbps": 50,
            "velocidad_up_mbps": 25,
            "precio": 30.00,
        },
    )
    plan_id = create_resp.json()["id"]

    # Actualizar plan
    response = client.put(
        f"/api/plans/{plan_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "nombre": "Plan Oro 60M",
            "velocidad_down_mbps": 60,
            "precio": 35.00,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["nombre"] == "Plan Oro 60M"
    assert data["velocidad_down_mbps"] == 60
    assert data["precio"] == 35.00


def test_delete_plan_success(client: TestClient):
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@test.com", "password": "adminpass123"},
    )
    token = login.json()["access_token"]

    # Crear plan
    create_resp = client.post(
        "/api/plans",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "nombre": "Plan Temporal",
            "velocidad_down_mbps": 10,
            "velocidad_up_mbps": 5,
            "precio": 10.00,
        },
    )
    plan_id = create_resp.json()["id"]

    # Eliminar plan
    response = client.delete(
        f"/api/plans/{plan_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 204

    # Verificar que ya no existe
    get_resp = client.get(
        f"/api/plans/{plan_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert get_resp.status_code == 404
