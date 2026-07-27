export interface AppConfig {
  env: string;
  port: number;
  apiPrefix: string;
  corsOrigin: string;
}

export interface LoggerConfig {
  level: string;
}

export interface DatabaseConfig {
  url: string;
}

export interface CacheConfig {
  url: string;
}

export interface AuthConfig {
  accessTokenSecret: string;
  accessTokenExpiresIn: string;
  refreshTokenSecret: string;
  refreshTokenExpiresIn: string;
}

export interface Configuration {
  app: AppConfig;
  logger: LoggerConfig;
  database: DatabaseConfig;
  cache: CacheConfig;
  auth: AuthConfig;
}

export default (): Configuration => ({
  app: {
    env: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    apiPrefix: process.env.API_PREFIX ?? 'api',
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  },
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  cache: {
    url: process.env.REDIS_URL ?? '',
  },
  auth: {
    accessTokenSecret: process.env.JWT_ACCESS_SECRET ?? '',
    accessTokenExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshTokenSecret: process.env.JWT_REFRESH_SECRET ?? '',
    refreshTokenExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
});
