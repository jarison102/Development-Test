-- CreateTable
CREATE TABLE `clientes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(150) NOT NULL,
    `correo` VARCHAR(150) NOT NULL,
    `telefono` VARCHAR(30) NOT NULL,
    `fecha_creacion` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `correo`(`correo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `entregas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `transaccion_id` INTEGER NOT NULL,
    `cliente_id` INTEGER NOT NULL,
    `direccion` VARCHAR(250) NOT NULL,
    `ciudad` VARCHAR(100) NOT NULL,
    `departamento` VARCHAR(100) NOT NULL,
    `codigo_postal` VARCHAR(20) NULL,
    `estado` ENUM('PENDIENTE', 'EN_PREPARACION', 'ENVIADA', 'ENTREGADA') NOT NULL DEFAULT 'PENDIENTE',
    `fecha_creacion` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_entrega_cliente`(`cliente_id`),
    INDEX `fk_entrega_transaccion`(`transaccion_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `productos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(150) NOT NULL,
    `descripcion` TEXT NOT NULL,
    `precio` DECIMAL(12, 2) NOT NULL,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `imagen` VARCHAR(500) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `fecha_creacion` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_attempts` (
    `transaccion_id` INTEGER NOT NULL,
    `producto_id` INTEGER NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `estado` VARCHAR(20) NOT NULL,
    `direccion` VARCHAR(250) NOT NULL,
    `ciudad` VARCHAR(100) NOT NULL,
    `departamento` VARCHAR(100) NOT NULL,
    `codigo_postal` VARCHAR(20) NULL,

    INDEX `payment_attempts_producto_id_estado_idx`(`producto_id`, `estado`),
    PRIMARY KEY (`transaccion_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transacciones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `referencia` VARCHAR(100) NOT NULL,
    `producto_id` INTEGER NOT NULL,
    `cliente_id` INTEGER NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `subtotal` DECIMAL(12, 2) NOT NULL,
    `tarifa_base` DECIMAL(12, 2) NOT NULL,
    `tarifa_envio` DECIMAL(12, 2) NOT NULL,
    `total` DECIMAL(12, 2) NOT NULL,
    `estado` ENUM('PENDIENTE', 'APROBADA', 'RECHAZADA') NOT NULL DEFAULT 'PENDIENTE',
    `id_transaccion_wompi` VARCHAR(150) NULL,
    `fecha_creacion` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `fecha_actualizacion` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `referencia`(`referencia`),
    INDEX `fk_transaccion_cliente`(`cliente_id`),
    INDEX `fk_transaccion_producto`(`producto_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transaccion_items` (
    `transaccion_id` INTEGER NOT NULL,
    `producto_id` INTEGER NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `precio_unitario` DECIMAL(12, 2) NOT NULL,
    `subtotal` DECIMAL(12, 2) NOT NULL,

    INDEX `transaccion_items_producto_id_idx`(`producto_id`),
    PRIMARY KEY (`transaccion_id`, `producto_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_attempt_items` (
    `transaccion_id` INTEGER NOT NULL,
    `producto_id` INTEGER NOT NULL,
    `cantidad` INTEGER NOT NULL,

    INDEX `payment_attempt_items_producto_id_idx`(`producto_id`),
    PRIMARY KEY (`transaccion_id`, `producto_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `entregas` ADD CONSTRAINT `fk_entrega_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `entregas` ADD CONSTRAINT `fk_entrega_transaccion` FOREIGN KEY (`transaccion_id`) REFERENCES `transacciones`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `payment_attempts` ADD CONSTRAINT `payment_attempts_transaccion_id_fkey` FOREIGN KEY (`transaccion_id`) REFERENCES `transacciones`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `payment_attempts` ADD CONSTRAINT `payment_attempts_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `transacciones` ADD CONSTRAINT `fk_transaccion_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `transacciones` ADD CONSTRAINT `fk_transaccion_producto` FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `transaccion_items` ADD CONSTRAINT `transaccion_items_transaccion_id_fkey` FOREIGN KEY (`transaccion_id`) REFERENCES `transacciones`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `transaccion_items` ADD CONSTRAINT `transaccion_items_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `payment_attempt_items` ADD CONSTRAINT `payment_attempt_items_transaccion_id_fkey` FOREIGN KEY (`transaccion_id`) REFERENCES `payment_attempts`(`transaccion_id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `payment_attempt_items` ADD CONSTRAINT `payment_attempt_items_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

