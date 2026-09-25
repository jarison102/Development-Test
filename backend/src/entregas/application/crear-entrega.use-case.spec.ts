import { ClientesPort } from '../../clientes/domain/clientes.port'
import { TransaccionesPort } from '../../transacciones/domain/transacciones.port'
import { EntregasPort } from '../domain/entregas.port'
import { CrearEntrega } from './crear-entrega.use-case'

const input = { transaccionId: 4, clienteId: 2, direccion: 'Calle 1', ciudad: 'Bogotá', departamento: 'Cundinamarca' }
const transaccion = {
  id: 4, referencia: 'ref', productoId: 1, clienteId: 2, cantidad: 1,
  subtotal: '250000.00', tarifaBase: '1500.00', tarifaEnvio: '5000.00', total: '256500.00',
  estado: 'APROBADA' as const, idTransaccionExterna: null,
}

function setup() {
  const buscarTransaccion = jest.fn().mockResolvedValue(transaccion)
  const buscarEntrega = jest.fn().mockResolvedValue(null)
  const crear = jest.fn().mockImplementation(async (data) => ({ id: 1, estado: 'PENDIENTE', ...data }))
  const transacciones: TransaccionesPort = { buscar: buscarTransaccion, buscarPorReferencia: jest.fn(), crear: jest.fn() }
  const clientes: ClientesPort = { buscar: jest.fn().mockResolvedValue({ id: 2 }), crear: jest.fn() }
  const entregas: EntregasPort = { buscarPorTransaccion: buscarEntrega, crearSiAprobadaYUnica: crear }
  return { useCase: new CrearEntrega(transacciones, clientes, entregas), buscarTransaccion, buscarEntrega, crear }
}

describe('CrearEntrega', () => {
  it('crea una entrega pendiente para una transacción aprobada', async () => {
    const { useCase, crear } = setup()
    const result = await useCase.execute(input)
    expect(result.estado).toBe('PENDIENTE')
    expect(crear).toHaveBeenCalledWith(expect.objectContaining({ transaccionId: 4, clienteId: 2 }))
  })

  it('no crea entrega antes de la aprobación', async () => {
    const { useCase, buscarTransaccion, crear } = setup()
    buscarTransaccion.mockResolvedValue({ ...transaccion, estado: 'RECHAZADA' })
    await expect(useCase.execute(input)).rejects.toMatchObject({ status: 409 })
    expect(crear).not.toHaveBeenCalled()
  })

  it('rechaza cliente ajeno a la transacción', async () => {
    const { useCase, buscarTransaccion, crear } = setup()
    buscarTransaccion.mockResolvedValue({ ...transaccion, clienteId: 3 })
    await expect(useCase.execute(input)).rejects.toMatchObject({ status: 409 })
    expect(crear).not.toHaveBeenCalled()
  })

  it('rechaza una segunda entrega', async () => {
    const { useCase, buscarEntrega, crear } = setup()
    buscarEntrega.mockResolvedValue({ id: 5 })
    await expect(useCase.execute(input)).rejects.toMatchObject({ status: 409 })
    expect(crear).not.toHaveBeenCalled()
  })

  it('responde 404 si la transacción o el cliente no existen', async () => {
    const { useCase, buscarTransaccion, crear } = setup()
    buscarTransaccion.mockResolvedValue(null)
    await expect(useCase.execute(input)).rejects.toMatchObject({ status: 404 })
    expect(crear).not.toHaveBeenCalled()
  })

  it('responde 404 si el cliente no existe', async () => {
    const { crear } = setup()
    const transacciones: TransaccionesPort = { buscar: jest.fn().mockResolvedValue(transaccion),
      buscarPorReferencia: jest.fn(), crear: jest.fn() }
    const clientes: ClientesPort = { buscar: jest.fn().mockResolvedValue(null), crear: jest.fn() }
    const entregas: EntregasPort = { buscarPorTransaccion: jest.fn().mockResolvedValue(null), crearSiAprobadaYUnica: crear }
    const caso = new CrearEntrega(transacciones, clientes, entregas)
    await expect(caso.execute(input)).rejects.toMatchObject({ status: 404 })
    expect(crear).not.toHaveBeenCalled()
  })

  it.each(['direccion', 'ciudad', 'departamento'] as const)('exige %s no vacía', async (campo) => {
    const { useCase, crear } = setup()
    await expect(useCase.execute({ ...input, [campo]: '   ' })).rejects.toMatchObject({ status: 400 })
    expect(crear).not.toHaveBeenCalled()
  })

  it('informa conflicto cuando la creación atómica devuelve null', async () => {
    const { useCase, crear } = setup()
    crear.mockResolvedValue(null)
    await expect(useCase.execute(input)).rejects.toMatchObject({ status: 409 })
  })
})
