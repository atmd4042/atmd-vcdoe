"""End-to-end backend tests for the Aetamd (اعتمد) e-services app.

Covers: auth (register/login OTP), categories/services catalog, request creation,
provider approval + accept/complete flow, chat, notifications, admin notes,
admin discounts (with request price reflect), admin suspend, delete request.
"""
import os
import time
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") \
    else "https://provider-client-app-1.preview.emergentagent.com"
API = f"{BASE}/api"

ADMIN_EMAIL = "atmd4042@gmail.com"
ADMIN_PASSWORD = "Dheefallh123@"
STRONG = "Passw0rd@1"


def _get_otp(email, purpose=None):
    r = requests.get(f"{API}/auth/test-otp", params={"email": email}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"identifier": email, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    otp = _get_otp(email)["otp"]
    r2 = requests.post(f"{API}/auth/verify-login", json={"challenge_id": data["challenge_id"], "otp": otp}, timeout=15)
    assert r2.status_code == 200, r2.text
    j = r2.json()
    return j["access_token"], j["user"]


def _register_customer(email, phone, name="Test"):
    r = requests.post(f"{API}/auth/register",
                      json={"name": name, "email": email, "phone": phone, "password": STRONG}, timeout=15)
    assert r.status_code == 200, r.text
    cid = r.json()["challenge_id"]
    # auto-fill via otp-by-challenge
    r2 = requests.get(f"{API}/auth/otp-by-challenge/{cid}", timeout=15)
    assert r2.status_code == 200
    otp = r2.json()["otp"]
    v = requests.post(f"{API}/auth/verify-registration", json={"challenge_id": cid, "otp": otp}, timeout=15)
    assert v.status_code == 200, v.text
    j = v.json()
    return j["access_token"], j["user"]


# ------------------- health & catalog -------------------
def test_health_root():
    r = requests.get(f"{API}/", timeout=10)
    assert r.status_code == 200
    assert r.json().get("ok") is True


def test_categories_are_9_arabic():
    r = requests.get(f"{API}/categories", timeout=10)
    assert r.status_code == 200
    cats = r.json()
    names = [c["name"] for c in cats]
    assert len(cats) == 9, f"expected 9 categories, got {len(cats)}: {names}"
    for n in ["خدمات منصة ناجز", "خدمات الدعم والقروض", "خدمات البلدية"]:
        assert n in names


def test_services_all_and_featured():
    r = requests.get(f"{API}/services", params={"category": "all"}, timeout=15)
    assert r.status_code == 200
    all_svcs = r.json()
    assert len(all_svcs) >= 80, f"expected 80+ services, got {len(all_svcs)}"
    # featured
    r2 = requests.get(f"{API}/services", params={"category": "featured"}, timeout=15)
    assert r2.status_code == 200
    feat = r2.json()
    assert len(feat) > 0
    for s in feat:
        assert s.get("featured") is True


@pytest.mark.parametrize("name", ["حساب المواطن", "حافز", "التسجيل في قياس"])
def test_service_detail_has_requirements(name):
    all_svcs = requests.get(f"{API}/services", params={"category": "all"}, timeout=15).json()
    match = next((s for s in all_svcs if s["name"] == name), None)
    assert match, f"service {name} not found in catalog"
    d = requests.get(f"{API}/services/{match['id']}", timeout=10)
    assert d.status_code == 200
    body = d.json()
    assert body.get("requirements"), f"service {name} missing requirements text"
    assert len(body["requirements"]) > 20


# ------------------- auth -------------------
def test_admin_login_via_otp():
    tok, user = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert user["role"] == "admin"
    assert tok


def test_customer_registration_flow():
    ts = int(time.time())
    email = f"x_{ts}@example.com"
    phone = f"05000{ts % 100000:05d}"
    tok, user = _register_customer(email, phone, name="عميل تجريبي")
    assert user["role"] == "customer"
    assert user["verified"] is True
    # /auth/me
    me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=10)
    assert me.status_code == 200
    assert me.json()["email"] == email


def test_phone_max_two_accounts():
    ts = int(time.time())
    phone = f"05009{ts % 100000:05d}"
    _register_customer(f"p1_{ts}@example.com", phone)
    _register_customer(f"p2_{ts}@example.com", phone)
    r = requests.post(f"{API}/auth/register",
                      json={"name": "x", "email": f"p3_{ts}@example.com",
                            "phone": phone, "password": STRONG}, timeout=15)
    assert r.status_code == 409


def test_password_policy_rejects_weak():
    r = requests.post(f"{API}/auth/register",
                      json={"name": "x", "email": f"weak_{int(time.time())}@e.com",
                            "phone": f"05008{int(time.time()) % 100000:05d}", "password": "abc"}, timeout=10)
    assert r.status_code == 400


# ------------------- provider approval flow -------------------
@pytest.fixture(scope="module")
def provider_and_admin():
    ts = int(time.time())
    p_email = f"prov_{ts}@example.com"
    p_phone = f"05010{ts % 100000:05d}"
    r = requests.post(f"{API}/auth/register-provider", json={
        "office_name": "مكتب اختبار", "email": p_email, "phone": p_phone,
        "password": STRONG, "documents": [], "activity_image": None,
    }, timeout=15)
    assert r.status_code == 200, r.text
    cid = r.json()["challenge_id"]
    otp = requests.get(f"{API}/auth/otp-by-challenge/{cid}").json()["otp"]
    v = requests.post(f"{API}/auth/verify-registration", json={"challenge_id": cid, "otp": otp}, timeout=15)
    assert v.status_code == 200
    assert v.json().get("pending_approval") is True

    # provider cannot login
    lr = requests.post(f"{API}/auth/login", json={"identifier": p_email, "password": STRONG}, timeout=10)
    assert lr.status_code == 403

    # admin approves
    admin_tok, _ = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    ph = {"Authorization": f"Bearer {admin_tok}"}
    provs = requests.get(f"{API}/admin/providers", headers=ph).json()
    pv = next(x for x in provs if x["email"] == p_email)
    ap = requests.post(f"{API}/admin/providers/{pv['id']}/approval", json={"approved": True}, headers=ph)
    assert ap.status_code == 200

    p_tok, p_user = _login(p_email, STRONG)
    assert p_user["role"] == "service_provider"
    return {"admin_tok": admin_tok, "prov_tok": p_tok, "prov": p_user, "prov_email": p_email}


def test_provider_approval_and_login(provider_and_admin):
    assert provider_and_admin["prov_tok"]


# ------------------- end-to-end: request + chat + notifications + discount + suspend -------------------
@pytest.fixture(scope="module")
def full_flow(provider_and_admin):
    ts = int(time.time())
    c_email = f"cust_{ts}@example.com"
    c_phone = f"05011{ts % 100000:05d}"
    c_tok, c_user = _register_customer(c_email, c_phone, name="Test Customer")

    admin_h = {"Authorization": f"Bearer {provider_and_admin['admin_tok']}"}

    # admin creates a targeted discount for this customer (audience=user by email)
    d = requests.post(f"{API}/admin/discounts", json={
        "title": "ترحيب", "percent": 25, "audience": "user", "target_user_id": c_email,
    }, headers=admin_h)
    assert d.status_code == 200, d.text
    discount_id = d.json()["id"]

    # verify /my-discount reflects this
    md = requests.get(f"{API}/my-discount", headers={"Authorization": f"Bearer {c_tok}"})
    assert md.status_code == 200
    disc = md.json()["discount"]
    assert disc and disc["percent"] == 25

    # pick a service with a known price >0 (fallback: any non-zero)
    all_svcs = requests.get(f"{API}/services", params={"category": "all"}).json()
    priced = next((s for s in all_svcs if s.get("price", 0) > 0), None) or all_svcs[0]
    # if all prices are 0 (real catalog), force one via admin update to test discount math
    if priced.get("price", 0) == 0:
        upd = requests.put(f"{API}/admin/services/{priced['id']}", json={
            "name": priced["name"], "category": priced["category"], "price": 100.0,
            "image": priced.get("image"), "description": priced.get("description", ""),
            "requirements": priced.get("requirements", ""), "featured": bool(priced.get("featured")),
            "requires_provider_type": True,
        }, headers=admin_h)
        assert upd.status_code == 200
        priced = requests.get(f"{API}/services/{priced['id']}").json()

    # customer creates request
    cr = requests.post(f"{API}/requests", json={
        "service_id": priced["id"], "applicant_type": "resident", "notes": "test",
    }, headers={"Authorization": f"Bearer {c_tok}"})
    assert cr.status_code == 200, cr.text
    req = cr.json()
    assert req["status"] == "pending"
    assert req["discount_percent"] == 25
    assert round(req["price"], 2) == round(priced["price"] * 0.75, 2)

    # provider notification exists
    p_h = {"Authorization": f"Bearer {provider_and_admin['prov_tok']}"}
    notifs = requests.get(f"{API}/notifications", headers=p_h).json()
    assert any(n["type"] == "request" and n["ref_id"] == req["id"] for n in notifs)

    # provider lists + accepts
    listed = requests.get(f"{API}/provider/requests", headers=p_h).json()
    assert any(r["id"] == req["id"] for r in listed)
    acc = requests.post(f"{API}/provider/requests/{req['id']}/status",
                        json={"status": "in_progress"}, headers=p_h)
    assert acc.status_code == 200
    updated = acc.json()
    assert updated["status"] == "in_progress"
    assert updated["assigned_provider_id"] == provider_and_admin["prov"]["id"]
    # customer info visible
    assert updated["customer_email"] == c_email

    # chat: provider sends
    m1 = requests.post(f"{API}/requests/{req['id']}/messages",
                       json={"text": "أهلاً"}, headers=p_h)
    assert m1.status_code == 200
    # customer receives notification
    c_h = {"Authorization": f"Bearer {c_tok}"}
    c_notifs = requests.get(f"{API}/notifications", headers=c_h).json()
    assert any(n["type"] == "message" and n["ref_id"] == req["id"] for n in c_notifs)

    # customer replies
    m2 = requests.post(f"{API}/requests/{req['id']}/messages",
                       json={"text": "شكراً"}, headers=c_h)
    assert m2.status_code == 200

    # admin can view all chats
    msgs = requests.get(f"{API}/requests/{req['id']}/messages", headers=admin_h).json()
    assert len(msgs) >= 2

    # unread-count + read-all
    uc = requests.get(f"{API}/notifications/unread-count", headers=c_h).json()
    assert uc["count"] >= 1
    requests.post(f"{API}/notifications/read-all", headers=c_h)
    uc2 = requests.get(f"{API}/notifications/unread-count", headers=c_h).json()
    assert uc2["count"] == 0

    return {
        "c_tok": c_tok, "c_email": c_email, "c_user": c_user,
        "req_id": req["id"], "admin_h": admin_h, "p_h": p_h,
        "prov_id": provider_and_admin["prov"]["id"],
        "discount_id": discount_id,
    }


def test_full_flow_runs(full_flow):
    assert full_flow["req_id"]


def test_admin_note_targeted_by_email(full_flow):
    n = requests.post(f"{API}/admin/notes", json={
        "title": "إعلان خاص", "body": "لك فقط", "audience": "user",
        "target_user_id": full_flow["c_email"],
    }, headers=full_flow["admin_h"])
    assert n.status_code == 200
    notes = requests.get(f"{API}/notes", headers={"Authorization": f"Bearer {full_flow['c_tok']}"}).json()
    assert any(x["title"] == "إعلان خاص" for x in notes)


def test_suspend_blocks_provider_chat(full_flow):
    # admin suspends provider
    s = requests.post(f"{API}/admin/providers/{full_flow['prov_id']}/suspend",
                      json={"suspended": True}, headers=full_flow["admin_h"])
    assert s.status_code == 200
    # provider chat now blocked
    r = requests.post(f"{API}/requests/{full_flow['req_id']}/messages",
                      json={"text": "test"}, headers=full_flow["p_h"])
    assert r.status_code == 403
    # provider status update also blocked
    r2 = requests.post(f"{API}/provider/requests/{full_flow['req_id']}/status",
                       json={"status": "completed"}, headers=full_flow["p_h"])
    assert r2.status_code == 403
    # unsuspend
    requests.post(f"{API}/admin/providers/{full_flow['prov_id']}/suspend",
                  json={"suspended": False}, headers=full_flow["admin_h"])


def test_admin_delete_request(full_flow):
    r = requests.delete(f"{API}/admin/requests/{full_flow['req_id']}", headers=full_flow["admin_h"])
    assert r.status_code == 200
    # verify gone from customer's list
    mine = requests.get(f"{API}/requests/mine",
                        headers={"Authorization": f"Bearer {full_flow['c_tok']}"}).json()
    assert not any(x["id"] == full_flow["req_id"] for x in mine)
