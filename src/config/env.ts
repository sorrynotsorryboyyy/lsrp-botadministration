import dotenv from 'dotenv';

dotenv.config();

interface EnvVars {
  discordToken: string;
  guildId: string;
  databaseUrl: string;
  nodeEnv: 'development' | 'production';
  logLevel: string;
}

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (!value && !defaultValue) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || defaultValue || '';
}

export const env: EnvVars = {
  discordToken: getEnv('DISCORD_TOKEN'),
  guildId: getEnv('GUILD_ID'),
  databaseUrl: getEnv('DATABASE_URL'),
  nodeEnv: (getEnv('NODE_ENV', 'development') as 'development' | 'production'),
  logLevel: getEnv('LOG_LEVEL', 'info'),
};

export default env;
