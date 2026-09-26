CREATE TABLE transaccion_items (
  transaccion_id INT NOT NULL,
  producto_id INT NOT NULL,
  cantidad INT NOT NULL,
  precio_unitario DECIMAL(12,2) NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (transaccion_id, producto_id),
  INDEX transaccion_items_producto_id_idx (producto_id),
  CONSTRAINT transaccion_items_transaccion_id_fkey FOREIGN KEY (transaccion_id) REFERENCES transacciones(id) ON UPDATE RESTRICT,
  CONSTRAINT transaccion_items_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES productos(id) ON UPDATE RESTRICT
);

CREATE TABLE payment_attempt_items (
  transaccion_id INT NOT NULL,
  producto_id INT NOT NULL,
  cantidad INT NOT NULL,
  PRIMARY KEY (transaccion_id, producto_id),
  INDEX payment_attempt_items_producto_id_idx (producto_id),
  CONSTRAINT payment_attempt_items_transaccion_id_fkey FOREIGN KEY (transaccion_id) REFERENCES payment_attempts(transaccion_id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT payment_attempt_items_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES productos(id) ON UPDATE RESTRICT
);
