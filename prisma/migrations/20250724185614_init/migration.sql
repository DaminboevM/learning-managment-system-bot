-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "tgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Messages" (
    "id" SERIAL NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "telegram" TEXT NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "Messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_tgId_key" ON "User"("tgId");

-- CreateIndex
CREATE UNIQUE INDEX "Messages_phone_key" ON "Messages"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Messages_telegram_key" ON "Messages"("telegram");
