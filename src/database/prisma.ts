import { PrismaClient } from '@prisma/client';
import logger from '@core/Logger';

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

/**
 * Client Prisma en singleton.
 *
 * En développement on le mémoïse sur `global` pour qu'un rechargement à chaud
 * ne rouvre pas un pool de connexions à chaque fois.
 */
const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Établit la connexion à la base. Appelé explicitement au démarrage
 * (voir `src/index.ts`) plutôt qu'en effet de bord d'import : un import ne doit
 * jamais pouvoir tuer le process, et cela garde l'ordre de démarrage lisible.
 */
export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('✓ Database connected');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Database disconnected');
}

export default prisma;
