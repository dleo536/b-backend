import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { ListModule } from './list/list.module';
import { ReviewModule } from './review/review.module';
import { SpotifyModule } from './spotify/spotify.module';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModerationModule } from './moderation/moderation.module';

@Module({
  imports: [AuthModule, ModerationModule, UserModule, ListModule, ReviewModule, SpotifyModule, ConfigModule.forRoot({ isGlobal: true }), TypeOrmModule.forRoot({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT ?? '5432'),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: [__dirname + '/**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/migrations/*{.ts,.js}'],
    migrationsRun: true,
    synchronize: false, // Disabled - use migrations for schema changes (recommended for production)
  })],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
