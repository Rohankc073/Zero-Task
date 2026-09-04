import pytest
from datetime import timedelta
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
)


def test_password_hashing_and_verification():
    plain = "SecurePassword123!"
    hashed = get_password_hash(plain)

    assert hashed != plain
    assert verify_password(plain, hashed) is True
    assert verify_password("WrongPassword", hashed) is False
    assert verify_password("", hashed) is False


def test_supabase_bcrypt_compatibility():
    # Example $2a$ format hash standard in Supabase Auth
    # password is 'password123'
    supabase_hash = "$2a$10$7BKioIBZJXeNI93il7nzf.dnoqJ4l266CQZUSFkK5NL0R5VSTLBXu"
    assert verify_password("password123", supabase_hash) is True
    assert verify_password("wrongpassword", supabase_hash) is False


def test_jwt_access_token_lifecycle():
    user_id = "11111111-2222-3333-4444-555555555555"
    claims = {"role": "Founder", "company_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}

    token = create_access_token(subject=user_id, claims=claims)
    payload = decode_token(token)

    assert payload is not None
    assert payload["sub"] == user_id
    assert payload["role"] == "Founder"
    assert payload["type"] == "access"
    assert "exp" in payload


def test_jwt_expired_token_rejected():
    user_id = "11111111-2222-3333-4444-555555555555"
    token = create_access_token(subject=user_id, expires_delta=timedelta(seconds=-10))
    payload = decode_token(token)
    assert payload is None


def test_refresh_token_generation():
    user_id = "11111111-2222-3333-4444-555555555555"
    token = create_refresh_token(subject=user_id)
    payload = decode_token(token)

    assert payload is not None
    assert payload["sub"] == user_id
    assert payload["type"] == "refresh"
    assert "jti" in payload
