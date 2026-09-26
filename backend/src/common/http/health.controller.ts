import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Comprobar que el backend responde' })
  @ApiResponse({ status: 200, description: '{ data: { status: "ok" } }' })
  check() {
    return { data: { status: 'ok' } }
  }
}
