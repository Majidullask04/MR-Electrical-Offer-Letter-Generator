from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest

API_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_ROOT))

TEST_DB = os.environ.get("OFFERLATER_TEST_DB", "offerlater_test")
ADMIN_DSN = os.environ.get(
    "OFFERLATER_TEST_ADMIN_DSN",
    "postgresql://offerlater:offerlater_dev@localhost:5433/postgres",
)
DB_HOST = os.environ.get("OFFERLATER_TEST_DB_HOST", "localhost:5433")
STORAGE = Path(tempfile.mkdtemp(prefix="offerlater-test-storage-"))

os.environ["APP_ENV"] = "test"
os.environ["SECRET_KEY"] = "test-only-secret-key-at-least-32-characters-long"
os.environ["DATABASE_URL"] = (
    f"postgresql+psycopg://offerlater:offerlater_dev@{DB_HOST}/{TEST_DB}"
)
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["EMAIL_PROVIDER"] = "console"
os.environ["STORAGE_DIR"] = str(STORAGE)
os.environ["FRONTEND_URL"] = "http://testserver"
os.environ["COOKIE_SECURE"] = "false"


def _reset_database() -> None:
    import psycopg

    with psycopg.connect(ADMIN_DSN, autocommit=True) as connection:
        connection.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = %s AND pid <> pg_backend_pid()",
            (TEST_DB,),
        )
        connection.execute(f'DROP DATABASE IF EXISTS "{TEST_DB}"')
        connection.execute(f'CREATE DATABASE "{TEST_DB}"')


def _migrate() -> None:
    from alembic import command
    from alembic.config import Config

    config = Config(str(API_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    command.upgrade(config, "head")


_reset_database()
_migrate()

from app.database import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import (  # noqa: E402
    seed_blocks,
    seed_company,
    seed_positions,
    seed_roles,
    seed_template,
    seed_users,
)

from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def seeded_database():
    with SessionLocal() as db:
        company = seed_company(db)
        roles = seed_roles(db)
        users = seed_users(db, roles)
        seed_positions(db)
        seed_blocks(db)
        template = seed_template(db, company, users["SUPER_ADMIN"])
    return {"company": company, "users": users, "template": template}


@pytest.fixture()
def client():
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


@pytest.fixture()
def db_session():
    with SessionLocal() as session:
        yield session


@pytest.fixture()
def admin_client():
    with TestClient(app, raise_server_exceptions=False) as test_client:
        response = test_client.post(
            "/api/v1/auth/login",
            json={"email": "admin@mrelectricalworks.in", "password": "OfferLater!2026"},
        )
        assert response.status_code == 200, response.text
        yield test_client


@pytest.fixture()
def hr_client():
    with TestClient(app, raise_server_exceptions=False) as test_client:
        response = test_client.post(
            "/api/v1/auth/login",
            json={"email": "hr@mrelectricalworks.in", "password": "HrManager!2026"},
        )
        assert response.status_code == 200, response.text
        yield test_client


@pytest.fixture()
def hiring_client():
    with TestClient(app, raise_server_exceptions=False) as test_client:
        response = test_client.post(
            "/api/v1/auth/login",
            json={"email": "hiring@mrelectricalworks.in", "password": "HiringManager!2026"},
        )
        assert response.status_code == 200, response.text
        yield test_client
