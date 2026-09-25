CREATE TABLE payment_attempts (
  transaccion_id INT NOT NULL PRIMARY KEY,
  producto_id INT NOT NULL,
  cantidad INT NOT NULL,
  estado VARCHAR(20) NOT NULL,
  direccion VARCHAR(250) NOT NULL,
  ciudad VARCHAR(100) NOT NULL,
  departamento VARCHAR(100) NOT NULL,
  codigo_postal VARCHAR(20) NULL,
  INDEX payment_attempts_producto_id_estado_idx (producto_id, estado),
  CONSTRAINT payment_attempts_transaccion_id_fkey FOREIGN KEY (transaccion_id) REFERENCES transacciones(id) ON UPDATE RESTRICT,
  CONSTRAINT payment_attempts_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES productos(id) ON UPDATE RESTRICT
);
