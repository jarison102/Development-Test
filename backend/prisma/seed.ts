import { Prisma, PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const products = [
  { nombre: 'Audífonos Pro Demo', descripcion: 'Audífonos inalámbricos para la tienda de demostración.', precio: '250000.00', stock: 10, imagen: null, activo: true },
  { nombre: 'Teclado Mecánico Demo', descripcion: 'Teclado mecánico para la tienda de demostración.', precio: '320000.00', stock: 8, imagen: null, activo: true },
  { nombre: 'Mouse Inalámbrico Demo', descripcion: 'Mouse inalámbrico para la tienda de demostración.', precio: '150000.00', stock: 15, imagen: null, activo: true },
]

async function main() {
  await prisma.$transaction(async (tx) => {
    const otherProduct = await tx.productos.findFirst({ where: { nombre: { notIn: products.map((product) => product.nombre) } } })
    if (otherProduct) return
    for (const product of products) {
      const existing = await tx.productos.findFirst({ where: { nombre: product.nombre } })
      if (!existing) await tx.productos.create({ data: product })
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 })
}

main().catch(() => { console.error('No se pudo completar el seed; comprueba la conexión y los permisos.'); process.exitCode = 1 })
  .finally(async () => prisma.$disconnect())
