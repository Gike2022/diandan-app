ALTER TABLE orders ADD COLUMN payment_expires_at DATETIME(3) NULL AFTER total_items;
UPDATE orders SET payment_expires_at = DATE_ADD(created_at, INTERVAL 15 MINUTE), updated_at = updated_at WHERE payment_expires_at IS NULL;
ALTER TABLE orders MODIFY COLUMN payment_expires_at DATETIME(3) NOT NULL;
CREATE INDEX idx_orders_payment_expiry ON orders (status, payment_status, payment_expires_at);
