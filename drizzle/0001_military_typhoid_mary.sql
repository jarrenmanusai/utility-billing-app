CREATE TABLE `apk_releases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`version` varchar(32) NOT NULL,
	`fileUrl` varchar(500) NOT NULL,
	`notes` text,
	`isLive` boolean NOT NULL DEFAULT false,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	`publishedAt` timestamp,
	CONSTRAINT `apk_releases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auth_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320),
	`ip` varchar(64),
	`success` boolean NOT NULL DEFAULT false,
	`action` varchar(32) NOT NULL DEFAULT 'login',
	`attemptedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auth_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bill_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`billId` int NOT NULL,
	`utilityId` int NOT NULL,
	`previousReading` decimal(14,4) NOT NULL DEFAULT '0',
	`currentReading` decimal(14,4) NOT NULL DEFAULT '0',
	`rate` decimal(12,4) NOT NULL DEFAULT '0',
	`consumption` decimal(14,4) NOT NULL DEFAULT '0',
	`amount` decimal(14,2) NOT NULL DEFAULT '0',
	CONSTRAINT `bill_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bills` (
	`id` int AUTO_INCREMENT NOT NULL,
	`landlordId` int NOT NULL,
	`tenantId` int NOT NULL,
	`status` enum('draft','deployed','paid') NOT NULL DEFAULT 'draft',
	`totalAmount` decimal(14,2) NOT NULL DEFAULT '0',
	`dueDate` timestamp,
	`meterPhotoUrl` varchar(500),
	`notes` text,
	`deployedAt` timestamp,
	`paidAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bills_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `blocklist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`domain` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `blocklist_id` PRIMARY KEY(`id`),
	CONSTRAINT `blocklist_domain_unique` UNIQUE(`domain`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`landlordId` int NOT NULL,
	`tenantId` int NOT NULL,
	`lastMessageAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`senderId` int NOT NULL,
	`body` text,
	`attachmentUrl` varchar(500),
	`attachmentType` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`readAt` timestamp,
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` text,
	`payload` text,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`billId` int NOT NULL,
	`tenantId` int NOT NULL,
	`proofUrl` varchar(500) NOT NULL,
	`note` text,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	`verifiedAt` timestamp,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reset_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`token` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reset_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `reset_tokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pendingLandlordCap` int NOT NULL DEFAULT 100,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `utilities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`landlordId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`unit` varchar(32) NOT NULL DEFAULT 'unit',
	`defaultRate` decimal(12,4) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `utilities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `openId` varchar(64);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('landlord','tenant','admin') NOT NULL DEFAULT 'landlord';--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `status` enum('pending','active','frozen','deleted') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `landlordId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);