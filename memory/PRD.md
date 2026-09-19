# PRD — اعتمد (Aetamd) e-Services App

## Original problem statement
Arabic-first (AR/EN, RTL) electronic-services platform "اعتمد". Three roles (admin, service provider, customer). Admin manages services & accounts, approves/suspends/deletes providers, posts targeted notes & discounts, deletes requests. Providers register office + documents (admin approval), view/execute customer requests, chat with customers. Customers browse services by category, view requirements, request services (applicant type), chat with provider. Email OTP auth on register + login. Black+gold brand identity (per logo). No Emergent branding.

## Architecture
- Backend: FastAPI + MongoDB (motor), JWT auth, bcrypt. Single `server.py`. Email OTP via Emergent-managed Resend (`email_service.py`). Object storage via Emergent Managed Object Storage (`storage_service.py`).
- Frontend: Expo Router (React Native), @tanstack/react-query, react-native-keyboard-controller, Tajawal font, theme tokens in `src/theme.ts` (black+gold). i18n in `src/i18n.tsx` (AR/EN).
- Roles routed via `app/index.tsx` gate → `(customer)`, `(provider)`, `(admin)` tab groups. Shared secondary screens at root (chat, notifications, about, contact, edit-profile, admin-* forms).

## User personas
- Admin: full control (services, users, providers, requests, notes, discounts, chats).
- Service provider (office): registers with docs, awaits approval, handles requests, chats. Suspended → renew-subscription screen + WhatsApp.
- Customer: browses catalog, requests services, chats with provider, sees notes/discounts.

## Core requirements (static)
- Email OTP on register + login (auto-filled via challenge id). Password policy enforced. Phone usable by max 2 accounts.
- Provider approval workflow. Provider suspend/activate + block.
- Service catalog: 9 categories + "الأكثر طلباً" featured; each service has name/category/price(optional→"حسب الطلب")/image/description/requirements/featured.
- Service request with applicant type (visitor/resident/citizen/gulf_id) + notes.
- In-app chat per request (customer↔provider), admin can view all.
- In-app notifications (new request → providers; chat reply → other party).
- Admin notes/announcements + discounts, audience: all/customers/providers/specific user (by email).
- Contact us (phone/email/WhatsApp), language toggle, edit profile, about.

## Implemented (2026-06)
- [x] Auth: register (customer/provider), OTP verify (register+login), auto-fill OTP, JWT, seeded admin (atmd4042@gmail.com).
- [x] Provider approval + suspend/activate + delete; approval emails.
- [x] Catalog v3: 9 categories, 86 services with requirements text + featured flag; admin CRUD services (image upload, requirements, featured).
- [x] Requests: create (with discount applied), customer list, provider list/accept/complete/reject, admin list + soft delete.
- [x] Chat + admin view; notifications (bell + badge + list, read-all).
- [x] Notes & discounts (targeted) with home banners.
- [x] Wallet & subscriptions REMOVED from UI (legacy backend routes remain unused/harmless).
- [x] Black+gold theme, RTL, AR/EN toggle, contact/WhatsApp, /login web redirect for providers.
- [x] Tested: 15/15 backend pytest + frontend smoke (testing agent iteration_1) — no blockers.

## Backlog / remaining
- P1: Real push notifications (lock-screen) — requires Emergent push integration + deploy + native build (google-services.json).
- P1: Stripe payments (keys not provided) — wallet/subscriptions were cancelled by user; revisit only if requested.
- P2: Desktop-optimized provider layout (max-width) for computer users.
- P2: Optional cleanup of unused wallet/subscription backend routes; split server.py into modules.

## Notes
- `ALLOW_TEST_OTP=1` in preview exposes `/api/auth/test-otp` for QA — set to 0 in production.
- Test credentials in `/app/memory/test_credentials.md`.
