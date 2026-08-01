import { GuildMember, User } from 'discord.js';
import { Member, Grade, MemberStatus } from '@prisma/client';
import prisma from '@database/prisma';
import logger from '@core/Logger';

export class MemberService {
  static async getOrCreateMember(
    discordId: string,
    username: string,
    displayName?: string,
    grade: Grade = Grade.RECRUE,
  ): Promise<Member> {
    try {
      let member = await prisma.member.findUnique({
        where: { discordId },
      });

      if (!member) {
        member = await prisma.member.create({
          data: {
            discordId,
            username,
            displayName: displayName || username,
            grade,
            status: MemberStatus.ACTIF,
          },
        });
        logger.info(`Created new member in DB: ${discordId} (${username})`);
      }

      return member;
    } catch (error) {
      logger.error(`Error getting/creating member ${discordId}:`, error);
      throw error;
    }
  }

  static async getMemberByDiscordId(discordId: string): Promise<Member | null> {
    try {
      return await prisma.member.findUnique({
        where: { discordId },
      });
    } catch (error) {
      logger.error(`Error fetching member ${discordId}:`, error);
      return null;
    }
  }

  static async updateMemberGrade(discordId: string, newGrade: Grade): Promise<Member | null> {
    try {
      return await prisma.member.update({
        where: { discordId },
        data: { grade: newGrade, updatedAt: new Date() },
      });
    } catch (error) {
      logger.error(`Error updating member grade ${discordId}:`, error);
      return null;
    }
  }

  static async updateMemberStatus(discordId: string, status: MemberStatus): Promise<Member | null> {
    try {
      return await prisma.member.update({
        where: { discordId },
        data: { status, updatedAt: new Date() },
      });
    } catch (error) {
      logger.error(`Error updating member status ${discordId}:`, error);
      return null;
    }
  }

  static async updateMemberPole(discordId: string, poleId: string | null): Promise<Member | null> {
    try {
      return await prisma.member.update({
        where: { discordId },
        data: { poleId, updatedAt: new Date() },
      });
    } catch (error) {
      logger.error(`Error updating member pole ${discordId}:`, error);
      return null;
    }
  }
}

export default MemberService;
