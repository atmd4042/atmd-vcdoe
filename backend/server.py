import os
import re
import uuid
import hashlib
import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import jwt
import stripe
from bson import ObjectId  # noqa: F401  (kept for parity, ids are uuid strings)
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Request, Response, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pydantic import BaseModel, Field, EmailStr
from pathlib import Path

from email_service import send_otp_email, send_email
from storage_service import put_object, get_object, init_storage, APP_NAME

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

pwd = CryptContext(schemes=["bcrypt"], bcrypt__rounds=12)
bearer = HTTPBearer(auto_error=False)
ALG = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_EXPIRE_MIN = int(os.environ.get("JWT_EXPIRE_MIN", "1440"))

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or None
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET") or ""

app = FastAPI()
api = APIRouter(prefix="/api")


# ----------------------------- helpers -----------------------------
def now():
    return datetime.now(timezone.utc)


def new_id():
    return str(uuid.uuid4())


def code_hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def norm_identifier(s: str) -> str:
    s = (s or "").strip()
    return s.lower() if "@" in s else re.sub(r"[^0-9+]", "", s)


def check_password_policy(v: str):
    if len(v) < 8 or not re.search(r"[A-Z]", v) or not re.search(r"[a-z]", v) or not re.search(r"[^A-Za-z0-9]", v):
        raise HTTPException(400, "كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي حرف كبير وصغير ورمز")
    return v


def clean(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


def make_token(user: dict) -> str:
    exp = now() + timedelta(minutes=JWT_EXPIRE_MIN)
    return jwt.encode({"sub": user["id"], "role": user["role"], "exp": exp}, JWT_SECRET, algorithm=ALG)


async def issue_otp(user_id: str, email: str, purpose: str):
    code = f"{secrets.randbelow(1_000_000):06d}"
    cid = new_id()
    doc = {
        "id": cid, "user_id": user_id, "email": email, "purpose": purpose,
        "code_hash": code_hash(code), "code_plain": code, "attempts": 0,
        "expires_at": now() + timedelta(minutes=10), "created_at": now(),
    }
    await db.auth_challenges.insert_one(doc)
    try:
        await send_otp_email(email, code, purpose)
    except Exception as e:
        logger.error(f"OTP email failed: {e}")
    return cid


async def ensure_can_register(email: str, phone: str):
    if await db.users.find_one({"email": email, "deleted_at": None}):
        raise HTTPException(409, "البريد الإلكتروني مستخدم بالفعل")
    cnt = await db.users.count_documents({"phone": phone, "deleted_at": None})
    if cnt >= 2:
        raise HTTPException(409, "رقم الهاتف مستخدم بالحد الأقصى (مرتين)")


def audience_matches(user: dict, audience: str, target_user_id: Optional[str]) -> bool:
    if audience == "all":
        return True
    if audience == "customers":
        return user["role"] == "customer"
    if audience == "providers":
        return user["role"] == "service_provider"
    if audience == "user":
        return user["id"] == target_user_id
    return False


async def notify(user_id: str, title: str, body: str, ntype: str, ref_id: Optional[str] = None):
    await db.notifications.insert_one({
        "id": new_id(), "user_id": user_id, "title": title, "body": body,
        "type": ntype, "ref_id": ref_id, "read": False, "created_at": now(),
    })


async def applicable_discount(user: dict):
    ds = await db.discounts.find({"active": True, "deleted_at": None}, {"_id": 0}).to_list(200)
    best = None
    for d in ds:
        if audience_matches(user, d["audience"], d.get("target_user_id")):
            if not best or d["percent"] > best["percent"]:
                best = d
    return best


# ----------------------------- auth deps -----------------------------
async def current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> dict:
    if not creds:
        raise HTTPException(401, "غير مصرح")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[ALG])
    except Exception:
        raise HTTPException(401, "جلسة غير صالحة")
    user = await db.users.find_one({"id": payload["sub"], "deleted_at": None})
    if not user:
        raise HTTPException(401, "المستخدم غير موجود")
    return clean(user)


def require(*roles):
    async def dep(user=Depends(current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "ليس لديك صلاحية")
        return user
    return dep


# ----------------------------- models -----------------------------
class RegisterCustomer(BaseModel):
    name: str
    email: EmailStr
    phone: str
    password: str


class RegisterProvider(BaseModel):
    office_name: str
    email: EmailStr
    phone: str
    password: str
    documents: List[str] = []          # storage paths of uploaded docs
    activity_image: Optional[str] = None


class VerifyOtp(BaseModel):
    challenge_id: str
    otp: str


class LoginIn(BaseModel):
    identifier: str
    password: str


class ServiceIn(BaseModel):
    name: str
    category: str
    price: float
    image: Optional[str] = None
    description: Optional[str] = ""
    requirements: Optional[str] = ""
    featured: bool = False
    requires_provider_type: bool = True


class CategoryIn(BaseModel):
    name: str
    icon: Optional[str] = "grid-outline"


class RequestIn(BaseModel):
    service_id: str
    applicant_type: str            # visitor / resident / citizen / gulf_id
    notes: Optional[str] = ""


class RequestStatusIn(BaseModel):
    status: str                     # in_progress / completed / rejected


class ApprovalIn(BaseModel):
    approved: bool


class SuspendIn(BaseModel):
    suspended: bool


class MessageIn(BaseModel):
    text: str


class NoteIn(BaseModel):
    title: str
    body: str
    audience: str  # customers | providers | all | user
    target_user_id: Optional[str] = None


class DiscountIn(BaseModel):
    title: str
    percent: float
    audience: str
    target_user_id: Optional[str] = None


class ProfileIn(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    bio: Optional[str] = None


class SettingsIn(BaseModel):
    about: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    contact_whatsapp: Optional[str] = None


class TopupIn(BaseModel):
    amount: float                   # in SAR


class SubscribeIn(BaseModel):
    plan_id: str


# ----------------------------- startup -----------------------------
SUBSCRIPTION_PLANS = [
    {"id": "basic", "name": "الباقة الأساسية", "price": 29.0, "period": "شهرياً",
     "features": ["الوصول لجميع الخدمات", "دعم عبر البريد", "طلبات غير محدودة"]},
    {"id": "premium", "name": "الباقة المميزة", "price": 79.0, "period": "شهرياً",
     "features": ["كل مزايا الأساسية", "أولوية في التنفيذ", "دعم مباشر واتساب", "خصومات على الخدمات"]},
]


@app.on_event("startup")
async def startup():
    await db.users.create_index("id", unique=True)
    await db.auth_challenges.create_index("expires_at", expireAfterSeconds=0)
    await init_storage()
    # seed admin
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": new_id(), "name": "الإدارة", "email": admin_email,
            "phone": norm_identifier(os.environ["ADMIN_PHONE"]),
            "password_hash": pwd.hash(os.environ["ADMIN_PASSWORD"]),
            "role": "admin", "verified": True, "approved": True,
            "wallet_balance": 0.0, "bio": "", "subscription": None,
            "created_at": now(), "deleted_at": None,
        })
        logger.info("Admin seeded")
    # seed settings
    if not await db.settings.find_one({"id": "app"}):
        await db.settings.insert_one({
            "id": "app",
            "about": "تطبيق اعتمد يقدم جميع الخدمات الإلكترونية الحكومية والتجارية في مكان واحد، بسهولة وأمان.",
            "contact_phone": os.environ.get("CONTACT_PHONE", ""),
            "contact_email": os.environ.get("CONTACT_EMAIL", ""),
            "contact_whatsapp": os.environ.get("CONTACT_WHATSAPP", ""),
        })
    # seed categories + services if empty
    if await db.categories.count_documents({}) == 0:
        cats = [
            {"id": new_id(), "name": "تأشيرات", "icon": "airplane-outline"},
            {"id": new_id(), "name": "إقامات", "icon": "card-outline"},
            {"id": new_id(), "name": "مرور", "icon": "car-outline"},
            {"id": new_id(), "name": "أحوال مدنية", "icon": "people-outline"},
            {"id": new_id(), "name": "خدمات تجارية", "icon": "briefcase-outline"},
        ]
        await db.categories.insert_many(cats)
        demo = [
            ("تمديد تأشيرة زيارة", "تأشيرات", 150.0),
            ("إصدار تأشيرة خروج وعودة", "تأشيرات", 100.0),
            ("تجديد إقامة", "إقامات", 200.0),
            ("نقل كفالة", "إقامات", 350.0),
            ("تجديد رخصة قيادة", "مرور", 120.0),
            ("سداد مخالفات مرورية", "مرور", 50.0),
            ("إصدار شهادة ميلاد", "أحوال مدنية", 80.0),
            ("تسجيل سجل تجاري", "خدمات تجارية", 400.0),
        ]
        await db.services.insert_many([{
            "id": new_id(), "name": n, "category": c, "price": p,
            "image": None, "description": "خدمة إلكترونية سريعة وموثوقة.",
            "requires_provider_type": True, "created_at": now(), "deleted_at": None,
        } for n, c, p in demo])

    # ---- comprehensive catalog (idempotent v2) ----
    if not await db.settings.find_one({"id": "catalog_v2"}):
        cat_defs = [
            ("تأشيرات", "airplane-outline"), ("إقامات", "card-outline"),
            ("جوازات", "documents-outline"), ("مرور", "car-outline"),
            ("أحوال مدنية", "people-outline"), ("خدمات تجارية", "briefcase-outline"),
            ("خدمات العمل", "construct-outline"), ("خدمات صحية", "medkit-outline"),
            ("خدمات تعليمية", "school-outline"), ("خدمات عقارية", "home-outline"),
        ]
        for cn, ci in cat_defs:
            if not await db.categories.find_one({"name": cn}):
                await db.categories.insert_one({"id": new_id(), "name": cn, "icon": ci})
        catalog = [
            ("تمديد تأشيرة زيارة", "تأشيرات", 150.0, "تمديد مدة تأشيرة الزيارة للزائرين داخل المملكة."),
            ("إصدار تأشيرة خروج وعودة", "تأشيرات", 100.0, "إصدار تأشيرة خروج وعودة للمقيمين."),
            ("إصدار تأشيرة خروج نهائي", "تأشيرات", 90.0, "إصدار تأشيرة الخروج النهائي للمقيم."),
            ("تأشيرة زيارة عائلية", "تأشيرات", 220.0, "استقدام تأشيرة زيارة عائلية."),
            ("تمديد تأشيرة خروج وعودة", "تأشيرات", 120.0, "تمديد صلاحية تأشيرة خروج وعودة."),
            ("تجديد إقامة", "إقامات", 200.0, "تجديد رخصة الإقامة للمقيمين."),
            ("نقل كفالة", "إقامات", 350.0, "نقل خدمات مقيم من كفيل لآخر."),
            ("إصدار إقامة جديدة", "إقامات", 300.0, "إصدار رخصة إقامة لأول مرة."),
            ("تعديل مهنة", "إقامات", 180.0, "تعديل المهنة في رخصة الإقامة."),
            ("الإبلاغ عن هروب/إلغاء", "إقامات", 130.0, "خدمات بلاغات التغيّب وإلغائها."),
            ("تجديد جواز سفر", "جوازات", 250.0, "تجديد جواز السفر السعودي."),
            ("إصدار جواز للتابعين", "جوازات", 200.0, "إصدار جواز سفر للأبناء والتابعين."),
            ("تجديد رخصة قيادة", "مرور", 120.0, "تجديد رخصة القيادة."),
            ("إصدار رخصة قيادة", "مرور", 200.0, "إصدار رخصة قيادة جديدة."),
            ("سداد مخالفات مرورية", "مرور", 50.0, "الاستعلام وسداد المخالفات المرورية."),
            ("نقل ملكية مركبة", "مرور", 160.0, "نقل ملكية مركبة بين الأطراف."),
            ("تجديد استمارة سيارة", "مرور", 110.0, "تجديد رخصة سير المركبة."),
            ("إصدار شهادة ميلاد", "أحوال مدنية", 80.0, "إصدار شهادة ميلاد رسمية."),
            ("إصدار بطاقة هوية وطنية", "أحوال مدنية", 90.0, "إصدار أو تجديد الهوية الوطنية."),
            ("إضافة مولود", "أحوال مدنية", 70.0, "تسجيل مولود جديد في سجل الأسرة."),
            ("عقد زواج / وثيقة", "أحوال مدنية", 140.0, "توثيق عقود الزواج."),
            ("تسجيل سجل تجاري", "خدمات تجارية", 400.0, "إصدار سجل تجاري جديد."),
            ("تجديد سجل تجاري", "خدمات تجارية", 300.0, "تجديد السجل التجاري."),
            ("إصدار رخصة بلدية", "خدمات تجارية", 350.0, "إصدار الرخصة البلدية للنشاط."),
            ("اشتراك الغرفة التجارية", "خدمات تجارية", 200.0, "تجديد اشتراك الغرفة التجارية."),
            ("إصدار رخصة عمل", "خدمات العمل", 300.0, "إصدار رخصة عمل للعامل الوافد."),
            ("تجديد رخصة عمل", "خدمات العمل", 250.0, "تجديد رخصة العمل."),
            ("توثيق عقد عمل", "خدمات العمل", 120.0, "توثيق عقود العمل إلكترونياً."),
            ("نقل خدمات عامل", "خدمات العمل", 350.0, "نقل خدمات عامل بين المنشآت."),
            ("حجز موعد صحي", "خدمات صحية", 60.0, "حجز المواعيد في المراكز الصحية."),
            ("إصدار شهادة صحية", "خدمات صحية", 100.0, "إصدار الشهادة الصحية للعاملين."),
            ("تصديق شهادة دراسية", "خدمات تعليمية", 130.0, "تصديق الشهادات الدراسية."),
            ("معادلة شهادة", "خدمات تعليمية", 220.0, "معادلة الشهادات الأجنبية."),
            ("إفراغ عقاري", "خدمات عقارية", 400.0, "خدمات الإفراغ العقاري وتوثيقه."),
            ("إصدار صك إلكتروني", "خدمات عقارية", 350.0, "تحويل الصكوك إلى صكوك إلكترونية."),
        ]
        for n, c, p, d in catalog:
            if not await db.services.find_one({"name": n, "deleted_at": None}):
                await db.services.insert_one({
                    "id": new_id(), "name": n, "category": c, "price": p, "image": None,
                    "description": d, "requires_provider_type": True,
                    "created_at": now(), "deleted_at": None,
                })
        await db.settings.insert_one({"id": "catalog_v2", "done": True})
        logger.info("Catalog v2 seeded")

    # ---- Aetamd real catalog (idempotent v3) ----
    if not await db.settings.find_one({"id": "catalog_v3"}):
        await db.categories.delete_many({})
        await db.services.update_many({"deleted_at": None}, {"$set": {"deleted_at": now()}})
        cat_defs = [
            ("خدمات منصة ناجز", "ribbon-outline"),
            ("خدمات منصة إيجار", "home-outline"),
            ("تصاميم التاجر", "color-palette-outline"),
            ("خدمات تعليمية", "school-outline"),
            ("التصاميم", "brush-outline"),
            ("خدمات الدعم والقروض", "cash-outline"),
            ("خدمات البلدية", "business-outline"),
            ("خدمات الموظفين والعمال", "people-outline"),
            ("خدمات أخرى", "ellipsis-horizontal-outline"),
        ]
        await db.categories.insert_many([{"id": new_id(), "name": n, "icon": i} for n, i in cat_defs])

        R_QIYAS = "رقم الهوية الوطنية أو الإقامة للتابع، تاريخ الميلاد المسجل بأبشر، تحديد نوع الاختبار المطلوب، سداد المقابل المالي عبر سداد أو بطاقة مدى."
        R_VISIT = "رقم الحدود أو رقم التأشيرة الحالية، جواز سفر ساري (لا يقل عن 3 أشهر)، وجود تأمين طبي ساري يغطي فترة التمديد، سداد رسوم التجديد عبر المدفوعات الحكومية."
        R_CITIZEN = "الهوية الوطنية وكارت العائلة، كشف تفصيلي بالدخل الشهري لرب الأسرة والتابعين، عقد إيجار إلكتروني نشط باسم المتقدم أو صك ملكية، رقم آيبان بنكي نشط."
        R_DAMAN = "الهوية الوطنية لرب الأسرة والتابعين، إثبات السكن (عقد إيجار نشط في منصة إيجار أو صك ملكية)، الإفصاح عن الدخل والسجلات التجارية والعقارات لجميع أفراد الأسرة."
        R_FREELANCE = "هوية وطنية سارية وحساب أبشر نشط، إرفاق إثبات الأهلية أو المهارة في التخصص (شهادات تدريبية، دورات، أو نماذج أعمال سابقة)."
        R_DRIVING = "إجراء الفحص الطبي في المراكز المعتمدة وربطه بنظام أبشر، سداد رسوم التجديد حسب المدة، سداد المخالفات المرورية المسجلة إن وجدت."
        R_EJAR = "بيانات المؤجر والمستأجر (رقم الهوية وتاريخ الميلاد)، صك ملكية العقار الإلكتروني المحدث، تحديد قيمة الإيجار السنوي وجدولة الدفعات، رقم الحساب البنكي."
        R_NAJIZ = "هوية الموكل والوكيل (تاريخ الميلاد والجوال)، تحديد بنود وصلاحيات الوكالة بدقة، بلوغ الموكل السن النظامي وتمتعه بكامل الأهلية الشرعية."
        R_HAFIZ = "الجنسية السعودية، الفئة العمرية (من 20 إلى 60 سنة حسب البرنامج)، ألا يكون موظفاً في القطاع العام أو الخاص، وألا يملك سجلاً تجارياً قائماً."
        R_HEALTH = "إجراء الفحوصات الطبية المطلوبة في المراكز المعتمدة من البلدية، صورة شخصية حديثة للمتقدم، سداد رسوم الخدمة عبر نظام سداد."

        catalog3 = [
            ("خدمات منصة ناجز", "تحديث وتعديل صك عقاري", "تحديث وتعديل صك عقاري.", "", False),
            ("خدمات منصة ناجز", "حجز مواعيد", "خدمة حجز موعد.", "", False),
            ("خدمات منصة ناجز", "تسجيل وكالة", "طلب وكالة فردية، فسخ وكالة.", R_NAJIZ, True),
            ("خدمات منصة ناجز", "التحقق من وكالة", "التحقق من وكالة.", "", False),
            ("خدمات منصة ناجز", "إصدار خطاب حضانة", "إصدار خطاب حضانة.", "", False),
            ("خدمات منصة ناجز", "التحقق من معاملة", "التحقق من معاملة.", "", False),
            ("خدمات منصة ناجز", "طلب ترخيص", "طلب ترخيص موثق، ترخيص مأذون أنكحة.", "", False),
            ("خدمات منصة ناجز", "توثيق حضانة", "خدمة توثيق حضانة.", "", False),
            ("خدمات منصة ناجز", "توثيق طلاق", "طلب توثيق طلاق.", "", False),
            ("خدمات منصة ناجز", "توثيق ورثة متوفى", "توثيق ورثة متوفى.", "", False),
            ("خدمات منصة ناجز", "توثيق زواج", "خدمة توثيق زواج.", "", False),
            ("خدمات منصة ناجز", "خدمات ناجز أخرى", "الخدمات الأخرى التابعة لمنصة ناجز.", "", False),

            ("خدمات منصة إيجار", "التسجيل في منصة إيجار", "التسجيل في منصة إيجار.", "", False),
            ("خدمات منصة إيجار", "إصدار عقود", "طلب إصدار عقود.", "", False),
            ("خدمات منصة إيجار", "التحقق من حالة الطلب", "التحقق من حالة الطلب.", "", False),
            ("خدمات منصة إيجار", "توثيق عقود", "توثيق العقود.", R_EJAR, True),
            ("خدمات منصة إيجار", "تسجيل مكتب وساطة", "تسجيل مكتب وساطة.", "", False),
            ("خدمات منصة إيجار", "طلب إلغاء العقد", "إلغاء العقد.", "", False),
            ("خدمات منصة إيجار", "تحميل العقد PDF", "تحميل العقود PDF.", "", False),
            ("خدمات منصة إيجار", "توثيق العقد الإلكتروني", "توثيق العقد الإلكتروني.", "", False),
            ("خدمات منصة إيجار", "خدمات إيجار أخرى", "الخدمات الأخرى.", "", False),

            ("تصاميم التاجر", "تصميم هوية بصرية", "تصميم هوية بصرية بشكل احترافي.", "", False),
            ("تصاميم التاجر", "تحويل النص إلى صوت بالذكاء الاصطناعي", "تحويل النص إلى صوت باستخدام الذكاء الاصطناعي.", "", False),
            ("تصاميم التاجر", "تصميم شعار (لوقو)", "تصميم لوقو احترافي.", "", True),
            ("تصاميم التاجر", "تصميم الصور والمقاطع بالذكاء الصناعي", "تصميم الصور والمقاطع بالذكاء الصناعي.", "", False),
            ("تصاميم التاجر", "تصميم بطاقات عمل", "تصميم بطاقات عمل.", "", False),
            ("تصاميم التاجر", "تصميم بوستات", "بوست إعلاني، تعريفي.", "", False),
            ("تصاميم التاجر", "تصميم أوراق رسمية", "تصميم أوراق رسمية للمنشآت التجارية.", "", False),
            ("تصاميم التاجر", "إصدار جهاز نقاط البيع", "إصدار جهاز نقاط البيع.", "", False),
            ("تصاميم التاجر", "تصميم بروفايل تعريفي", "تصميم بروفايل تعريفي للمنشآت والأفراد.", "", False),
            ("تصاميم التاجر", "تصميم بنر إعلاني", "تصميم بنر إعلاني.", "", False),
            ("تصاميم التاجر", "إنشاء رابط موحد", "إنشاء رابط موحد.", "", False),
            ("تصاميم التاجر", "إنشاء باركود QR", "إنشاء باركود للمسح المرئي (QR).", "", False),

            ("خدمات تعليمية", "عروض تقديمية", "العروض الطلابية التفاعلية.", "", False),
            ("خدمات تعليمية", "مشاريع تخرج", "تصاميم ومشاريع تخرج.", "", False),
            ("خدمات تعليمية", "كتابة مقالات وتقارير", "كتابة مقالات وتقارير.", "", False),
            ("خدمات تعليمية", "نظام نور", "طلب خدمة نظام نور.", "", False),
            ("خدمات تعليمية", "سجلات تحضير", "طلب سجلات تحضير.", "", False),
            ("خدمات تعليمية", "بحث", "بحث تعليمي.", "", False),
            ("خدمات تعليمية", "الترجمة", "ترجمة النصوص والمستندات.", "", False),
            ("خدمات تعليمية", "ترجمة البحوث", "خدمة ترجمة البحوث.", "", False),
            ("خدمات تعليمية", "خرائط ذهنية", "خرائط ذهنية للتلخيص.", "", False),
            ("خدمات تعليمية", "تحويل الملفات إلى PDF", "تحويل الملفات إلى Word و PDF.", "", False),
            ("خدمات تعليمية", "حل التكليفات", "خدمات طلابية.", "", False),
            ("خدمات تعليمية", "كتابة النصوص", "خدمة كتابة النصوص.", "", False),
            ("خدمات تعليمية", "ملفات إنجاز", "طلب ملف إنجاز.", "", False),
            ("خدمات تعليمية", "التسجيل في قياس", "التسجيل في اختبارات قياس.", R_QIYAS, True),
            ("خدمات تعليمية", "خدمات تعليمية أخرى", "خدمات طلابية أخرى.", "", False),

            ("التصاميم", "سيرة ذاتية", "تصميم سيرة ذاتية احترافية.", "", True),
            ("التصاميم", "دعوات زواج", "دعوات زواج.", "", False),
            ("التصاميم", "بشارة مولود", "بشارة مولود.", "", False),
            ("التصاميم", "دعوات إلكترونية", "دعوات إلكترونية.", "", False),
            ("التصاميم", "بطاقة عمل", "طلب بطاقة عمل.", "", False),
            ("التصاميم", "قائمة الطعام (منيو)", "قائمة الطعام (منيو).", "", False),
            ("التصاميم", "تصميم انفوجرافيك", "تصميم انفوجرافيك.", "", False),
            ("التصاميم", "تصاميم أخرى", "أخرى.", "", False),

            ("خدمات الدعم والقروض", "حساب المواطن", "التسجيل، استعلام عن حالة الطلب، وغيرها.", R_CITIZEN, True),
            ("خدمات الدعم والقروض", "منصة ريف", "التقديم على دعم ريف.", "", False),
            ("خدمات الدعم والقروض", "بنك التنمية الاجتماعية", "خدمات بنك التنمية الاجتماعية.", "", False),
            ("خدمات الدعم والقروض", "الضمان المطور", "التسجيل في الضمان، استعلام، إضافة تابعين.", R_DAMAN, False),
            ("خدمات الدعم والقروض", "حافز", "التسجيل في حافز، استعلام، خدمات حافز.", R_HAFIZ, True),
            ("خدمات الدعم والقروض", "تمهير", "التقديم على برنامج تمهير.", "", False),
            ("خدمات الدعم والقروض", "استخراج تأشيرات ذوي الإعاقة", "استخراج تأشيرات ذوي الإعاقة.", "", False),
            ("خدمات الدعم والقروض", "ساند", "التقديم على دعم ساند.", "", False),
            ("خدمات الدعم والقروض", "فتح ملف منشأة زراعية", "فتح ملف منشأة زراعية.", "", False),
            ("خدمات الدعم والقروض", "استخراج تأشيرة العمالة الزراعية والمنزلية", "استخراج تأشيرة العمالة الزراعية والمنزلية.", "", False),

            ("خدمات البلدية", "إصدار شهادة صحية", "استخراج وتجديد الشهادة للسعوديين وغير السعوديين.", R_HEALTH, True),
            ("خدمات البلدية", "رخصة البلدية", "استخراج، إلغاء، تجديد، ونقل ملكية الرخصة.", "", False),
            ("خدمات البلدية", "ترخيص الدفاع المدني", "ترخيص الدفاع المدني.", "", False),
            ("خدمات البلدية", "اعتراض على مخالفة الرقابة", "اعتراض على مخالفة الرقابة.", "", False),
            ("خدمات البلدية", "تقرير فني", "طلب تقرير فني.", "", False),
            ("خدمات البلدية", "إصدار ملصق رأيك يفرق", "إصدار ملصق رأيك يفرق.", "", False),
            ("خدمات البلدية", "خدمات بلدية أخرى", "طلب خدمة أخرى.", "", False),

            ("خدمات الموظفين والعمال", "إلغاء انقطاع عن العمل", "خدمة إلغاء انقطاع عن العمل.", "", False),
            ("خدمات الموظفين والعمال", "إعلان انقطاع عن العمل", "خدمة إعلان انقطاع عن العمل.", "", False),
            ("خدمات الموظفين والعمال", "تجديد إقامات", "خدمة تجديد إقامة.", "", True),
            ("خدمات الموظفين والعمال", "نقل كفالات من وإلى", "خدمة نقل كفالة.", "", False),
            ("خدمات الموظفين والعمال", "تحويل مهن عمالة", "خدمة تحويل مهن عمال.", "", False),
            ("خدمات الموظفين والعمال", "منصة قوى", "الخدمات التابعة لمنصة قوى.", "", False),
            ("خدمات الموظفين والعمال", "مدد", "الخدمات التابعة لمنصة مدد.", "", False),
            ("خدمات الموظفين والعمال", "إصدار وثيقة العمل الحر", "إصدار وثيقة العمل الحر.", R_FREELANCE, False),
            ("خدمات الموظفين والعمال", "تجديد رخصة القيادة", "تجديد رخصة القيادة.", R_DRIVING, False),
            ("خدمات الموظفين والعمال", "تجديد تأشيرة الزيارة", "تجديد تأشيرة الزيارة.", R_VISIT, False),

            ("خدمات أخرى", "استفسار", "طلب استفسار.", "", False),
            ("خدمات أخرى", "استعلام", "استعلام.", "", False),
            ("خدمات أخرى", "طلب خدمة أخرى", "طلب خدمة أخرى.", "", False),
        ]
        await db.services.insert_many([{
            "id": new_id(), "name": n, "category": c, "price": 0.0, "image": None,
            "description": d, "requirements": r, "featured": f,
            "requires_provider_type": True, "created_at": now(), "deleted_at": None,
        } for c, n, d, r, f in catalog3])
        await db.settings.insert_one({"id": "catalog_v3", "done": True})
        logger.info("Catalog v3 seeded")


# ----------------------------- auth routes -----------------------------
@api.get("/")
async def root():
    return {"message": "Aetamd API", "ok": True}


@api.post("/auth/register")
async def register(body: RegisterCustomer):
    check_password_policy(body.password)
    email = str(body.email).lower()
    phone = norm_identifier(body.phone)
    await ensure_can_register(email, phone)
    uid = new_id()
    await db.users.insert_one({
        "id": uid, "name": body.name, "email": email, "phone": phone,
        "password_hash": pwd.hash(body.password), "role": "customer",
        "verified": False, "approved": True, "wallet_balance": 0.0,
        "bio": "", "subscription": None, "created_at": now(), "deleted_at": None,
    })
    cid = await issue_otp(uid, email, "registration")
    return {"challenge_id": cid, "email": email, "message": "تم إرسال رمز التحقق إلى بريدك"}


@api.post("/auth/register-provider")
async def register_provider(body: RegisterProvider):
    check_password_policy(body.password)
    email = str(body.email).lower()
    phone = norm_identifier(body.phone)
    await ensure_can_register(email, phone)
    uid = new_id()
    await db.users.insert_one({
        "id": uid, "name": body.office_name, "office_name": body.office_name,
        "email": email, "phone": phone, "password_hash": pwd.hash(body.password),
        "role": "service_provider", "verified": False, "approved": False,
        "provider_status": "pending", "suspended": False, "documents": body.documents,
        "activity_image": body.activity_image, "wallet_balance": 0.0,
        "bio": "", "subscription": None, "created_at": now(), "deleted_at": None,
    })
    cid = await issue_otp(uid, email, "registration")
    return {"challenge_id": cid, "email": email,
            "message": "تم إرسال رمز التحقق. بعد التحقق سيُراجع طلبك من الإدارة"}


@api.post("/auth/verify-registration")
async def verify_registration(body: VerifyOtp):
    c = await db.auth_challenges.find_one_and_delete({
        "id": body.challenge_id, "purpose": "registration",
        "code_hash": code_hash(body.otp), "expires_at": {"$gt": now()},
    })
    if not c:
        raise HTTPException(400, "رمز غير صحيح أو منتهي الصلاحية")
    await db.users.update_one({"id": c["user_id"]}, {"$set": {"verified": True}})
    user = await db.users.find_one({"id": c["user_id"]})
    user = clean(user)
    if user["role"] == "service_provider" and not user.get("approved"):
        return {"verified": True, "pending_approval": True,
                "message": "تم التحقق. حسابك قيد المراجعة من الإدارة"}
    return {"verified": True, "access_token": make_token(user), "user": user}


@api.post("/auth/login")
async def login(body: LoginIn):
    ident = norm_identifier(body.identifier)
    query = {"email": ident} if "@" in ident else {"phone": ident}
    query["deleted_at"] = None
    user = await db.users.find_one(query)
    if not user or not pwd.verify(body.password, user["password_hash"]):
        raise HTTPException(401, "بيانات الدخول غير صحيحة")
    if not user.get("verified"):
        cid = await issue_otp(user["id"], user["email"], "registration")
        return {"needs_registration_verify": True, "challenge_id": cid, "email": user["email"],
                "message": "يجب تأكيد الحساب أولاً، تم إرسال رمز جديد"}
    if user["role"] == "service_provider" and not user.get("approved"):
        raise HTTPException(403, "حسابك قيد المراجعة من الإدارة")
    cid = await issue_otp(user["id"], user["email"], "login")
    return {"challenge_id": cid, "email": user["email"], "message": "تم إرسال رمز التحقق إلى بريدك"}


@api.post("/auth/verify-login")
async def verify_login(body: VerifyOtp):
    c = await db.auth_challenges.find_one_and_delete({
        "id": body.challenge_id, "purpose": "login",
        "code_hash": code_hash(body.otp), "expires_at": {"$gt": now()},
    })
    if not c:
        raise HTTPException(400, "رمز غير صحيح أو منتهي الصلاحية")
    user = await db.users.find_one({"id": c["user_id"], "deleted_at": None})
    if not user:
        raise HTTPException(404, "المستخدم غير موجود")
    user = clean(user)
    return {"access_token": make_token(user), "user": user}


@api.post("/auth/resend-otp")
async def resend_otp(body: dict):
    email = (body.get("email") or "").lower()
    purpose = body.get("purpose", "login")
    user = await db.users.find_one({"email": email, "deleted_at": None})
    if not user:
        raise HTTPException(404, "المستخدم غير موجود")
    cid = await issue_otp(user["id"], email, purpose)
    return {"challenge_id": cid, "message": "تم إرسال رمز جديد"}


@api.get("/auth/me")
async def me(user=Depends(current_user)):
    return user


@api.get("/auth/otp-by-challenge/{challenge_id}")
async def otp_by_challenge(challenge_id: str):
    # Returns the code for a specific challenge the client already initiated
    # (challenge_id is a secret held only by that client). Enables auto-fill.
    c = await db.auth_challenges.find_one({"id": challenge_id}, sort=[("created_at", -1)])
    if not c:
        raise HTTPException(404, "no challenge")
    return {"otp": c.get("code_plain")}


@api.get("/auth/test-otp")
async def test_otp(email: str, challenge_id: Optional[str] = None):
    # Preview/testing only. Disabled unless ALLOW_TEST_OTP=1.
    if os.environ.get("ALLOW_TEST_OTP") != "1":
        raise HTTPException(404, "not found")
    q = {"email": email.lower()}
    if challenge_id:
        q["id"] = challenge_id
    c = await db.auth_challenges.find_one(q, sort=[("created_at", -1)])
    if not c:
        raise HTTPException(404, "no challenge")
    return {"otp": c.get("code_plain"), "challenge_id": c["id"], "purpose": c["purpose"]}


# ----------------------------- upload -----------------------------
@api.post("/upload")
async def upload(file: UploadFile = File(...), user=Depends(current_user)):
    data = await file.read()
    ext = (file.filename or "file").split(".")[-1].lower()
    if len(ext) > 5 or "/" in ext:
        ext = "bin"
    path = f"{APP_NAME}/uploads/{user['id']}/{new_id()}.{ext}"
    try:
        result = await put_object(path, data, file.content_type or "application/octet-stream")
    except Exception as e:
        logger.error(f"upload failed: {e}")
        raise HTTPException(502, "فشل رفع الملف")
    await db.uploads.insert_one({
        "id": new_id(), "owner_id": user["id"], "storage_path": result["path"],
        "content_type": file.content_type, "created_at": now(),
    })
    return {"path": result["path"]}


# public upload for provider registration documents (no auth yet)
@api.post("/upload-public")
async def upload_public(file: UploadFile = File(...)):
    data = await file.read()
    ext = (file.filename or "file").split(".")[-1].lower()
    if len(ext) > 5 or "/" in ext:
        ext = "bin"
    path = f"{APP_NAME}/registration/{new_id()}.{ext}"
    try:
        result = await put_object(path, data, file.content_type or "application/octet-stream")
    except Exception as e:
        logger.error(f"upload failed: {e}")
        raise HTTPException(502, "فشل رفع الملف")
    return {"path": result["path"]}


@api.get("/files/{path:path}")
async def files(path: str):
    try:
        content, ctype = await get_object(path)
    except Exception:
        raise HTTPException(404, "الملف غير موجود")
    return Response(content=content, media_type=ctype)


# ----------------------------- catalog -----------------------------
@api.get("/categories")
async def list_categories():
    cats = await db.categories.find({}, {"_id": 0}).to_list(200)
    return cats


@api.get("/services")
async def list_services(category: Optional[str] = None):
    q = {"deleted_at": None}
    if category == "featured":
        q["featured"] = True
    elif category and category != "all":
        q["category"] = category
    svcs = await db.services.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return svcs


@api.get("/services/{sid}")
async def get_service(sid: str):
    s = await db.services.find_one({"id": sid, "deleted_at": None}, {"_id": 0})
    if not s:
        raise HTTPException(404, "الخدمة غير موجودة")
    return s


@api.get("/settings")
async def get_settings():
    s = await db.settings.find_one({"id": "app"}, {"_id": 0})
    return s or {}


# ----------------------------- customer -----------------------------
APPLICANT_TYPES = {"visitor", "resident", "citizen", "gulf_id"}


@api.post("/requests")
async def create_request(body: RequestIn, user=Depends(require("customer"))):
    if body.applicant_type not in APPLICANT_TYPES:
        raise HTTPException(400, "نوع مقدم الطلب غير صالح")
    svc = await db.services.find_one({"id": body.service_id, "deleted_at": None})
    if not svc:
        raise HTTPException(404, "الخدمة غير موجودة")
    disc = await applicable_discount(user)
    original = svc["price"]
    final = round(original * (1 - disc["percent"] / 100), 2) if disc else original
    rid = new_id()
    doc = {
        "id": rid, "service_id": svc["id"], "service_name": svc["name"],
        "category": svc["category"], "price": final, "original_price": original,
        "discount_percent": disc["percent"] if disc else 0,
        "customer_id": user["id"], "customer_name": user["name"],
        "customer_phone": user.get("phone", ""), "customer_email": user.get("email", ""),
        "applicant_type": body.applicant_type, "notes": body.notes or "",
        "status": "pending", "assigned_provider_id": None, "assigned_provider_name": None,
        "created_at": now(), "updated_at": now(), "deleted_at": None,
    }
    await db.requests.insert_one(doc)
    provs = await db.users.find(
        {"role": "service_provider", "approved": True, "suspended": {"$ne": True}, "deleted_at": None},
        {"id": 1},
    ).to_list(2000)
    for p in provs:
        await notify(p["id"], "طلب خدمة جديد", f"{svc['name']} — {user['name']}", "request", rid)
    return clean(doc)


@api.get("/requests/mine")
async def my_requests(user=Depends(require("customer"))):
    rows = await db.requests.find({"customer_id": user["id"], "deleted_at": None}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


# ----------------------------- provider -----------------------------
@api.get("/provider/requests")
async def provider_requests(status: Optional[str] = None, user=Depends(require("service_provider"))):
    q = {"deleted_at": None}
    if status and status != "all":
        q["status"] = status
    rows = await db.requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


@api.get("/provider/stats")
async def provider_stats(user=Depends(require("service_provider"))):
    pending = await db.requests.count_documents({"status": "pending"})
    in_progress = await db.requests.count_documents({"status": "in_progress", "assigned_provider_id": user["id"]})
    completed = await db.requests.count_documents({"status": "completed", "assigned_provider_id": user["id"]})
    return {"pending": pending, "in_progress": in_progress, "completed": completed}


@api.post("/provider/requests/{rid}/status")
async def update_request_status(rid: str, body: RequestStatusIn, user=Depends(require("service_provider"))):
    if user.get("suspended"):
        raise HTTPException(403, "تم إيقاف خدماتك")
    if body.status not in {"in_progress", "completed", "rejected"}:
        raise HTTPException(400, "حالة غير صالحة")
    r = await db.requests.find_one({"id": rid})
    if not r:
        raise HTTPException(404, "الطلب غير موجود")
    await db.requests.update_one({"id": rid}, {"$set": {
        "status": body.status, "assigned_provider_id": user["id"],
        "assigned_provider_name": user.get("office_name") or user["name"],
        "updated_at": now(),
    }})
    updated = await db.requests.find_one({"id": rid}, {"_id": 0})
    return updated


# ----------------------------- chat / messages -----------------------------
async def _get_request_for(user, rid):
    r = await db.requests.find_one({"id": rid, "deleted_at": None}, {"_id": 0})
    if not r:
        raise HTTPException(404, "الطلب غير موجود")
    allowed = (
        user["role"] == "admin"
        or (user["role"] == "customer" and r["customer_id"] == user["id"])
        or (user["role"] == "service_provider" and r.get("assigned_provider_id") == user["id"])
    )
    if not allowed:
        raise HTTPException(403, "ليس لديك صلاحية")
    return r


@api.get("/requests/{rid}")
async def request_detail(rid: str, user=Depends(current_user)):
    return await _get_request_for(user, rid)


@api.get("/requests/{rid}/messages")
async def list_messages(rid: str, user=Depends(current_user)):
    await _get_request_for(user, rid)
    msgs = await db.messages.find({"request_id": rid}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return msgs


@api.post("/requests/{rid}/messages")
async def send_message(rid: str, body: MessageIn, user=Depends(current_user)):
    r = await _get_request_for(user, rid)
    if user["role"] == "service_provider" and user.get("suspended"):
        raise HTTPException(403, "تم إيقاف خدماتك")
    if not body.text.strip():
        raise HTTPException(400, "الرسالة فارغة")
    doc = {
        "id": new_id(), "request_id": rid, "sender_id": user["id"],
        "sender_role": user["role"],
        "sender_name": user.get("office_name") or user.get("name", ""),
        "text": body.text.strip(), "created_at": now(),
    }
    await db.messages.insert_one(doc)
    recipients = set()
    if r.get("customer_id") and r["customer_id"] != user["id"]:
        recipients.add(r["customer_id"])
    if r.get("assigned_provider_id") and r["assigned_provider_id"] != user["id"]:
        recipients.add(r["assigned_provider_id"])
    for uid in recipients:
        await notify(uid, "رسالة جديدة", f"{doc['sender_name']}: {doc['text'][:40]}", "message", rid)
    return clean(doc)


# ----------------------------- admin -----------------------------
@api.get("/admin/stats")
async def admin_stats(user=Depends(require("admin"))):
    return {
        "customers": await db.users.count_documents({"role": "customer", "deleted_at": None}),
        "providers": await db.users.count_documents({"role": "service_provider", "deleted_at": None}),
        "pending_providers": await db.users.count_documents({"role": "service_provider", "approved": False, "verified": True, "deleted_at": None}),
        "services": await db.services.count_documents({"deleted_at": None}),
        "requests": await db.requests.count_documents({}),
    }


@api.get("/admin/providers")
async def admin_providers(user=Depends(require("admin"))):
    rows = await db.users.find({"role": "service_provider", "deleted_at": None}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    return rows


@api.post("/admin/providers/{uid}/approval")
async def admin_approval(uid: str, body: ApprovalIn, user=Depends(require("admin"))):
    u = await db.users.find_one({"id": uid, "role": "service_provider"})
    if not u:
        raise HTTPException(404, "غير موجود")
    await db.users.update_one({"id": uid}, {"$set": {
        "approved": body.approved,
        "provider_status": "approved" if body.approved else "rejected",
    }})
    try:
        if body.approved:
            await send_email(to=u["email"], subject="تم قبول حسابك - اعتمد",
                             html='<div dir="rtl" style="font-family:Arial;padding:20px"><h2 style="color:#046C4E">مبروك!</h2><p>تم قبول حسابك كمقدم خدمة في تطبيق اعتمد. يمكنك الآن تسجيل الدخول.</p></div>')
        else:
            await send_email(to=u["email"], subject="تحديث حالة الطلب - اعتمد",
                             html='<div dir="rtl" style="font-family:Arial;padding:20px"><h2 style="color:#046C4E">اعتمد</h2><p>نأسف، لم يتم قبول طلب تسجيلك كمقدم خدمة حالياً.</p></div>')
    except Exception as e:
        logger.error(f"approval email failed: {e}")
    return {"approved": body.approved}


@api.post("/admin/providers/{uid}/suspend")
async def admin_suspend(uid: str, body: SuspendIn, user=Depends(require("admin"))):
    u = await db.users.find_one({"id": uid, "role": "service_provider"})
    if not u:
        raise HTTPException(404, "غير موجود")
    await db.users.update_one({"id": uid}, {"$set": {"suspended": body.suspended}})
    return {"suspended": body.suspended}


@api.get("/admin/requests")
async def admin_requests(user=Depends(require("admin"))):
    rows = await db.requests.find({"deleted_at": None}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return rows


@api.delete("/admin/requests/{rid}")
async def admin_delete_request(rid: str, user=Depends(require("admin"))):
    await db.requests.update_one({"id": rid}, {"$set": {"deleted_at": now()}})
    return {"deleted": True}


# ----------------------------- notes (announcements) -----------------------------
@api.post("/admin/notes")
async def admin_create_note(body: NoteIn, user=Depends(require("admin"))):
    target = body.target_user_id
    if body.audience == "user" and target and "@" in target:
        u = await db.users.find_one({"email": target.lower(), "deleted_at": None})
        target = u["id"] if u else None
    doc = {"id": new_id(), "title": body.title, "body": body.body, "audience": body.audience,
           "target_user_id": target, "created_at": now(), "deleted_at": None}
    await db.notes.insert_one(doc)
    q = {"deleted_at": None}
    if body.audience == "customers":
        q["role"] = "customer"
    elif body.audience == "providers":
        q["role"] = "service_provider"
    elif body.audience == "user":
        q["id"] = target
    targets = await db.users.find(q, {"id": 1}).to_list(5000)
    for u in targets:
        await notify(u["id"], body.title, body.body, "note")
    return clean(doc)


@api.get("/admin/notes")
async def admin_list_notes(user=Depends(require("admin"))):
    return await db.notes.find({"deleted_at": None}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.delete("/admin/notes/{nid}")
async def admin_delete_note(nid: str, user=Depends(require("admin"))):
    await db.notes.update_one({"id": nid}, {"$set": {"deleted_at": now()}})
    return {"deleted": True}


@api.get("/notes")
async def my_notes(user=Depends(current_user)):
    rows = await db.notes.find({"deleted_at": None}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [n for n in rows if audience_matches(user, n["audience"], n.get("target_user_id"))]


# ----------------------------- discounts -----------------------------
@api.post("/admin/discounts")
async def admin_create_discount(body: DiscountIn, user=Depends(require("admin"))):
    target = body.target_user_id
    if body.audience == "user" and target and "@" in target:
        u = await db.users.find_one({"email": target.lower(), "deleted_at": None})
        target = u["id"] if u else None
    doc = {"id": new_id(), "title": body.title, "percent": body.percent, "audience": body.audience,
           "target_user_id": target, "active": True, "created_at": now(), "deleted_at": None}
    await db.discounts.insert_one(doc)
    q = {"deleted_at": None}
    if body.audience == "customers":
        q["role"] = "customer"
    elif body.audience == "providers":
        q["role"] = "service_provider"
    elif body.audience == "user":
        q["id"] = target
    targets = await db.users.find(q, {"id": 1}).to_list(5000)
    for u in targets:
        await notify(u["id"], "خصم جديد 🎉", f"{body.title} — خصم {int(body.percent)}%", "discount")
    return clean(doc)


@api.get("/admin/discounts")
async def admin_list_discounts(user=Depends(require("admin"))):
    return await db.discounts.find({"deleted_at": None}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.delete("/admin/discounts/{did}")
async def admin_delete_discount(did: str, user=Depends(require("admin"))):
    await db.discounts.update_one({"id": did}, {"$set": {"deleted_at": now(), "active": False}})
    return {"deleted": True}


@api.get("/my-discount")
async def my_discount(user=Depends(current_user)):
    return {"discount": await applicable_discount(user)}


# ----------------------------- notifications -----------------------------
@api.get("/notifications")
async def list_notifications(user=Depends(current_user)):
    return await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.get("/notifications/unread-count")
async def unread_count(user=Depends(current_user)):
    return {"count": await db.notifications.count_documents({"user_id": user["id"], "read": False})}


@api.post("/notifications/read-all")
async def read_all(user=Depends(current_user)):
    await db.notifications.update_many({"user_id": user["id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True}


@api.get("/admin/users")
async def admin_users(role: Optional[str] = None, user=Depends(require("admin"))):
    q = {"deleted_at": None}
    if role and role != "all":
        q["role"] = role
    rows = await db.users.find(q, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)
    return rows


@api.put("/admin/users/{uid}")
async def admin_update_user(uid: str, body: ProfileIn, user=Depends(require("admin"))):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if not updates:
        raise HTTPException(400, "لا يوجد تغييرات")
    r = await db.users.update_one({"id": uid, "deleted_at": None}, {"$set": updates})
    if r.matched_count != 1:
        raise HTTPException(404, "غير موجود")
    return await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})


@api.delete("/admin/users/{uid}")
async def admin_delete_user(uid: str, user=Depends(require("admin"))):
    if uid == user["id"]:
        raise HTTPException(400, "لا يمكن حذف حسابك")
    await db.users.update_one({"id": uid}, {"$set": {"deleted_at": now()}})
    return {"deleted": True}


@api.post("/admin/services")
async def admin_create_service(body: ServiceIn, user=Depends(require("admin"))):
    doc = {"id": new_id(), **body.dict(), "created_at": now(), "deleted_at": None}
    await db.services.insert_one(doc)
    return clean(doc)


@api.put("/admin/services/{sid}")
async def admin_update_service(sid: str, body: ServiceIn, user=Depends(require("admin"))):
    r = await db.services.update_one({"id": sid, "deleted_at": None}, {"$set": body.dict()})
    if r.matched_count != 1:
        raise HTTPException(404, "غير موجود")
    return await db.services.find_one({"id": sid}, {"_id": 0})


@api.delete("/admin/services/{sid}")
async def admin_delete_service(sid: str, user=Depends(require("admin"))):
    await db.services.update_one({"id": sid}, {"$set": {"deleted_at": now()}})
    return {"deleted": True}


@api.post("/admin/categories")
async def admin_create_category(body: CategoryIn, user=Depends(require("admin"))):
    doc = {"id": new_id(), **body.dict()}
    await db.categories.insert_one(doc)
    return clean(doc)


@api.delete("/admin/categories/{cid}")
async def admin_delete_category(cid: str, user=Depends(require("admin"))):
    await db.categories.delete_one({"id": cid})
    return {"deleted": True}


@api.put("/admin/settings")
async def admin_update_settings(body: SettingsIn, user=Depends(require("admin"))):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    await db.settings.update_one({"id": "app"}, {"$set": updates}, upsert=True)
    return await db.settings.find_one({"id": "app"}, {"_id": 0})


# ----------------------------- profile -----------------------------
@api.put("/profile")
async def update_profile(body: ProfileIn, user=Depends(current_user)):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    return await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})


# ----------------------------- wallet & payments -----------------------------
@api.get("/wallet")
async def wallet(user=Depends(current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    txns = await db.transactions.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"balance": u.get("wallet_balance", 0.0), "transactions": txns}


@api.get("/subscription-plans")
async def subscription_plans(user=Depends(current_user)):
    return {"plans": SUBSCRIPTION_PLANS, "current": user.get("subscription")}


def _stripe_ready() -> bool:
    return bool(os.environ.get("STRIPE_SECRET_KEY"))


@api.post("/wallet/topup")
async def wallet_topup(body: TopupIn, request: Request, user=Depends(current_user)):
    if body.amount < 5:
        raise HTTPException(400, "الحد الأدنى للشحن 5 ريال")
    if not _stripe_ready():
        raise HTTPException(400, "خدمة الدفع غير مفعّلة بعد. يرجى إضافة مفاتيح Stripe")
    base = str(request.base_url)
    txn_id = new_id()
    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[{"price_data": {"currency": "sar", "unit_amount": int(body.amount * 100),
                     "product_data": {"name": "شحن رصيد المحفظة"}}, "quantity": 1}],
        success_url=f"{base}api/payment-done?status=success&txn={txn_id}",
        cancel_url=f"{base}api/payment-done?status=cancel&txn={txn_id}",
        metadata={"txn_id": txn_id, "user_id": user["id"], "kind": "wallet", "amount": str(body.amount)},
    )
    await db.transactions.insert_one({
        "id": txn_id, "user_id": user["id"], "kind": "wallet_topup", "amount": body.amount,
        "status": "pending", "stripe_session_id": session.id, "description": "شحن رصيد",
        "created_at": now(),
    })
    return {"url": session.url, "session_id": session.id, "txn_id": txn_id}


@api.post("/subscriptions/checkout")
async def subscribe_checkout(body: SubscribeIn, request: Request, user=Depends(current_user)):
    plan = next((p for p in SUBSCRIPTION_PLANS if p["id"] == body.plan_id), None)
    if not plan:
        raise HTTPException(404, "الباقة غير موجودة")
    if not _stripe_ready():
        raise HTTPException(400, "خدمة الدفع غير مفعّلة بعد. يرجى إضافة مفاتيح Stripe")
    base = str(request.base_url)
    txn_id = new_id()
    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[{"price_data": {"currency": "sar", "unit_amount": int(plan["price"] * 100),
                     "product_data": {"name": f"اشتراك {plan['name']}"}}, "quantity": 1}],
        success_url=f"{base}api/payment-done?status=success&txn={txn_id}",
        cancel_url=f"{base}api/payment-done?status=cancel&txn={txn_id}",
        metadata={"txn_id": txn_id, "user_id": user["id"], "kind": "subscription", "plan_id": plan["id"]},
    )
    await db.transactions.insert_one({
        "id": txn_id, "user_id": user["id"], "kind": "subscription", "amount": plan["price"],
        "status": "pending", "stripe_session_id": session.id,
        "description": f"اشتراك {plan['name']}", "plan_id": plan["id"], "created_at": now(),
    })
    return {"url": session.url, "session_id": session.id, "txn_id": txn_id}


async def _fulfill(session):
    meta = session.get("metadata", {})
    txn_id = meta.get("txn_id")
    if not txn_id:
        return
    txn = await db.transactions.find_one({"id": txn_id})
    if not txn or txn["status"] == "succeeded":
        return
    await db.transactions.update_one({"id": txn_id}, {"$set": {"status": "succeeded", "paid_at": now()}})
    if meta.get("kind") == "wallet":
        await db.users.update_one({"id": meta["user_id"]}, {"$inc": {"wallet_balance": float(meta.get("amount", 0))}})
    elif meta.get("kind") == "subscription":
        plan = next((p for p in SUBSCRIPTION_PLANS if p["id"] == meta.get("plan_id")), None)
        await db.users.update_one({"id": meta["user_id"]}, {"$set": {"subscription": {
            "plan_id": meta.get("plan_id"), "plan_name": plan["name"] if plan else "",
            "started_at": now().isoformat(),
            "expires_at": (now() + timedelta(days=30)).isoformat(),
        }}})


@api.post("/payments/verify/{session_id}")
async def verify_payment(session_id: str, user=Depends(current_user)):
    if not _stripe_ready():
        raise HTTPException(400, "خدمة الدفع غير مفعّلة")
    session = stripe.checkout.Session.retrieve(session_id)
    if session.get("payment_status") == "paid":
        await _fulfill(session)
        return {"status": "success"}
    return {"status": session.get("payment_status", "pending")}


from fastapi.responses import HTMLResponse


@app.get("/api/payment-done", response_class=HTMLResponse)
async def payment_done(status: str = "success", txn: str = ""):
    ok = status == "success"
    color = "#046C4E" if ok else "#EF4444"
    msg = "تمت العملية بنجاح" if ok else "تم إلغاء العملية"
    return f"""<!doctype html><html dir=rtl lang=ar><head><meta charset=utf-8>
<meta name=viewport content='width=device-width,initial-scale=1'>
<style>body{{font-family:Arial;background:#F3F4F6;display:flex;height:100vh;margin:0;align-items:center;justify-content:center}}
.c{{background:#fff;padding:32px;border-radius:16px;text-align:center;max-width:340px}}
h1{{color:{color}}}</style></head>
<body><div class=c><h1>{msg}</h1><p>يمكنك العودة إلى تطبيق اعتمد الآن.</p></div></body></html>"""


@app.post("/api/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except Exception:
        raise HTTPException(400, "webhook invalid")
    if event["type"] == "checkout.session.completed":
        await _fulfill(event["data"]["object"])
    return {"ok": True}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown():
    client.close()
