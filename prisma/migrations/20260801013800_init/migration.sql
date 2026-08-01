-- CreateTable
CREATE TABLE `GuildConfig` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `GuildConfig_key_key`(`key`),
    INDEX `GuildConfig_key_idx`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Member` (
    `id` VARCHAR(191) NOT NULL,
    `discordId` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NULL,
    `grade` ENUM('FONDATEUR', 'CO_FONDATEUR', 'DIRECTEUR_GENERAL', 'DIRECTEUR_POLE', 'RESPONSABLE', 'CHEF_EQUIPE', 'COLLABORATEUR', 'RECRUE') NOT NULL,
    `status` ENUM('ACTIF', 'EN_CONGE', 'SUSPENDU', 'PARTI') NOT NULL DEFAULT 'ACTIF',
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `leftAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `poleId` VARCHAR(191) NULL,

    UNIQUE INDEX `Member_discordId_key`(`discordId`),
    INDEX `Member_grade_idx`(`grade`),
    INDEX `Member_poleId_idx`(`poleId`),
    INDEX `Member_status_idx`(`status`),
    INDEX `Member_discordId_idx`(`discordId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Pole` (
    `id` VARCHAR(191) NOT NULL,
    `name` ENUM('GENERAL', 'GARRYS_MOD', 'WEB', 'TECHNIQUE', 'COMMUNAUTAIRE', 'MARKETING', 'PARTENARIATS', 'ANIMATION') NOT NULL,
    `displayName` VARCHAR(191) NOT NULL,
    `emoji` VARCHAR(191) NULL,
    `color` VARCHAR(191) NULL,
    `categoryChannelId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Pole_name_key`(`name`),
    INDEX `Pole_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RecruitmentApplication` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('RECRUTEMENT_EXTERNE', 'CANDIDATURE_INTERNE') NOT NULL,
    `status` ENUM('EN_ATTENTE', 'EN_ENTRETIEN', 'ACCEPTEE', 'REFUSEE', 'ANNULEE') NOT NULL DEFAULT 'EN_ATTENTE',
    `candidateId` VARCHAR(191) NULL,
    `candidateDiscordId` VARCHAR(191) NOT NULL,
    `candidatePseudo` VARCHAR(191) NOT NULL,
    `targetPoleId` VARCHAR(191) NULL,
    `motivation` TEXT NOT NULL,
    `reviewerId` VARCHAR(191) NULL,
    `decisionNote` TEXT NULL,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `decidedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RecruitmentApplication_status_idx`(`status`),
    INDEX `RecruitmentApplication_candidateId_idx`(`candidateId`),
    INDEX `RecruitmentApplication_targetPoleId_idx`(`targetPoleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Sanction` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('AVERTISSEMENT', 'BLAME', 'SUSPENSION', 'EXCLUSION') NOT NULL,
    `severity` ENUM('MINEURE', 'MODEREE', 'GRAVE', 'CRITIQUE') NOT NULL,
    `reason` TEXT NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `issuerId` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Sanction_targetId_idx`(`targetId`),
    INDEX `Sanction_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Warning` (
    `id` VARCHAR(191) NOT NULL,
    `reason` TEXT NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `issuerId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Warning_targetId_idx`(`targetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PromotionHistory` (
    `id` VARCHAR(191) NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `issuerId` VARCHAR(191) NOT NULL,
    `previousGrade` ENUM('FONDATEUR', 'CO_FONDATEUR', 'DIRECTEUR_GENERAL', 'DIRECTEUR_POLE', 'RESPONSABLE', 'CHEF_EQUIPE', 'COLLABORATEUR', 'RECRUE') NOT NULL,
    `newGrade` ENUM('FONDATEUR', 'CO_FONDATEUR', 'DIRECTEUR_GENERAL', 'DIRECTEUR_POLE', 'RESPONSABLE', 'CHEF_EQUIPE', 'COLLABORATEUR', 'RECRUE') NOT NULL,
    `reason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PromotionHistory_targetId_idx`(`targetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MemberHistory` (
    `id` VARCHAR(191) NOT NULL,
    `subjectId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `eventType` ENUM('ARRIVEE', 'DEPART', 'PROMOTION', 'RETROGRADATION', 'CHANGEMENT_POLE', 'AVERTISSEMENT', 'SANCTION', 'RETOUR_CONGE', 'MISE_EN_CONGE') NOT NULL,
    `details` TEXT NULL,
    `previousValue` VARCHAR(191) NULL,
    `newValue` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MemberHistory_subjectId_idx`(`subjectId`),
    INDEX `MemberHistory_eventType_idx`(`eventType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Project` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `status` ENUM('A_FAIRE', 'EN_COURS', 'EN_ATTENTE', 'EN_TEST', 'TERMINE', 'ARCHIVE') NOT NULL DEFAULT 'A_FAIRE',
    `priority` ENUM('BASSE', 'NORMALE', 'HAUTE', 'CRITIQUE') NOT NULL DEFAULT 'NORMALE',
    `dueDate` DATETIME(3) NULL,
    `poleId` VARCHAR(191) NULL,
    `managerId` VARCHAR(191) NOT NULL,
    `channelId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `Project_status_idx`(`status`),
    INDEX `Project_poleId_idx`(`poleId`),
    INDEX `Project_managerId_idx`(`managerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectMember` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProjectMember_memberId_idx`(`memberId`),
    UNIQUE INDEX `ProjectMember_projectId_memberId_key`(`projectId`, `memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectComment` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProjectComment_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Task` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('A_FAIRE', 'EN_COURS', 'EN_ATTENTE', 'EN_TEST', 'TERMINE') NOT NULL DEFAULT 'A_FAIRE',
    `priority` ENUM('BASSE', 'NORMALE', 'HAUTE', 'CRITIQUE') NOT NULL DEFAULT 'NORMALE',
    `dueDate` DATETIME(3) NULL,
    `projectId` VARCHAR(191) NULL,
    `assigneeId` VARCHAR(191) NULL,
    `creatorId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,

    INDEX `Task_status_idx`(`status`),
    INDEX `Task_assigneeId_idx`(`assigneeId`),
    INDEX `Task_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskComment` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TaskComment_taskId_idx`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Attachment` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `fileUrl` TEXT NOT NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Attachment_taskId_idx`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Announcement` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `priority` ENUM('INFO', 'IMPORTANTE', 'URGENTE') NOT NULL DEFAULT 'INFO',
    `authorId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Announcement_priority_idx`(`priority`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnnouncementPoleTarget` (
    `id` VARCHAR(191) NOT NULL,
    `announcementId` VARCHAR(191) NOT NULL,
    `poleId` VARCHAR(191) NOT NULL,
    `channelId` VARCHAR(191) NULL,
    `messageId` VARCHAR(191) NULL,
    `publishedAt` DATETIME(3) NULL,

    INDEX `AnnouncementPoleTarget_poleId_idx`(`poleId`),
    UNIQUE INDEX `AnnouncementPoleTarget_announcementId_poleId_key`(`announcementId`, `poleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Meeting` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `agenda` TEXT NULL,
    `status` ENUM('PLANIFIEE', 'EN_COURS', 'TERMINEE', 'ANNULEE') NOT NULL DEFAULT 'PLANIFIEE',
    `scheduledAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NULL,
    `organizerId` VARCHAR(191) NOT NULL,
    `summary` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Meeting_status_idx`(`status`),
    INDEX `Meeting_scheduledAt_idx`(`scheduledAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MeetingAttendee` (
    `id` VARCHAR(191) NOT NULL,
    `meetingId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `present` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `MeetingAttendee_meetingId_memberId_key`(`meetingId`, `memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MeetingDecision` (
    `id` VARCHAR(191) NOT NULL,
    `meetingId` VARCHAR(191) NOT NULL,
    `decisionId` VARCHAR(191) NULL,
    `note` TEXT NULL,

    UNIQUE INDEX `MeetingDecision_decisionId_key`(`decisionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Decision` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `status` ENUM('PROPOSEE', 'VALIDEE', 'REJETEE', 'APPLIQUEE') NOT NULL DEFAULT 'PROPOSEE',
    `proposerId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `decidedAt` DATETIME(3) NULL,

    INDEX `Decision_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Expense` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('SOUMISE', 'VALIDEE_RESPONSABLE', 'VALIDEE_DIRECTEUR', 'ACCEPTEE', 'REFUSEE') NOT NULL DEFAULT 'SOUMISE',
    `submitterId` VARCHAR(191) NOT NULL,
    `reviewerId` VARCHAR(191) NULL,
    `receiptUrl` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `decidedAt` DATETIME(3) NULL,

    INDEX `Expense_status_idx`(`status`),
    INDEX `Expense_submitterId_idx`(`submitterId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Objective` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `scope` ENUM('HEBDOMADAIRE', 'MENSUEL', 'POLE', 'INDIVIDUEL') NOT NULL,
    `status` ENUM('EN_COURS', 'ATTEINT', 'MANQUE', 'ANNULE') NOT NULL DEFAULT 'EN_COURS',
    `poleId` VARCHAR(191) NULL,
    `ownerId` VARCHAR(191) NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Objective_scope_idx`(`scope`),
    INDEX `Objective_poleId_idx`(`poleId`),
    INDEX `Objective_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KPISnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `poleId` VARCHAR(191) NULL,
    `weekStart` DATETIME(3) NOT NULL,
    `metricName` VARCHAR(191) NOT NULL,
    `metricValue` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `KPISnapshot_poleId_idx`(`poleId`),
    INDEX `KPISnapshot_weekStart_idx`(`weekStart`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Alert` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `severity` ENUM('INFO', 'ATTENTION', 'CRITIQUE') NOT NULL,
    `status` ENUM('ACTIVE', 'RESOLUE', 'IGNOREE') NOT NULL DEFAULT 'ACTIVE',
    `assigneeId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,

    INDEX `Alert_status_idx`(`status`),
    INDEX `Alert_severity_idx`(`severity`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_actorId_idx`(`actorId`),
    INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RoadmapItem` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('PLANIFIE', 'EN_COURS', 'LIVRE', 'ABANDONNE') NOT NULL DEFAULT 'PLANIFIE',
    `poleId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `ownerId` VARCHAR(191) NULL,
    `targetDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RoadmapItem_status_idx`(`status`),
    INDEX `RoadmapItem_poleId_idx`(`poleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Document` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `category` ENUM('PROCEDURE', 'TUTORIEL', 'GUIDE', 'CAHIER_DES_CHARGES') NOT NULL,
    `content` TEXT NULL,
    `fileUrl` TEXT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Document_category_idx`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Absence` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('CONGE', 'MALADIE', 'INDISPONIBILITE', 'AUTRE') NOT NULL,
    `status` ENUM('DEMANDEE', 'VALIDEE', 'REFUSEE', 'TERMINEE') NOT NULL DEFAULT 'DEMANDEE',
    `memberId` VARCHAR(191) NOT NULL,
    `reviewerId` VARCHAR(191) NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `reason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Absence_memberId_idx`(`memberId`),
    INDEX `Absence_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Member` ADD CONSTRAINT `Member_poleId_fkey` FOREIGN KEY (`poleId`) REFERENCES `Pole`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecruitmentApplication` ADD CONSTRAINT `RecruitmentApplication_candidateId_fkey` FOREIGN KEY (`candidateId`) REFERENCES `Member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecruitmentApplication` ADD CONSTRAINT `RecruitmentApplication_targetPoleId_fkey` FOREIGN KEY (`targetPoleId`) REFERENCES `Pole`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecruitmentApplication` ADD CONSTRAINT `RecruitmentApplication_reviewerId_fkey` FOREIGN KEY (`reviewerId`) REFERENCES `Member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sanction` ADD CONSTRAINT `Sanction_targetId_fkey` FOREIGN KEY (`targetId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sanction` ADD CONSTRAINT `Sanction_issuerId_fkey` FOREIGN KEY (`issuerId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Warning` ADD CONSTRAINT `Warning_targetId_fkey` FOREIGN KEY (`targetId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Warning` ADD CONSTRAINT `Warning_issuerId_fkey` FOREIGN KEY (`issuerId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PromotionHistory` ADD CONSTRAINT `PromotionHistory_targetId_fkey` FOREIGN KEY (`targetId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PromotionHistory` ADD CONSTRAINT `PromotionHistory_issuerId_fkey` FOREIGN KEY (`issuerId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MemberHistory` ADD CONSTRAINT `MemberHistory_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MemberHistory` ADD CONSTRAINT `MemberHistory_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `Member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_poleId_fkey` FOREIGN KEY (`poleId`) REFERENCES `Pole`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectMember` ADD CONSTRAINT `ProjectMember_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectMember` ADD CONSTRAINT `ProjectMember_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectComment` ADD CONSTRAINT `ProjectComment_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectComment` ADD CONSTRAINT `ProjectComment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `Member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskComment` ADD CONSTRAINT `TaskComment_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskComment` ADD CONSTRAINT `TaskComment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Announcement` ADD CONSTRAINT `Announcement_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AnnouncementPoleTarget` ADD CONSTRAINT `AnnouncementPoleTarget_announcementId_fkey` FOREIGN KEY (`announcementId`) REFERENCES `Announcement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AnnouncementPoleTarget` ADD CONSTRAINT `AnnouncementPoleTarget_poleId_fkey` FOREIGN KEY (`poleId`) REFERENCES `Pole`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Meeting` ADD CONSTRAINT `Meeting_organizerId_fkey` FOREIGN KEY (`organizerId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeetingAttendee` ADD CONSTRAINT `MeetingAttendee_meetingId_fkey` FOREIGN KEY (`meetingId`) REFERENCES `Meeting`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeetingAttendee` ADD CONSTRAINT `MeetingAttendee_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeetingDecision` ADD CONSTRAINT `MeetingDecision_meetingId_fkey` FOREIGN KEY (`meetingId`) REFERENCES `Meeting`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeetingDecision` ADD CONSTRAINT `MeetingDecision_decisionId_fkey` FOREIGN KEY (`decisionId`) REFERENCES `Decision`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Decision` ADD CONSTRAINT `Decision_proposerId_fkey` FOREIGN KEY (`proposerId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_submitterId_fkey` FOREIGN KEY (`submitterId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_reviewerId_fkey` FOREIGN KEY (`reviewerId`) REFERENCES `Member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Objective` ADD CONSTRAINT `Objective_poleId_fkey` FOREIGN KEY (`poleId`) REFERENCES `Pole`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Objective` ADD CONSTRAINT `Objective_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `Member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KPISnapshot` ADD CONSTRAINT `KPISnapshot_poleId_fkey` FOREIGN KEY (`poleId`) REFERENCES `Pole`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Alert` ADD CONSTRAINT `Alert_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `Member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `Member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RoadmapItem` ADD CONSTRAINT `RoadmapItem_poleId_fkey` FOREIGN KEY (`poleId`) REFERENCES `Pole`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RoadmapItem` ADD CONSTRAINT `RoadmapItem_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RoadmapItem` ADD CONSTRAINT `RoadmapItem_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `Member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Absence` ADD CONSTRAINT `Absence_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Absence` ADD CONSTRAINT `Absence_reviewerId_fkey` FOREIGN KEY (`reviewerId`) REFERENCES `Member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
