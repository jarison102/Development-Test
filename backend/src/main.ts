import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { ApiExceptionFilter } from './common/http/api-exception.filter'

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter())
  const config = app.get(ConfigService)
  app.setGlobalPrefix('api')
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  app.useGlobalFilters(new ApiExceptionFilter())
  app.enableCors({ origin: config.getOrThrow<string>('FRONTEND_ORIGIN').split(','), methods: ['GET', 'POST'] })

  const document = SwaggerModule.createDocument(app, new DocumentBuilder()
    .setTitle('Payment Checkout API')
    .setDescription('Catálogo, clientes, transacciones, entregas y pagos Wompi Sandbox.')
    .setVersion('1.0')
    .build())
  SwaggerModule.setup('api/docs', app, document)

  await app.listen(config.get<number>('PORT', 3000), '127.0.0.0')
}

void bootstrap()
