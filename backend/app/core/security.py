"""
Utilidades de seguridad: hash de contraseñas, JWT y cifrado Fernet.
Nota: usa bcrypt directamente (>=4.0) en lugar de passlib para compatibilidad
con bcrypt 5.x que eliminó `__about__.__version__` y cambió límites internos.
"""
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from cryptography.fernet import Fernet
from jose import JWTError, jwt

from app.core.config import settings

# ── Hashing de contraseñas ────────────────────────────────────────────────────
_BCRYPT_ROUNDS = 12


def hash_password(plain: str) -> str:
    """Hashea la contraseña con bcrypt (cost factor 12)."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verifica una contraseña contra su hash bcrypt."""
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


# ── JWT ───────────────────────────────────────────────────────────────────────
def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return jwt.encode(
        {"sub": user_id, "exp": expire, "type": "refresh"},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def decode_token(token: str) -> dict[str, Any]:
    """Decodifica y valida un JWT. Lanza JWTError si es inválido."""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


# ── Fernet (credenciales de routers) ─────────────────────────────────────────
_fernet = Fernet(settings.FERNET_KEY.encode())


def encrypt_secret(plain_text: str) -> str:
    """Cifra con Fernet; devuelve string base64."""
    return _fernet.encrypt(plain_text.encode()).decode()


def decrypt_secret(encrypted: str) -> str:
    """Descifra un valor Fernet cifrado."""
    return _fernet.decrypt(encrypted.encode()).decode()
