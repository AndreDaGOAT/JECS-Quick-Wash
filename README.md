# JECS Quick Wash — Enhanced Platform

> Luxury mobile car wash booking platform built for **jecsquickwash.github.io**

## 🔗 Links
- **Live Site**: https://jecsquickwash.github.io
- **Repository**: https://github.com/AndreDaGOAT/JECS-Quick-Wash
- **Parent Brand**: http://jubileeexecutivecarservice.com
- **Calendly**: https://calendly.com/aarmstrong1234/30min
- **Supabase Project**: https://rtbfevqhjsiqmtfrxdbd.supabase.co

---

## ✅ Phase 1 Features (This Release)

### 1. Service Request Number (SRN) System
- Auto-generated on every form submission
- Format: `JECS-YYYYMMDD-HHMMSS-XXXX`
- Human-readable, date-sortable, db-primary-key ready
- Displayed to user in banner, emailed via Formspree, stored in Supabase

### 2. Cloudflare Turnstile CAPTCHA
- Site Key: `0x4AAAAAADOPeJJPfrSYL0Wg`
- Server verification via Supabase Edge Function `verify-turnstile`
- Graceful degradation if edge function unavailable
- Failed attempts logged to `captcha_logs` table

### 3. Calendly Reintegration
- Form submits first → SRN generated → Calendly redirect
- SRN, name, email, service, address, notes pre-filled in Calendly URL
- State persisted in `localStorage` across redirect
- Post-Calendly return detected via referrer → booking status updated to `calendly_scheduled`

### 4. Geographic Scheduling (Phase 2 Architecture Ready)
- ZIP code extraction from address
- `cluster_key` stored per submission
- `latitude`, `longitude`, `place_id` captured for future routing
- Architecture supports Google Maps API, Mapbox, ArcGIS

---

## 🗄️ Supabase Schema

### `customers` table
```sql
CREATE TABLE customers (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  service_request_id    text UNIQUE NOT NULL,
  name                  text,
  email                 text,
  phone                 text,
  service               text,
  vehicle               text,
  notes                 text,
  address               text,
  latitude              float8,
  longitude             float8,
  place_id              text,
  zip_code              text,
  cluster_key           text,
  captcha_verified      boolean DEFAULT false,
  captcha_method        text,
  booking_status        text DEFAULT 'pending_calendly',
  calendly_returned_at  timestamptz,
  created_at            timestamptz DEFAULT now()
);
```

### `captcha_logs` table
```sql
CREATE TABLE captcha_logs (
  id      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  srn     text,
  reason  text,
  ts      timestamptz DEFAULT now()
);
```

---

## 🚀 Deploy to GitHub Pages

1. Push all files to `main` branch of `https://github.com/AndreDaGOAT/JECS-Quick-Wash`
2. Go to **Settings → Pages → Source: GitHub Actions**
3. The workflow at `.github/workflows/deploy-pages.yml` deploys automatically
4. Site live at: `https://jecsquickwash.github.io` (or configure custom domain)

### Supabase Edge Function: verify-turnstile
Deploy with Supabase CLI:
```bash
supabase login
supabase link --project-ref rtbfevqhjsiqmtfrxdbd
supabase functions deploy verify-turnstile
```

Edge function code (`supabase/functions/verify-turnstile/index.ts`):
```typescript
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const SECRET_KEY = Deno.env.get("TURNSTILE_SECRET_KEY") || "0x4AAAAAADOPeLZ8u1ipBqDvJme1v2bCZ2c";

serve(async (req) => {
  const { token } = await req.json();
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: SECRET_KEY, response: token }),
  });
  const data = await res.json();
  return new Response(JSON.stringify({ success: data.success }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
});
```

---

## 📁 File Structure
```
JECS-Quick-Wash/
├── index.html           ← Main page (hero, services, form)
├── about.html           ← About page
├── styles.css           ← Full luxury design system
├── script.js            ← Nav, geolocation, Google Places
├── supabase-submit.js   ← SRN, CAPTCHA, Calendly, Supabase
├── assets/              ← Images and SVGs
└── .github/
    └── workflows/
        └── deploy-pages.yml
```

---

## 🗺️ Roadmap

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | SRN Generation | ✅ Complete |
| 1 | Cloudflare Turnstile CAPTCHA | ✅ Complete |
| 1 | Calendly Reintegration + State Sync | ✅ Complete |
| 2 | Geographic Clustering | 🏗 Architecture Ready |
| 2 | Route Optimization | 📋 Planned |
| 3 | Rebooking Automation | 📋 Planned |
| 3 | Subscription / Loyalty Plans | 📋 Planned |
| 3 | AI Dispatch Optimization | 📋 Planned |
