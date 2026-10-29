"""Login checks. The browser sends the Supabase login token; we ask Supabase who it belongs to."""
import base64
import json
from functools import wraps

import requests
from flask import current_app, g, jsonify, request

import db


class AuthServiceUnavailable(Exception):
    """Supabase Auth could not be reached or did not return a usable response."""


def _bearer():
    header = request.headers.get("Authorization", "")
    return header[7:] if header.startswith("Bearer ") else None


def _aal(token):
    """Read the 'aal' claim (aal2 means the user also passed 2FA). Supabase already
    validated the token, so we only read it here; we never trust an unchecked token."""
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload)).get("aal", "aal1")
    except Exception:
        return "aal1"


def verify_token(token):
    """Returns the Supabase user dict, or None if the token is missing, expired or fake."""
    cfg = current_app.config
    try:
        r = requests.get(
            f"{cfg['SUPABASE_URL']}/auth/v1/user",
            headers={"apikey": cfg["SUPABASE_ANON_KEY"], "Authorization": f"Bearer {token}"},
            timeout=8,
        )
    except requests.RequestException as exc:
        current_app.logger.warning("Supabase Auth request failed: %s", exc)
        raise AuthServiceUnavailable from exc
    if r.status_code in (401, 403):
        return None
    if r.status_code != 200:
        current_app.logger.warning("Supabase Auth returned HTTP %s", r.status_code)
        raise AuthServiceUnavailable
    try:
        return r.json()
    except ValueError as exc:
        current_app.logger.warning("Supabase Auth returned invalid JSON")
        raise AuthServiceUnavailable from exc


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        token = _bearer()
        if not token:
            return jsonify(error="Missing login token"), 401
        try:
            user = verify_token(token)
        except AuthServiceUnavailable:
            return jsonify(error="Login verification is temporarily unavailable. Check the backend connection to Supabase and try again."), 503
        if not user:
            return jsonify(error="Your login is invalid or expired. Please sign in again."), 401
        aal = _aal(token)
        if current_app.config["REQUIRE_2FA"] and aal != "aal2":
            return jsonify(error="Two-factor verification required"), 403
        g.user = {"id": user["id"], "email": user.get("email"), "aal": aal}
        g.role = db.get_role(user["id"])
        return f(*args, **kwargs)

    return wrapper


def admin_required(f):
    @wraps(f)
    @login_required
    def wrapper(*args, **kwargs):
        if g.role != "admin":
            return jsonify(error="Admins only"), 403
        return f(*args, **kwargs)

    return wrapper
