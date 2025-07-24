-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isAuthenticated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastBotMessageId" INTEGER;
