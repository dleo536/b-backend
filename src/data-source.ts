import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

// Note: This file is for TypeORM CLI migrations only
// Environment variables are loaded by NestJS ConfigModule in the main app
// For CLI usage, ensure .env file is loaded or set env vars manually
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
export const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT ?? '5432'),
    username: process.env.DB_USERN,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    // Use path-based entity loading for TypeORM CLI compatibility
    // These paths work when running with ts-node
    entities: ['src/**/*.entity.ts'],
    migrations: ['src/migrations/*.ts'],
    synchronize: false,
});