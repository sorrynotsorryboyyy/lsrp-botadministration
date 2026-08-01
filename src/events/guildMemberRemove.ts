import { Events, GuildMember, PartialGuildMember } from 'discord.js';
import MemberService from '@services/MemberService';
import { EventModule } from '@core/EventHandler';
import prisma from '@database/prisma';
import logger from '@core/Logger';
import { MemberStatus, MemberHistoryEventType } from '@prisma/client';

const event: EventModule = {
  name: Events.GuildMemberRemove,
  async execute(member: GuildMember | PartialGuildMember) {
    try {
      logger.info(`Member left: ${member.user?.tag} (${member.id})`);

      const updatedMember = await MemberService.updateMemberStatus(member.id, MemberStatus.PARTI);

      if (updatedMember) {
        await prisma.member.update({
          where: { id: updatedMember.id },
          data: { leftAt: new Date() },
        });

        await prisma.memberHistory.create({
          data: {
            subjectId: updatedMember.id,
            eventType: MemberHistoryEventType.DEPART,
            details: `${member.user?.tag} a quitté le serveur`,
            createdAt: new Date(),
          },
        });

        logger.info(`Member history created for departure: ${member.user?.tag}`);
      }
    } catch (error) {
      logger.error(`Error handling guildMemberRemove:`, error);
    }
  },
};

export default event;
