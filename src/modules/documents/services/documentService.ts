import { DocumentCategory, Member, Prisma } from '@prisma/client';
import prisma from '@database/prisma';
import { recordAudit } from '@modules/audit/services/auditService';
import { AuditAction, AuditEntity } from '@modules/audit/actions';
import logger from '@core/Logger';

export type DocumentWithAuthor = Prisma.DocumentGetPayload<{ include: { author: true } }>;

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  [DocumentCategory.PROCEDURE]: '📋 Procédure',
  [DocumentCategory.TUTORIEL]: '🎓 Tutoriel',
  [DocumentCategory.GUIDE]: '📖 Guide',
  [DocumentCategory.CAHIER_DES_CHARGES]: '📐 Cahier des charges',
};

/**
 * Salon de publication des documents.
 *
 * Toutes les catégories partagent désormais le même salon : le filtrage par
 * catégorie se fait via `listDocuments(category)` et le bouton « Consulter » du
 * panneau, ce qui rend inutiles quatre salons distincts.
 */
export const DOCUMENTS_CHANNEL_KEY = 'DOCUMENTS_HUB';

/** @deprecated Conservé pour compatibilité — pointe toujours vers le hub. */
export const CATEGORY_CHANNEL_KEYS: Record<DocumentCategory, string> = {
  [DocumentCategory.PROCEDURE]: DOCUMENTS_CHANNEL_KEY,
  [DocumentCategory.TUTORIEL]: DOCUMENTS_CHANNEL_KEY,
  [DocumentCategory.GUIDE]: DOCUMENTS_CHANNEL_KEY,
  [DocumentCategory.CAHIER_DES_CHARGES]: DOCUMENTS_CHANNEL_KEY,
};

export interface CreateDocumentInput {
  title: string;
  category: DocumentCategory;
  content?: string;
  fileUrl?: string;
  author: Member;
}

export async function createDocument(input: CreateDocumentInput): Promise<DocumentWithAuthor> {
  if (!input.content && !input.fileUrl) {
    throw new Error('Fournissez un contenu textuel ou un fichier joint.');
  }

  const document = await prisma.document.create({
    data: {
      title: input.title,
      category: input.category,
      content: input.content,
      fileUrl: input.fileUrl,
      authorId: input.author.id,
    },
    include: { author: true },
  });

  logger.info(`Document publié : "${document.title}" (${input.category})`);

  await recordAudit({
    action: AuditAction.DOCUMENT_PUBLISHED,
    entityType: AuditEntity.DOCUMENT,
    entityId: document.id,
    actorId: input.author.id,
    metadata: { titre: document.title, categorie: input.category },
  });

  return document;
}

export async function getDocument(id: string): Promise<DocumentWithAuthor | null> {
  return prisma.document.findUnique({ where: { id }, include: { author: true } });
}

export async function listDocuments(category?: DocumentCategory): Promise<DocumentWithAuthor[]> {
  return prisma.document.findMany({
    where: category ? { category } : undefined,
    include: { author: true },
    orderBy: { updatedAt: 'desc' },
    take: 25,
  });
}

export async function searchDocuments(query: string, limit = 25) {
  return prisma.document.findMany({
    where: query ? { title: { contains: query } } : undefined,
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });
}
