ALTER TABLE categories ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE dishes ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1;

CREATE TABLE catalog_create_requests (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  resource_kind ENUM('category', 'dish') NOT NULL,
  request_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  resource_id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (user_id, resource_kind, request_key),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
