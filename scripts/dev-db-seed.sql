-- Demo schema for JARVIS development and tests (see PROMPT.md §7).
-- Recreated from scratch on every seed.
DROP DATABASE IF EXISTS jarvis_demo;
CREATE DATABASE jarvis_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE jarvis_demo;

CREATE TABLE ContactDetails (
  contact_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  first_name VARCHAR(80) NOT NULL,
  last_name  VARCHAR(80) NOT NULL,
  email      VARCHAR(190) NOT NULL,
  status     ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (contact_id),
  UNIQUE KEY uq_contact_email (email),
  KEY idx_contact_name (last_name, first_name)
) ENGINE=InnoDB COMMENT='People';

-- one-to-many
CREATE TABLE ContactPhones (
  phone_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  contact_id   INT UNSIGNED NOT NULL,
  country_code VARCHAR(5) NOT NULL DEFAULT '+91',
  phone_number VARCHAR(20) NOT NULL,
  PRIMARY KEY (phone_id),
  KEY idx_phone_contact (contact_id),
  CONSTRAINT fk_phone_contact FOREIGN KEY (contact_id) REFERENCES ContactDetails (contact_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE ContactEmails (
  email_id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  contact_id    INT UNSIGNED NOT NULL,
  email_address VARCHAR(190) NOT NULL,
  PRIMARY KEY (email_id),
  KEY idx_email_contact (contact_id),
  CONSTRAINT fk_email_contact FOREIGN KEY (contact_id) REFERENCES ContactDetails (contact_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- one-to-one (the FK column is also the primary key)
CREATE TABLE ContactProfiles (
  contact_id INT UNSIGNED NOT NULL,
  bio        TEXT NULL,
  birthday   DATE NULL,
  settings   JSON NULL,
  PRIMARY KEY (contact_id),
  CONSTRAINT fk_profile_contact FOREIGN KEY (contact_id) REFERENCES ContactDetails (contact_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- many-to-many through a junction table
CREATE TABLE Tags (
  tag_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name   VARCHAR(40) NOT NULL,
  PRIMARY KEY (tag_id),
  UNIQUE KEY uq_tag_name (name)
) ENGINE=InnoDB;

CREATE TABLE ContactTags (
  contact_id INT UNSIGNED NOT NULL,
  tag_id     SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (contact_id, tag_id),
  KEY idx_ct_tag (tag_id),
  CONSTRAINT fk_ct_contact FOREIGN KEY (contact_id) REFERENCES ContactDetails (contact_id) ON DELETE CASCADE,
  CONSTRAINT fk_ct_tag FOREIGN KEY (tag_id) REFERENCES Tags (tag_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- composite primary key and composite foreign key
CREATE TABLE Orders (
  order_id    INT UNSIGNED NOT NULL,
  region_code CHAR(2) NOT NULL,
  contact_id  INT UNSIGNED NULL,
  total       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  placed_at   DATETIME NOT NULL,
  PRIMARY KEY (order_id, region_code),
  KEY idx_order_contact (contact_id),
  CONSTRAINT fk_order_contact FOREIGN KEY (contact_id) REFERENCES ContactDetails (contact_id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE OrderItems (
  item_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id    INT UNSIGNED NOT NULL,
  region_code CHAR(2) NOT NULL,
  sku         VARCHAR(40) NOT NULL,
  quantity    INT NOT NULL DEFAULT 1,
  unit_price  DECIMAL(10,2) NOT NULL,
  line_total  DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  PRIMARY KEY (item_id),
  KEY idx_item_order (order_id, region_code),
  CONSTRAINT fk_item_order FOREIGN KEY (order_id, region_code) REFERENCES Orders (order_id, region_code) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- no relationships at all
CREATE TABLE AuditLog (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor      VARCHAR(80) NOT NULL,
  action     VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- refers to a contact by column name only: there is deliberately NO foreign key,
-- so JARVIS may only ever show this link as "inferred"
CREATE TABLE SupportTickets (
  ticket_id  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  contact_id INT UNSIGNED NOT NULL,
  subject    VARCHAR(160) NOT NULL,
  opened_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticket_id),
  KEY idx_ticket_contact (contact_id)
) ENGINE=InnoDB;

CREATE VIEW ActiveContacts AS
  SELECT contact_id, first_name, last_name, email FROM ContactDetails WHERE status = 'ACTIVE';

CREATE TRIGGER trg_contact_audit AFTER INSERT ON ContactDetails FOR EACH ROW
  INSERT INTO AuditLog (actor, action) VALUES (NEW.email, 'contact.created');

CREATE FUNCTION full_name(first_name VARCHAR(80), last_name VARCHAR(80)) RETURNS VARCHAR(161) DETERMINISTIC
  RETURN CONCAT(first_name, ' ', last_name);

INSERT INTO ContactDetails (first_name, last_name, email, status) VALUES
  ('Asha', 'Raman', 'asha@gmail.com', 'ACTIVE'),
  ('Ben', 'Okafor', 'ben@example.com', 'ACTIVE'),
  ('Chloe', 'Martin', 'chloe@example.org', 'INACTIVE'),
  ('Dev', 'Patel', 'dev@gmail.com', 'ACTIVE');
INSERT INTO SupportTickets (contact_id, subject) VALUES (1, 'Cannot log in'), (2, 'Invoice question');
INSERT INTO ContactPhones (contact_id, country_code, phone_number) VALUES
  (1, '+91', '9840000001'), (1, '+91', '9840000002'), (2, '+234', '8030000003'), (4, '+91', '9840000004');
INSERT INTO ContactEmails (contact_id, email_address) VALUES
  (1, 'asha.work@example.com'), (2, 'ben.alt@gmail.com'), (3, 'chloe.m@example.com');
INSERT INTO ContactProfiles (contact_id, bio, birthday, settings) VALUES
  (1, 'Early adopter', '1990-04-12', JSON_OBJECT('newsletter', TRUE));
INSERT INTO Tags (name) VALUES ('customer'), ('partner'), ('vip');
INSERT INTO ContactTags (contact_id, tag_id) VALUES (1, 1), (1, 3), (2, 2), (4, 1);
INSERT INTO Orders (order_id, region_code, contact_id, total, placed_at) VALUES
  (1001, 'IN', 1, 249.00, '2026-10-01 10:15:00'), (1002, 'NG', 2, 80.50, '2026-10-03 16:40:00');
INSERT INTO OrderItems (order_id, region_code, sku, quantity, unit_price) VALUES
  (1001, 'IN', 'SKU-RED', 2, 99.50), (1001, 'IN', 'SKU-BLUE', 1, 50.00), (1002, 'NG', 'SKU-RED', 1, 80.50);
