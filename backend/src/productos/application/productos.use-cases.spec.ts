import { ProductosPort } from '../domain/productos.port'
import { ListarProductos, ObtenerProducto } from './productos.use-cases'

const producto = { id: 1, nombre: 'Audífonos', descripcion: 'Desc', precio: '250000.00',
  stock: 9, imagen: null, activo: true }

function setup() {
  const productos: ProductosPort = {
    listar: jest.fn().mockResolvedValue([producto]),
    buscar: jest.fn().mockResolvedValue(producto),
  }
  return { productos }
}

describe('ListarProductos', () => {
  it('devuelve el catálogo del repositorio', async () => {
    const { productos } = setup()
    expect(await new ListarProductos(productos).execute()).toEqual([producto])
    expect(productos.listar).toHaveBeenCalledTimes(1)
  })
})

describe('ObtenerProducto', () => {
  it('devuelve el producto existente', async () => {
    const { productos } = setup()
    expect(await new ObtenerProducto(productos).execute(1)).toEqual(producto)
    expect(productos.buscar).toHaveBeenCalledWith(1)
  })

  it('responde 404 cuando el producto no existe o está inactivo', async () => {
    const { productos } = setup()
    ;(productos.buscar as jest.Mock).mockResolvedValue(null)
    await expect(new ObtenerProducto(productos).execute(99)).rejects.toMatchObject({ status: 404 })
  })
})
