-- Schema version: v1.2
-- ============================================================
-- CityUHK Events Hub ticketing schema. See docs/database-design.md for the data model.
-- Target: MySQL 8.0+ / MariaDB 10.5+ (InnoDB)
-- Conventions:
--   1. All amounts are BIGINT integer cents; currency is a CHAR(3) ISO code
--   2. All timestamps are DATETIME(3), stored in UTC; the presentation layer converts to Asia/Hong_Kong
--   3. Historical data is immutable: foreign keys use ON DELETE RESTRICT / ON UPDATE RESTRICT
--   4. Enumerations use VARCHAR + CHECK constraints to prevent invalid values
--   5. The 17 tables include generated helper columns, which are excluded from business-field counts
--   6. Strict mode must be enabled: under the default MariaDB/MySQL sql_mode, NULL written to a NOT NULL column is silently converted to
--      a zero date or empty value, making CHECK/NOT NULL ineffective. Application connections must set the same sql_mode
-- ============================================================

SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
-- Timestamps are stored in UTC: the session time zone is fixed at +00:00 so NOW() does not use the machine local time zone
SET SESSION time_zone = '+00:00';

CREATE DATABASE IF NOT EXISTS ticketing_system
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE ticketing_system;

-- ------------------------------------------------------------
-- 1. venues
-- ------------------------------------------------------------
CREATE TABLE venues (
  venue_id    BIGINT NOT NULL AUTO_INCREMENT,
  name        VARCHAR(100) NOT NULL,
  row_count   INT NULL COMMENT 'Total rows in the layout, used by the frontend to render the seat map',
  col_count   INT NULL COMMENT 'Maximum columns per row in the layout',
  layout_json TEXT NULL COMMENT 'Layout metadata (aisles, zone boundaries), optional',
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (venue_id),
  CONSTRAINT uk_venues_name UNIQUE (name)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 2. users
-- ------------------------------------------------------------
CREATE TABLE users (
  user_id       BIGINT NOT NULL AUTO_INCREMENT,
  user_name     VARCHAR(50) NOT NULL COMMENT 'Login account, globally unique',
  password_hash VARCHAR(255) NOT NULL COMMENT 'Password hash; plaintext is never stored',
  display_name  VARCHAR(50) NULL COMMENT 'Display name used on the profile page',
  token_version INT NOT NULL DEFAULT 0 COMMENT 'JWT version; incremented on logout, invalidating old tokens immediately',
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  CONSTRAINT uk_users_user_name UNIQUE (user_name)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 3. events
-- ------------------------------------------------------------
CREATE TABLE events (
  event_id    BIGINT NOT NULL AUTO_INCREMENT,
  name        VARCHAR(100) NOT NULL,
  description TEXT NULL,
  organizer   VARCHAR(200) NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (event_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 4. seats
-- ------------------------------------------------------------
CREATE TABLE seats (
  seat_id        BIGINT NOT NULL AUTO_INCREMENT,
  venue_id       BIGINT NOT NULL,
  region         VARCHAR(50) NOT NULL COMMENT 'Zone, e.g. Zone A',
  row_no         VARCHAR(10) NOT NULL COMMENT 'Row number',
  seat_no        VARCHAR(10) NOT NULL COMMENT 'Seat number within the row',
  coordinates    VARCHAR(50) NOT NULL COMMENT 'Layout coordinates, e.g. 3,5',
  adjacent_group VARCHAR(50) NULL COMMENT 'Identifier for a contiguous physical seat segment in the same row without an aisle; used for adjacent-seat recommendation',
  PRIMARY KEY (seat_id),
  CONSTRAINT uk_seats_position UNIQUE (venue_id, region, row_no, seat_no),
  CONSTRAINT fk_seats_venue FOREIGN KEY (venue_id) REFERENCES venues (venue_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_seats_row_no CHECK (row_no <> ''),
  CONSTRAINT chk_seats_seat_no CHECK (seat_no <> '')
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 5. performances
-- ------------------------------------------------------------
CREATE TABLE performances (
  performance_id   BIGINT NOT NULL AUTO_INCREMENT,
  event_id         BIGINT NOT NULL,
  venue_id         BIGINT NOT NULL,
  starts_at        DATETIME(3) NOT NULL COMMENT 'Start time',
  sale_start_at    DATETIME(3) NOT NULL COMMENT 'Sale start time',
  sale_end_at      DATETIME(3) NOT NULL COMMENT 'Sales deadline; must be earlier than the start time',
  checkin_start_at DATETIME(3) NOT NULL COMMENT 'Check-in window start',
  checkin_end_at   DATETIME(3) NOT NULL COMMENT 'Check-in window end (left-closed, right-open)',
  status           VARCHAR(20) NOT NULL COMMENT 'DRAFT/PUBLISHED/SALES_PAUSED/FINISHED',
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  published_at     DATETIME(3) NULL,
  PRIMARY KEY (performance_id),
  CONSTRAINT fk_performances_event FOREIGN KEY (event_id) REFERENCES events (event_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_performances_venue FOREIGN KEY (venue_id) REFERENCES venues (venue_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_performances_status CHECK (status IN ('DRAFT','PUBLISHED','SALES_PAUSED','FINISHED')),
  CONSTRAINT chk_performances_windows CHECK (
    sale_start_at < sale_end_at
    AND sale_end_at < starts_at
    AND checkin_start_at < checkin_end_at
  )
) ENGINE=InnoDB;

CREATE INDEX idx_performances_event ON performances (event_id, starts_at);
CREATE INDEX idx_performances_venue ON performances (venue_id, starts_at);
CREATE INDEX idx_performances_status ON performances (status, sale_end_at);

-- ------------------------------------------------------------
-- 6. event_media
-- ------------------------------------------------------------
CREATE TABLE event_media (
  media_id      BIGINT NOT NULL AUTO_INCREMENT,
  event_id      BIGINT NOT NULL,
  media_type    VARCHAR(20) NOT NULL COMMENT 'COVER/GALLERY',
  url           VARCHAR(500) NOT NULL,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  cover_event_id BIGINT AS (CASE WHEN media_type = 'COVER' THEN event_id ELSE NULL END) STORED
    COMMENT 'Implementation helper column: ensures at most one cover per event',
  PRIMARY KEY (media_id),
  CONSTRAINT fk_event_media_event FOREIGN KEY (event_id) REFERENCES events (event_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_event_media_type CHECK (media_type IN ('COVER','GALLERY')),
  CONSTRAINT uk_event_media_cover UNIQUE (cover_event_id),
  CONSTRAINT uk_event_media_order UNIQUE (event_id, media_type, sort_order)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 7. role_assignments
-- Note: administrators and buyers do not belong to a performance; performance_id may be NULL;
--       generated column performance_key maps NULL to zero, solving MySQL unique-index behavior where NULLs are not considered duplicates
-- ------------------------------------------------------------
CREATE TABLE role_assignments (
  assignment_id  BIGINT NOT NULL AUTO_INCREMENT,
  user_id        BIGINT NOT NULL,
  role           VARCHAR(20) NOT NULL COMMENT 'USER/ADMIN/CHECKER',
  performance_id BIGINT NULL COMMENT 'Required only for CHECKER; NULL for other roles',
  assigned_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  revoked_at     DATETIME(3) NULL COMMENT 'Authorization revocation time; history is retained and rows are not deleted',
  performance_key BIGINT AS (IFNULL(performance_id, 0)) STORED
    COMMENT 'Implementation helper column: participates in the unique constraint',
  PRIMARY KEY (assignment_id),
  CONSTRAINT fk_role_assignments_user FOREIGN KEY (user_id) REFERENCES users (user_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_role_assignments_performance FOREIGN KEY (performance_id) REFERENCES performances (performance_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_role_assignments_role CHECK (role IN ('USER','ADMIN','CHECKER')),
  CONSTRAINT chk_role_assignments_perf CHECK (role <> 'CHECKER' OR performance_id IS NOT NULL),
  CONSTRAINT chk_role_assignments_revoke CHECK (revoked_at IS NULL OR revoked_at >= assigned_at),
  CONSTRAINT uk_role_assignments UNIQUE (user_id, role, performance_key)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 8. price_tiers
-- ------------------------------------------------------------
CREATE TABLE price_tiers (
  tier_id        BIGINT NOT NULL AUTO_INCREMENT,
  performance_id BIGINT NOT NULL,
  tier_name      VARCHAR(50) NOT NULL,
  current_price  BIGINT NOT NULL COMMENT 'Current unit price (cents)',
  currency       CHAR(3) NOT NULL DEFAULT 'HKD',
  PRIMARY KEY (tier_id),
  CONSTRAINT fk_price_tiers_performance FOREIGN KEY (performance_id) REFERENCES performances (performance_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT uk_price_tiers_name UNIQUE (performance_id, tier_name),
  CONSTRAINT chk_price_tiers_price CHECK (current_price >= 0),
  CONSTRAINT chk_price_tiers_currency CHECK (CHAR_LENGTH(currency) = 3)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 9. orders
-- request_hash distinguishes "same idempotency key, different content": on a unique-key conflict, compare hashes to decide whether to return the original order or reject
-- ------------------------------------------------------------
CREATE TABLE orders (
  order_id        BIGINT NOT NULL AUTO_INCREMENT,
  user_id         BIGINT NOT NULL,
  performance_id  BIGINT NOT NULL,
  status          VARCHAR(20) NOT NULL COMMENT 'PENDING_PAYMENT/PAID/CANCELLED/EXPIRED/REFUND_PENDING/REFUNDED',
  total_amount    BIGINT NOT NULL COMMENT 'Order total (cents)',
  currency        CHAR(3) NOT NULL DEFAULT 'HKD',
  expires_at      DATETIME(3) NOT NULL COMMENT 'Payment deadline; persisted server-side',
  idempotency_key VARCHAR(100) NOT NULL COMMENT 'Create-request identifier',
  request_hash    CHAR(64) NOT NULL COMMENT 'Request content SHA-256 (seat set + performance + amount)',
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  paid_at         DATETIME(3) NULL,
  closed_at       DATETIME(3) NULL,
  PRIMARY KEY (order_id),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (user_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_orders_performance FOREIGN KEY (performance_id) REFERENCES performances (performance_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT uk_orders_idempotency UNIQUE (user_id, idempotency_key),
  CONSTRAINT chk_orders_status CHECK (status IN ('PENDING_PAYMENT','PAID','CANCELLED','EXPIRED','REFUND_PENDING','REFUNDED')),
  CONSTRAINT chk_orders_amount CHECK (total_amount >= 0),
  CONSTRAINT chk_orders_currency CHECK (CHAR_LENGTH(currency) = 3),
  CONSTRAINT chk_orders_expires CHECK (expires_at > created_at)
) ENGINE=InnoDB;

CREATE INDEX idx_orders_expiry ON orders (status, expires_at);
CREATE INDEX idx_orders_user ON orders (user_id, status, created_at);
CREATE INDEX idx_orders_performance ON orders (performance_id, status);

-- ------------------------------------------------------------
-- 10. session_seats
-- ------------------------------------------------------------
CREATE TABLE session_seats (
  session_seat_id    BIGINT NOT NULL AUTO_INCREMENT,
  performance_id     BIGINT NOT NULL,
  seat_id            BIGINT NOT NULL,
  tier_id            BIGINT NOT NULL COMMENT 'Must belong to a price tier of the same performance (cross-table constraint enforced by the service layer)',
  session_seat_status VARCHAR(20) NOT NULL COMMENT 'AVAILABLE/HELD/SOLD/BLOCKED',
  holder_order_id    BIGINT NULL COMMENT 'Current holding order; non-NULL only when HELD',
  hold_expires_at    DATETIME(3) NULL COMMENT 'Hold deadline; non-NULL only when HELD',
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (session_seat_id),
  CONSTRAINT fk_session_seats_performance FOREIGN KEY (performance_id) REFERENCES performances (performance_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_session_seats_seat FOREIGN KEY (seat_id) REFERENCES seats (seat_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_session_seats_tier FOREIGN KEY (tier_id) REFERENCES price_tiers (tier_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_session_seats_order FOREIGN KEY (holder_order_id) REFERENCES orders (order_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT uk_session_seats UNIQUE (performance_id, seat_id),
  CONSTRAINT chk_session_seats_status CHECK (session_seat_status IN ('AVAILABLE','HELD','SOLD','BLOCKED')),
  CONSTRAINT chk_session_seats_held CHECK (
    session_seat_status <> 'HELD'
    OR (holder_order_id IS NOT NULL AND hold_expires_at IS NOT NULL)
  ),
  CONSTRAINT chk_session_seats_free CHECK (
    session_seat_status = 'HELD' OR holder_order_id IS NULL
  )
) ENGINE=InnoDB;

CREATE INDEX idx_session_seats_status ON session_seats (performance_id, session_seat_status);
CREATE INDEX idx_session_seats_holder ON session_seats (holder_order_id);
CREATE INDEX idx_session_seats_expiry ON session_seats (session_seat_status, hold_expires_at);

-- ------------------------------------------------------------
-- 11. order_items
-- ------------------------------------------------------------
CREATE TABLE order_items (
  order_item_id   BIGINT NOT NULL AUTO_INCREMENT,
  order_id        BIGINT NOT NULL,
  session_seat_id BIGINT NOT NULL,
  price_snapshot  BIGINT NOT NULL COMMENT 'Transaction unit-price snapshot (cents); unaffected by later price changes',
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (order_item_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders (order_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_order_items_session_seat FOREIGN KEY (session_seat_id) REFERENCES session_seats (session_seat_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT uk_order_items UNIQUE (order_id, session_seat_id),
  CONSTRAINT chk_order_items_price CHECK (price_snapshot >= 0)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 12. payment_attempts
-- ------------------------------------------------------------
CREATE TABLE payment_attempts (
  attempt_id        BIGINT NOT NULL AUTO_INCREMENT,
  order_id          BIGINT NOT NULL,
  payment_ref       VARCHAR(100) NOT NULL COMMENT 'Payment provider reference',
  amount            BIGINT NOT NULL COMMENT 'Payment amount (cents)',
  currency          CHAR(3) NOT NULL DEFAULT 'HKD' COMMENT 'Payment currency snapshot',
  result            VARCHAR(20) NOT NULL COMMENT 'PENDING/SUCCEEDED/FAILED',
  handling_category VARCHAR(20) NULL COMMENT 'NORMAL/AWAITING_REFUND',
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (attempt_id),
  CONSTRAINT fk_payment_attempts_order FOREIGN KEY (order_id) REFERENCES orders (order_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT uk_payment_attempts_ref UNIQUE (payment_ref),
  CONSTRAINT chk_payment_attempts_result CHECK (result IN ('PENDING','SUCCEEDED','FAILED')),
  CONSTRAINT chk_payment_attempts_category CHECK (
    handling_category IS NULL OR handling_category IN ('NORMAL','AWAITING_REFUND')
  ),
  CONSTRAINT chk_payment_attempts_amount CHECK (amount > 0),
  CONSTRAINT chk_payment_attempts_currency CHECK (CHAR_LENGTH(currency) = 3)
) ENGINE=InnoDB;

CREATE INDEX idx_payment_attempts_order ON payment_attempts (order_id, created_at);
CREATE INDEX idx_payment_attempts_result ON payment_attempts (result);

-- ------------------------------------------------------------
-- 13. payment_notifications
-- ------------------------------------------------------------
CREATE TABLE payment_notifications (
  notice_id         BIGINT NOT NULL AUTO_INCREMENT,
  source            VARCHAR(50) NOT NULL COMMENT 'Notification source identifier',
  notification_id   VARCHAR(100) NOT NULL COMMENT 'Source-side notification identifier',
  payment_attempt_id BIGINT NOT NULL,
  received_at       DATETIME(3) NOT NULL COMMENT 'Receive time; used for out-of-order detection and reconciliation',
  processed_at      DATETIME(3) NULL COMMENT 'Processing completion time',
  processed_result  VARCHAR(20) NOT NULL COMMENT 'PENDING/APPLIED/DUPLICATE/REJECTED/FAILED/IGNORED',
  payload_digest    CHAR(64) NULL COMMENT 'Digest of the original notification payload, used for verification and audit',
  payload_json      TEXT NULL COMMENT 'Original notification JSON, used for automatic reconciliation replay; contains no payment secret',
  PRIMARY KEY (notice_id),
  CONSTRAINT fk_payment_notifications_attempt FOREIGN KEY (payment_attempt_id) REFERENCES payment_attempts (attempt_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT uk_payment_notifications UNIQUE (source, notification_id),
  CONSTRAINT chk_payment_notifications_result CHECK (
    processed_result IN ('PENDING','APPLIED','DUPLICATE','REJECTED','FAILED','IGNORED')
  )
) ENGINE=InnoDB;

CREATE INDEX idx_payment_notifications_result ON payment_notifications (processed_result);
CREATE INDEX idx_payment_notifications_attempt ON payment_notifications (payment_attempt_id, received_at);

-- ------------------------------------------------------------
-- 14. tickets
-- ------------------------------------------------------------
CREATE TABLE tickets (
  ticket_id        BIGINT NOT NULL AUTO_INCREMENT,
  order_item_id    BIGINT NOT NULL,
  ticket_code_hash CHAR(64) NOT NULL COMMENT 'Ticket code SHA-256; plaintext is never stored',
  status           VARCHAR(20) NOT NULL COMMENT 'VALID/USED/REFUND_PENDING/VOID',
  issued_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (ticket_id),
  CONSTRAINT fk_tickets_order_item FOREIGN KEY (order_item_id) REFERENCES order_items (order_item_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT uk_tickets_order_item UNIQUE (order_item_id),
  CONSTRAINT uk_tickets_code UNIQUE (ticket_code_hash),
  CONSTRAINT chk_tickets_status CHECK (status IN ('VALID','USED','REFUND_PENDING','VOID')),
  CONSTRAINT chk_tickets_hash_len CHECK (CHAR_LENGTH(ticket_code_hash) = 64)
) ENGINE=InnoDB;

CREATE INDEX idx_tickets_status ON tickets (status);

-- ------------------------------------------------------------
-- 15. checkins
-- ------------------------------------------------------------
CREATE TABLE checkins (
  checkin_id    BIGINT NOT NULL AUTO_INCREMENT,
  ticket_id     BIGINT NOT NULL,
  checker_id    BIGINT NOT NULL,
  checked_in_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (checkin_id),
  CONSTRAINT fk_checkins_ticket FOREIGN KEY (ticket_id) REFERENCES tickets (ticket_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_checkins_checker FOREIGN KEY (checker_id) REFERENCES users (user_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT uk_checkins_ticket UNIQUE (ticket_id)
) ENGINE=InnoDB;

CREATE INDEX idx_checkins_checker ON checkins (checker_id, checked_in_at);

-- ------------------------------------------------------------
-- 16. refunds
-- ------------------------------------------------------------
CREATE TABLE refunds (
  refund_id         BIGINT NOT NULL AUTO_INCREMENT,
  order_id          BIGINT NULL COMMENT 'Order associated with a full-order refund; may be NULL for anomalous refunds',
  payment_attempt_id BIGINT NOT NULL COMMENT 'Original payment attempt',
  reason            VARCHAR(255) NULL,
  amount            BIGINT NOT NULL COMMENT 'Refund amount (cents); the cumulative amount must not exceed the original payment',
  idempotency_key   VARCHAR(100) NOT NULL,
  status            VARCHAR(20) NOT NULL COMMENT 'PENDING/SUCCEEDED/FAILED',
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (refund_id),
  CONSTRAINT fk_refunds_order FOREIGN KEY (order_id) REFERENCES orders (order_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_refunds_attempt FOREIGN KEY (payment_attempt_id) REFERENCES payment_attempts (attempt_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT uk_refunds_idempotency UNIQUE (idempotency_key),
  CONSTRAINT chk_refunds_status CHECK (status IN ('PENDING','SUCCEEDED','FAILED')),
  CONSTRAINT chk_refunds_amount CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE INDEX idx_refunds_status ON refunds (status, created_at);
CREATE INDEX idx_refunds_order ON refunds (order_id);

-- ------------------------------------------------------------
-- 17. audit_logs (no foreign keys; loosely coupled)
-- ------------------------------------------------------------
CREATE TABLE audit_logs (
  log_id        BIGINT NOT NULL AUTO_INCREMENT,
  actor_type    VARCHAR(20) NOT NULL COMMENT 'USER/ADMIN/CHECKER/SYSTEM',
  actor_id      BIGINT NULL COMMENT 'User ID; NULL for SYSTEM',
  object_type   VARCHAR(40) NOT NULL COMMENT 'ORDER/TICKET/SEAT/REFUND/PAYMENT/ROLE, etc.',
  object_id     BIGINT NULL COMMENT 'Business object primary key, for precise filtering',
  action        VARCHAR(40) NOT NULL,
  state_summary VARCHAR(500) NOT NULL COMMENT 'State-change summary (old value to new value)',
  occurred_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  request_id    VARCHAR(100) NOT NULL COMMENT 'Associated request identifier',
  PRIMARY KEY (log_id),
  CONSTRAINT chk_audit_actor_type CHECK (actor_type IN ('USER','ADMIN','CHECKER','SYSTEM'))
) ENGINE=InnoDB;

CREATE INDEX idx_audit_object ON audit_logs (object_type, object_id, occurred_at);
CREATE INDEX idx_audit_request ON audit_logs (request_id);
CREATE INDEX idx_audit_time ON audit_logs (occurred_at);

-- ============================================================
-- Notes (constraints DDL cannot express; enforced by the service layer/jobs):
--   1. session_seats.tier_id must belong to a price tier of the same performance_id
--   2. Seats in the same order must belong to the same performance (validated by the creation transaction)
--   3. The cumulative refund amount must not exceed the successful payment amount (BR-11)
--   4. An order may have at most one payment attempt with an undetermined result at a time
--   5. Check-in window evaluation uses server time, left-closed and right-open
-- ============================================================
