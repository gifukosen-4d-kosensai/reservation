CREATE TABLE IF NOT EXISTS slots (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK(capacity > 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  slot_id TEXT NOT NULL REFERENCES slots(id),
  email_ciphertext TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  passphrase_hash TEXT NOT NULL,
  device_hash TEXT NOT NULL,
  party_size INTEGER NOT NULL CHECK(party_size BETWEEN 1 AND 20),
  booking_type TEXT NOT NULL DEFAULT 'general' CHECK(booking_type IN ('family','general')),
  status TEXT NOT NULL CHECK(status IN ('confirmed','cancelled')),
  email_status TEXT NOT NULL DEFAULT 'pending' CHECK(email_status IN ('pending','sent','failed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One active reservation per normalized email and per browser-generated device ID.
CREATE UNIQUE INDEX IF NOT EXISTS ux_res_email_confirmed
ON reservations(email_hash) WHERE status = 'confirmed';
CREATE UNIQUE INDEX IF NOT EXISTS ux_res_device_confirmed
ON reservations(device_hash) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS ix_res_slot_status ON reservations(slot_id, status);

CREATE TABLE IF NOT EXISTS checkins (
  reservation_id TEXT PRIMARY KEY REFERENCES reservations(id),
  checked_in_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS family_code (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  code_ciphertext TEXT NOT NULL,
  code_hash TEXT NOT NULL
);

