import { GuildMember } from 'discord.js';
import { Grade } from '@prisma/client';
import prisma from '@database/prisma';
import { GRADE_HIERARCHY, isGradeHigherOrEqual } from '@apptypes/grade.types';
import logger from '@core/Logger';

export class PermissionService {
  static async resolveGrade(member: GuildMember): Promise<Grade | null> {
    try {
      for (const grade of GRADE_HIERARCHY) {
        const roleId = await this.getRoleIdForGrade(grade);
        if (roleId && member.roles.cache.has(roleId)) {
          return grade;
        }
      }
      return null;
    } catch (error) {
      logger.error(`Error resolving grade for member ${member.id}:`, error);
      return null;
    }
  }

  static async getRoleIdForGrade(grade: Grade): Promise<string | null> {
    try {
      const config = await prisma.guildConfig.findUnique({
        where: { key: `ROLE_${grade}` },
      });
      return config?.value || null;
    } catch (error) {
      logger.error(`Error fetching role ID for grade ${grade}:`, error);
      return null;
    }
  }

  static hasMinimumGrade(actual: Grade | null, required: Grade): boolean {
    if (!actual) return false;
    return isGradeHigherOrEqual(actual, required);
  }

  static async canExecuteCommand(member: GuildMember, minGrade?: Grade): Promise<boolean> {
    if (!minGrade) return true;
    const grade = await this.resolveGrade(member);
    return this.hasMinimumGrade(grade, minGrade);
  }
}

export default PermissionService;
