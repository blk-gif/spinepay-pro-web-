# SpinePay Pro Web — Project Context

## Live URL
https://spinepay-pro-web.onrender.com

## GitHub
https://github.com/blk-gif/spinepay-pro-web-

## Tech Stack
- Node.js + Express
- PostgreSQL (Render managed)
- express-session + connect-pg-simple
- bcrypt for passwords
- helmet + express-rate-limit
- @aws-sdk/client-s3 + multer for document storage
- @sendgrid/mail for email (legacy; being migrated)
- Paubox Email API (HIPAA-compliant, BAA in place) via native fetch — services/mail.js; requires PAUBOX_API_KEY + PAUBOX_SENDER_EMAIL env vars
- Chart.js for revenue charts

## Key Files
- server.js — main entry point
- db/pool.js — PostgreSQL connection
- db/migrations.js — all CREATE TABLE IF NOT EXISTS
- middleware/auth.js — requireAuth, requireAdmin
- middleware/audit.js — HIPAA audit logging
- routes/ — one file per feature
- public/js/layout.js — shared sidebar/topbar for ALL pages
- public/pages/ — all HTML pages

## Completed Features
- Auth: login, logout, session timeout 30min, rate limiting
- First login flow: password change → HIPAA sign → role confirm
- Role-based access: Admin sees everything, Staff sees subset
- Patients: CRUD with search
- Appointments: scheduling
- SOAP Notes: create/view for all staff
- Intake Forms
- Billing & Claims
- EOB Records
- Reports
- Revenue dashboard with Chart.js (admin only)
- Time Clock: staff clock in/out + admin approval panel
- Reminders: accessible to all staff
- Referrals
- Transportation
- PI Cases
- Waitlist
- Staff management: add, deactivate, delete
- Settings: practice info + staff accounts
- Documents: S3 upload/view/download with 7-year retention
- Automated daily PostgreSQL backup to S3 at 2AM ET, 7-year retention, admin UI in Settings
- Google Reviews automation: SMS+email sent 2hr after completed appointment, STOP opt-out via Twilio webhook, stats in Settings
- Shared layout.js sidebar on all pages — no flash
- HIPAA audit log on all PHI access
- Welcome email via SendGrid on staff creation

## Pending Features
- Prompt 7b: Document admin panel (review, bulk delete, retention)
- Prompt 10: Staff photo on website
- Prompt 11: SendGrid domain authentication
- Prompt 12: Redundancy/failover system
- Prompt 13: Local network multi-user mode

## Environment Variables (set in Render dashboard)
- DATABASE_URL — auto from Render PostgreSQL
- SESSION_SECRET — auto generated
- SENDGRID_API_KEY — set manually
- AWS_ACCESS_KEY_ID — set manually
- AWS_SECRET_ACCESS_KEY — set manually
- AWS_S3_BUCKET_NAME — set manually
- AWS_REGION — us-east-1
- NODE_ENV — production
- PORT — 10000
- PRACTICE_EMAIL — drward@waldenchiropractic.com

## Design
- Background: #1a1a1a
- Gold accent: #FFD700
- All pages use shared layout.js for sidebar/topbar
- Role-based sidebar hiding via admin-only CSS class

## Default Login
- Username: admin
- Password: Admin1234! (forced to change on first login)

## HIPAA Notes
- All patient data access logged to audit_log table
- Session expires after 30 minutes inactivity
- Passwords hashed with bcrypt (10 rounds)
- Documents encrypted at rest in S3 (AES256)
- 7-year retention tracking on all documents
- BAAs still needed: Render, SendGrid, AWS, Twilio, Stripe
