import { Events, GuildMember } from 'discord.js';
import MemberService from '@services/MemberService';
import PermissionService from '@services/PermissionService';
import { EventModule } from '@core/EventHandler';
import prisma from '@database/prisma';
import logger from '@core/Logger';
import { Grade, MemberHistoryEventType } from '@prisma/client';

const event: EventModule = {
  name: Events.GuildMemberAdd,
  async execute(member: GuildMember) {
    try {
      logger.info(`New member joined: ${member.user.tag} (${member.id})`);

      const dbMember = await MemberService.getOrCreateMember(
        member.id,
        member.user.username,
        member.displayName,
        Grade.RECRUE,
      );

      // Aucun rôle n'est attribué automatiquement : un arrivant n'a accès qu'au
      // salon d'attente jusqu'à ce qu'un responsable l'affecte à un pôle. Donner
      // un rôle ici ouvrirait des salons avant toute validation humaine.

      await prisma.memberHistory.create({
        data: {
          subjectId: dbMember.id,
          eventType: MemberHistoryEventType.ARRIVEE,
          details: `${member.user.tag} a rejoint le serveur`,
          createdAt: new Date(),
        },
      });

      logger.info(`Member history created for arrival: ${member.user.tag}`);
    } catch (error) {
      logger.error(`Error handling guildMemberAdd:`, error);
    }
  },
};

export default event;
