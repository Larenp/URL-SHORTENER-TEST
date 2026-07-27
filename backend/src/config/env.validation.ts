import * as Joi from 'joi';

const JWT_EXPIRY_PATTERN = /^\d+[smhd]$/;
const JWT_EXPIRY_MESSAGE = 'must be a number followed by s, m, h, or d (e.g. "15m", "7d")';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().default('api'),
  CORS_ORIGIN: Joi.string().uri().default('http://localhost:5173'),
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace').default('info'),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string()
    .pattern(JWT_EXPIRY_PATTERN)
    .message(JWT_EXPIRY_MESSAGE)
    .default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).invalid(Joi.ref('JWT_ACCESS_SECRET')).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string()
    .pattern(JWT_EXPIRY_PATTERN)
    .message(JWT_EXPIRY_MESSAGE)
    .default('7d'),
});
