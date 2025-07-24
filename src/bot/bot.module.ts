import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { PrismaModule } from 'src/Database/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [BotService],
  controllers: [BotController]
})
export class BotModule {}
