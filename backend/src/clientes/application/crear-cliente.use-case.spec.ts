import { ClientesPort } from '../domain/clientes.port'
import { CrearCliente } from './crear-cliente.use-case'

function setup() {
  const crear = jest.fn().mockImplementation(async (data) => ({ id: 2, ...data }))
  const clientes: ClientesPort = { buscar: jest.fn(), crear }
  return { useCase: new CrearCliente(clientes), crear }
}

describe('CrearCliente', () => {
  it('normaliza espacios y correo antes de registrar', async () => {
    const { useCase, crear } = setup()
    const cliente = await useCase.execute({ nombre: '  Ana  ', correo: '  ANA@EXAMPLE.TEST ', telefono: ' 300 ' })
    expect(cliente.id).toBe(2)
    expect(crear).toHaveBeenCalledWith({ nombre: 'Ana', correo: 'ana@example.test', telefono: '300' })
  })

  it.each([
    ['nombre', { nombre: '   ', correo: 'ana@example.test', telefono: '300' }],
    ['teléfono', { nombre: 'Ana', correo: 'ana@example.test', telefono: '  ' }],
  ])('rechaza un %s vacío sin llamar al repositorio', (_campo, data) => {
    const { useCase, crear } = setup()
    expect(() => useCase.execute(data)).toThrow('Nombre y teléfono son obligatorios')
    expect(crear).not.toHaveBeenCalled()
  })
})
