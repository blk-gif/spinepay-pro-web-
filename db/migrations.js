'use strict';

const { pool } = require('./pool');

async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS staff (
        id          SERIAL PRIMARY KEY,
        first_name  TEXT NOT NULL,
        last_name   TEXT NOT NULL,
        username    TEXT UNIQUE NOT NULL,
        password    TEXT NOT NULL,
        role        TEXT NOT NULL DEFAULT 'Staff',
        email       TEXT,
        temp_password   BOOLEAN DEFAULT TRUE,
        hipaa_signed    BOOLEAN DEFAULT FALSE,
        hipaa_signed_at TIMESTAMPTZ,
        last_login      TIMESTAMPTZ,
        active          BOOLEAN DEFAULT TRUE,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS staff_hipaa (
        id             SERIAL PRIMARY KEY,
        staff_id       INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
        signature      TEXT NOT NULL,
        agreed_at      TIMESTAMPTZ NOT NULL,
        policy_version TEXT DEFAULT '1.0'
      );

      CREATE TABLE IF NOT EXISTS staff_login_history (
        id          SERIAL PRIMARY KEY,
        staff_id    INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
        logged_in_at TIMESTAMPTZ DEFAULT NOW(),
        ip_address  TEXT,
        success     BOOLEAN DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS patients (
        id            SERIAL PRIMARY KEY,
        first_name    TEXT NOT NULL,
        last_name     TEXT NOT NULL,
        dob           DATE,
        gender        TEXT,
        phone         TEXT,
        email         TEXT,
        address       TEXT,
        city          TEXT,
        state         TEXT,
        zip           TEXT,
        emergency_contact TEXT,
        emergency_phone   TEXT,
        insurance_name    TEXT,
        insurance_id      TEXT,
        group_number      TEXT,
        notes         TEXT,
        status        TEXT DEFAULT 'active',
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS appointments (
        id          SERIAL PRIMARY KEY,
        patient_id  INTEGER REFERENCES patients(id) ON DELETE SET NULL,
        patient_name TEXT,
        provider    TEXT DEFAULT 'Dr. Walden Bailey',
        date        DATE NOT NULL,
        time        TIME NOT NULL,
        duration    INTEGER DEFAULT 30,
        type        TEXT DEFAULT 'adjustment',
        status      TEXT DEFAULT 'scheduled',
        notes       TEXT,
        room        TEXT,
        confirmed   BOOLEAN DEFAULT FALSE,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS soap_notes (
        id            SERIAL PRIMARY KEY,
        patient_id    INTEGER REFERENCES patients(id) ON DELETE SET NULL,
        patient_name  TEXT,
        appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
        note_date     DATE,
        provider      TEXT,
        subjective    TEXT,
        objective     TEXT,
        assessment    TEXT,
        plan          TEXT,
        icd_codes     TEXT,
        cpt_codes     TEXT,
        voice_transcript TEXT,
        signed        BOOLEAN DEFAULT FALSE,
        signed_at     TIMESTAMPTZ,
        created_by    TEXT,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS intake_forms (
        id            SERIAL PRIMARY KEY,
        patient_id    INTEGER REFERENCES patients(id) ON DELETE SET NULL,
        full_name     TEXT,
        dob           DATE,
        gender        TEXT,
        address       TEXT,
        phone         TEXT,
        email         TEXT,
        insurance_provider TEXT,
        policy_number TEXT,
        group_number  TEXT,
        medical_history TEXT,
        current_medications TEXT,
        allergies     TEXT,
        reason_for_visit TEXT,
        pain_scale    INTEGER,
        prior_care    TEXT,
        hipaa_acknowledged BOOLEAN DEFAULT FALSE,
        signature     TEXT,
        signature_date DATE,
        submitted_at  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS billing_claims (
        id              SERIAL PRIMARY KEY,
        patient_id      INTEGER REFERENCES patients(id) ON DELETE SET NULL,
        patient_name    TEXT,
        insurance_name  TEXT,
        claim_number    TEXT UNIQUE,
        service_date    DATE,
        submitted_date  DATE,
        cpt_codes       TEXT,
        icd_codes       TEXT,
        billed_amount   NUMERIC(10,2) DEFAULT 0,
        paid_amount     NUMERIC(10,2) DEFAULT 0,
        status          TEXT DEFAULT 'pending',
        denial_reason   TEXT,
        resubmit_count  INTEGER DEFAULT 0,
        notes           TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS payments (
        id          SERIAL PRIMARY KEY,
        patient_id  INTEGER REFERENCES patients(id) ON DELETE SET NULL,
        claim_id    INTEGER REFERENCES billing_claims(id) ON DELETE SET NULL,
        amount      NUMERIC(10,2) NOT NULL,
        method      TEXT,
        reference   TEXT,
        date        DATE DEFAULT CURRENT_DATE,
        notes       TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS eob_records (
        id                   SERIAL PRIMARY KEY,
        patient_id           INTEGER REFERENCES patients(id) ON DELETE SET NULL,
        patient_name         TEXT,
        claim_id             INTEGER REFERENCES billing_claims(id) ON DELETE SET NULL,
        payer_name           TEXT,
        claim_number         TEXT,
        service_date         DATE,
        billed_amount        NUMERIC(10,2) DEFAULT 0,
        allowed_amount       NUMERIC(10,2) DEFAULT 0,
        paid_amount          NUMERIC(10,2) DEFAULT 0,
        patient_resp         NUMERIC(10,2) DEFAULT 0,
        adjustment           NUMERIC(10,2) DEFAULT 0,
        denial_reason        TEXT,
        discrepancy_flag     BOOLEAN DEFAULT FALSE,
        discrepancy_notes    TEXT,
        status               TEXT DEFAULT 'received',
        received_date        DATE,
        eob_file_path        TEXT,
        created_at           TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS referrals (
        id               SERIAL PRIMARY KEY,
        patient_id       INTEGER REFERENCES patients(id) ON DELETE SET NULL,
        patient_name     TEXT,
        type             TEXT,
        recipient_name   TEXT,
        recipient_email  TEXT,
        recipient_phone  TEXT,
        reason           TEXT,
        status           TEXT DEFAULT 'pending',
        sent_date        DATE,
        notes            TEXT,
        created_at       TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS pi_cases (
        id                  SERIAL PRIMARY KEY,
        patient_id          INTEGER REFERENCES patients(id) ON DELETE SET NULL,
        patient_name        TEXT,
        date_of_accident    DATE,
        accident_type       TEXT,
        accident_description TEXT,
        attorney_name       TEXT,
        attorney_firm       TEXT,
        attorney_phone      TEXT,
        attorney_email      TEXT,
        insurance_company   TEXT,
        claim_number        TEXT,
        adjuster_name       TEXT,
        adjuster_phone      TEXT,
        policy_limit        NUMERIC(10,2) DEFAULT 0,
        case_number         TEXT,
        lien_amount         NUMERIC(10,2) DEFAULT 0,
        settlement_amount   NUMERIC(10,2) DEFAULT 0,
        case_status         TEXT DEFAULT 'open',
        notes               TEXT,
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS waitlist (
        id           SERIAL PRIMARY KEY,
        patient_id   INTEGER REFERENCES patients(id) ON DELETE SET NULL,
        patient_name TEXT,
        phone        TEXT,
        email        TEXT,
        desired_date DATE,
        desired_time TIME,
        provider     TEXT,
        reason       TEXT,
        urgency      TEXT DEFAULT 'normal',
        status       TEXT DEFAULT 'waiting',
        notified_at  TIMESTAMPTZ,
        notes        TEXT,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS transportation (
        id              SERIAL PRIMARY KEY,
        patient_id      INTEGER REFERENCES patients(id) ON DELETE SET NULL,
        appointment_id  INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
        patient_name    TEXT,
        pickup_address  TEXT,
        pickup_time     TIMESTAMPTZ,
        dropoff_address TEXT,
        driver_name     TEXT,
        driver_notes    TEXT,
        status          TEXT DEFAULT 'requested',
        created_at      TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS time_clock (
        id          SERIAL PRIMARY KEY,
        staff_id    INTEGER REFERENCES staff(id) ON DELETE SET NULL,
        staff_name  TEXT,
        clock_in    TIMESTAMPTZ DEFAULT NOW(),
        clock_out   TIMESTAMPTZ,
        break_start TIMESTAMPTZ,
        break_end   TIMESTAMPTZ,
        total_hours NUMERIC(5,2),
        notes       TEXT,
        approved    BOOLEAN DEFAULT FALSE,
        approved_by TEXT,
        approved_at TIMESTAMPTZ,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS reminder_templates (
        id            SERIAL PRIMARY KEY,
        name          TEXT NOT NULL,
        type          TEXT DEFAULT 'sms',
        trigger_hours INTEGER DEFAULT 24,
        subject       TEXT,
        body          TEXT NOT NULL,
        active        BOOLEAN DEFAULT TRUE,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS reminder_log (
        id             SERIAL PRIMARY KEY,
        appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
        patient_id     INTEGER REFERENCES patients(id) ON DELETE SET NULL,
        template_id    INTEGER REFERENCES reminder_templates(id) ON DELETE SET NULL,
        type           TEXT,
        recipient      TEXT,
        message        TEXT,
        status         TEXT DEFAULT 'sent',
        sent_at        TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS hcfa_forms (
        id           SERIAL PRIMARY KEY,
        soap_note_id INTEGER REFERENCES soap_notes(id) ON DELETE SET NULL,
        patient_id   INTEGER REFERENCES patients(id) ON DELETE SET NULL,
        form_data    TEXT,
        status       TEXT DEFAULT 'Draft',
        created_by   TEXT,
        fax_recipient TEXT,
        fax_sent_at  TIMESTAMPTZ,
        fax_sent_by  TEXT,
        printed_at   TIMESTAMPTZ,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS documents (
        id             SERIAL PRIMARY KEY,
        patient_id     INTEGER REFERENCES patients(id),
        patient_name   TEXT,
        document_type  TEXT NOT NULL,
        file_name      TEXT NOT NULL,
        file_size      INTEGER,
        mime_type      TEXT,
        s3_key         TEXT NOT NULL,
        s3_bucket      TEXT,
        uploaded_by    INTEGER REFERENCES staff(id),
        uploaded_by_name TEXT,
        notes          TEXT,
        retention_date DATE,
        deleted        BOOLEAN DEFAULT false,
        deleted_at     TIMESTAMP,
        deleted_by     INTEGER,
        created_at     TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_documents_patient ON documents(patient_id);
      CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type);

      CREATE TABLE IF NOT EXISTS audit_log (
        id          SERIAL PRIMARY KEY,
        staff_id    INTEGER,
        staff_name  TEXT,
        action      TEXT NOT NULL,
        resource    TEXT NOT NULL,
        resource_id TEXT,
        ip_address  TEXT,
        user_agent  TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS settings (
        key        TEXT PRIMARY KEY,
        value      TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS backup_log (
        id            SERIAL PRIMARY KEY,
        filename      TEXT NOT NULL,
        s3_key        TEXT,
        size_bytes    BIGINT DEFAULT 0,
        status        TEXT DEFAULT 'success',
        error_message TEXT,
        completed_at  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_backup_log_completed ON backup_log(completed_at DESC);

      CREATE TABLE IF NOT EXISTS review_requests (
        id             SERIAL PRIMARY KEY,
        patient_id     INTEGER REFERENCES patients(id),
        patient_name   TEXT NOT NULL,
        patient_phone  TEXT,
        patient_email  TEXT,
        appointment_id INTEGER REFERENCES appointments(id),
        channel        TEXT DEFAULT 'SMS',
        status         TEXT DEFAULT 'pending',
        sent_at        TIMESTAMPTZ,
        error_message  TEXT,
        opted_out      BOOLEAN DEFAULT FALSE,
        created_at     TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS review_opt_outs (
        id           SERIAL PRIMARY KEY,
        phone        TEXT UNIQUE,
        opted_out_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_review_requests_patient ON review_requests(patient_id);
      CREATE INDEX IF NOT EXISTS idx_review_requests_status  ON review_requests(status);
    `);

    // ── Column additions for existing databases ───────────────────────────────
    await client.query(`ALTER TABLE time_clock ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`).catch(() => {});


    // Default practice settings
    await client.query(`
      INSERT INTO settings (key, value) VALUES
        ('PRACTICE_NAME', 'Walden Bailey Chiropractic'),
        ('PRACTICE_ADDRESS', '1086 Walden Ave Suite 1'),
        ('PRACTICE_CITY', 'Buffalo'),
        ('PRACTICE_STATE', 'NY'),
        ('PRACTICE_ZIP', '14211'),
        ('PRACTICE_PHONE', '(716) 893-9200'),
        ('PRACTICE_EMAIL', 'drward@waldenbaileychiropratic.com'),
        ('BILLING_PROVIDER_NAME', 'Walden Bailey Chiropractic')
      ON CONFLICT DO NOTHING;
    `);

    await client.query('COMMIT');
    console.log('[Migrations] All tables ready');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Migrations] Failed:', err.message);
    throw err;
  } finally {
    client.release();
  }

  // ── Run outside the transaction so a failed constraint add doesn't abort ──
  // Dedup first (required before adding unique constraint)
  await pool.query(`
    DELETE FROM reminder_templates
    WHERE id NOT IN (
      SELECT MAX(id)
      FROM reminder_templates
      GROUP BY name, type, trigger_hours
    )
  `).catch(err => console.error('[Migrations] Dedup reminder_templates:', err.message));

  // Add unique constraint now that duplicates are gone
  await pool.query(`
    ALTER TABLE reminder_templates
    ADD CONSTRAINT unique_reminder_template
    UNIQUE (name, type, trigger_hours)
  `).catch(() => {}); // silently skip if constraint already exists

  // Seed default reminder templates (safe now that constraint exists)
  await pool.query(`
    INSERT INTO reminder_templates (name, type, trigger_hours, subject, body) VALUES
      ('24hr SMS', 'sms', 24, NULL, 'Hi {{patient_name}}, reminder: appointment tomorrow at {{time}}. Reply STOP to opt out.'),
      ('48hr Email', 'email', 48, 'Appointment Reminder — Walden Bailey Chiropractic', 'Dear {{patient_name}},\n\nThis is a reminder of your appointment on {{date}} at {{time}}.\n\nWalden Bailey Chiropractic\n(716) 893-9200')
    ON CONFLICT (name, type, trigger_hours) DO NOTHING
  `).catch(err => console.error('[Migrations] Seed reminder_templates:', err.message));

  // ── Add updated_at to tables that need it for review automation ──────────
  const tablesNeedingUpdatedAt = ['appointments', 'patients', 'billing_claims', 'soap_notes'];
  for (const table of tablesNeedingUpdatedAt) {
    await pool.query(
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`
    ).catch(err => console.error(`[Migrations] updated_at on ${table}:`, err.message));
  }

  // ── Auto-update trigger on appointments.updated_at ────────────────────────
  await pool.query(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE 'plpgsql'
  `).catch(err => console.error('[Migrations] updated_at trigger function:', err.message));

  await pool.query(`
    DROP TRIGGER IF EXISTS update_appointments_updated_at ON appointments;
    CREATE TRIGGER update_appointments_updated_at
      BEFORE UPDATE ON appointments
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
  `).catch(err => console.error('[Migrations] updated_at trigger:', err.message));
}

module.exports = runMigrations;
