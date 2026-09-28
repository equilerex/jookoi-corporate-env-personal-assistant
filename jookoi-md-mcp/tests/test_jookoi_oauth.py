"""The OAuth flow ChatGPT uses, end to end against our auth setup.

ChatGPT rejects an authorization response without the RFC 9207 `iss`
parameter ("OAuth response is missing the expected issuer"). FastMCP 3.x
omitted it; a deploy that downgraded to 3.4.7 broke ChatGPT logins on
25-09-2026. These tests run in the image before every deploy restarts it.
The flow ends with a deny, which goes through the same client-redirect code
as an approve without needing a real GitHub round trip."""

from __future__ import annotations

import base64
import hashlib
import re
from urllib.parse import parse_qs, urlparse

import pytest
from starlette.testclient import TestClient

BASE = "https://vault.example.com"
REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect"


@pytest.fixture
def oauth_client(tmp_path, monkeypatch):
    monkeypatch.setenv("API_KEY", "test-key")
    monkeypatch.setenv("OAUTH_GITHUB_CLIENT_ID", "dummy-id")
    monkeypatch.setenv("OAUTH_GITHUB_CLIENT_SECRET", "dummy-secret")
    monkeypatch.setenv("OAUTH_GITHUB_ALLOWED_LOGINS", "octocat")
    monkeypatch.setenv("PUBLIC_BASE_URL", BASE)
    monkeypatch.setenv("FASTMCP_HOME", str(tmp_path / "fastmcp"))
    from fastmcp import FastMCP

    from jookoi_md_mcp.server import _build_auth

    app = FastMCP("oauth-test", auth=_build_auth()).http_app()
    with TestClient(app, base_url=BASE, follow_redirects=False) as client:
        yield client


def test_metadata_advertises_issuer_parameter(oauth_client):
    meta = oauth_client.get("/.well-known/oauth-authorization-server").json()
    assert meta["issuer"].rstrip("/") == BASE
    assert meta.get("authorization_response_iss_parameter_supported") is True


def test_client_redirect_carries_issuer(oauth_client):
    reg = oauth_client.post("/register", json={
        "client_name": "ChatGPT",
        "redirect_uris": [REDIRECT],
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
    })
    assert reg.status_code in (200, 201), reg.text
    client_id = reg.json()["client_id"]

    verifier = "v" * 64
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    auth = oauth_client.get("/authorize", params={
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": REDIRECT,
        "state": "chatgpt-state",
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    })
    assert auth.status_code in (302, 303, 307), auth.text
    consent_url = auth.headers["location"]
    assert "/consent" in consent_url, consent_url

    page = oauth_client.get(consent_url)
    assert page.status_code == 200
    fields = dict(re.findall(r'name="(txn_id|csrf_token)" value="([^"]+)"', page.text))
    assert set(fields) == {"txn_id", "csrf_token"}

    denied = oauth_client.post("/consent", params={"txn_id": fields["txn_id"]}, data={**fields, "action": "deny"})
    assert denied.status_code in (302, 303, 307), denied.text
    back = urlparse(denied.headers["location"])
    assert f"{back.scheme}://{back.netloc}{back.path}" == REDIRECT
    query = parse_qs(back.query)
    assert query["error"] == ["access_denied"]
    assert query["state"] == ["chatgpt-state"]
    assert [i.rstrip("/") for i in query.get("iss", [])] == [BASE], "missing RFC 9207 iss: ChatGPT will reject this login"
