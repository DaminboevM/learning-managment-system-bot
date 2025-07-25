import { Injectable, OnModuleInit } from '@nestjs/common';
import { Bot, InlineKeyboard } from 'grammy';
import { PrismaService } from 'src/Database/prisma.service';
import * as dotenv from 'dotenv';
import { ContactDto } from './dto/contact.dto';

dotenv.config();

@Injectable()
export class BotService implements OnModuleInit {
  private bot: Bot;

  constructor(private readonly prisma: PrismaService) {
    this.bot = new Bot(process.env.BOT_TOKEN!);

    // --- /start ---
    this.bot.command('start', async (ctx) => {
      const tgId = String(ctx.from!.id);
      const username = ctx.from?.username ?? null;

      // Foydalanuvchining /start xabarini O'CHIRMASLIK
      // await this.safeDeleteMessage(ctx); // Bu qatorni o'chirib tashladik

      const user = await this.prisma.user.upsert({
        where: { tgId },
        update: {
          username,
          count: 0,
          isAuthenticated: false,
        },
        create: {
          tgId,
          username,
          isBlocked: false,
          isAuthenticated: false,
          count: 0,
        },
      });

      // Eski bot xabarini o'chirish
      if (user.lastBotMessageId && ctx.chat?.id) {
        await this.deleteMessageById(ctx.chat.id, user.lastBotMessageId);
      }

      const sent = await ctx.reply('🔐 Parolingizni kiriting:', {
        reply_markup: { remove_keyboard: true } // Keyboard ni olib tashlash
      });
      
      await this.prisma.user.update({
        where: { tgId },
        data: { lastBotMessageId: sent.message_id },
      });
    });

    // --- PAROL TEKSHIRUV ---
    this.bot.on('message:text', async (ctx) => {
      const tgId = String(ctx.from!.id);
      const text = ctx.message.text;
      const username = ctx.from?.username ?? null;

      const user = await this.prisma.user.findUnique({ where: { tgId } });
      if (!user) {
        // Start tugmasini ko'rsatmaslik uchun
        await ctx.reply('❗ Botni ishlatish uchun parolni kiriting.');
        return;
      }

      if (user.isBlocked) {
        await ctx.reply('🚫 Siz bloklangansiz.');
        return;
      }

      // Faqat foydalanuvchining parol xabarini o'chirish
      await this.safeDeleteMessage(ctx);

      // Eski bot xabarini o'chirish
      if (user.lastBotMessageId && ctx.chat?.id) {
        await this.deleteMessageById(ctx.chat.id, user.lastBotMessageId);
      }

      // Agar foydalanuvchi allaqachon autentifikatsiya qilingan bo'lsa
      if (user.isAuthenticated) {
        const keyboard = new InlineKeyboard()
          .text('📛 Bloklanganlar', 'view_blocked')
          .text('💬 Xabarlar', 'view_messages');

        const sent = await ctx.reply('✅ Siz allaqachon tizimga kirgansiz!', {
          reply_markup: keyboard,
        });

        await this.prisma.user.update({
          where: { tgId },
          data: { lastBotMessageId: sent.message_id },
        });
        return;
      }

      if (text !== process.env.BOT_PASSWORD) {
        const newCount = user.count + 1;
        const isBlocked = newCount >= 3;

        const sent = await ctx.reply(
          isBlocked
            ? '🚫 Urinishlar tugadi. Siz bloklandingiz.'
            : `❌ Noto'g'ri parol. Urinish: ${newCount}/3\n\n🔐 Parolingizni qayta kiriting:`,
          {
            reply_markup: { remove_keyboard: true }
          }
        );

        await this.prisma.user.update({
          where: { tgId },
          data: {
            count: newCount,
            isBlocked,
            lastBotMessageId: sent.message_id,
            username,
          },
        });

        return;
      }

      const keyboard = new InlineKeyboard()
        .text('📛 Bloklanganlar', 'view_blocked')
        .text('💬 Xabarlar', 'view_messages');

      const sent = await ctx.reply('✅ Admin panelga xush kelibsiz!', {
        reply_markup: keyboard,
      });

      await this.prisma.user.update({
        where: { tgId },
        data: {
          isAuthenticated: true,
          count: 0,
          lastBotMessageId: sent.message_id,
          username,
        },
      });
    });

    // --- 📛 BLOKLANGANLAR ---
    this.bot.callbackQuery('view_blocked', async (ctx) => {
      await ctx.answerCallbackQuery();

      const tgId = String(ctx.from!.id);
      const chatId = ctx.chat?.id;
      if (!chatId) return;

      // Autentifikatsiya tekshiruvi
      const user = await this.prisma.user.findUnique({ where: { tgId } });
      if (!user?.isAuthenticated) {
        await ctx.reply('❗ Iltimos, avval tizimga kiring. /start');
        return;
      }

      const blocked = await this.prisma.user.findMany({
        where: { isBlocked: true },
        select: { tgId: true, username: true },
      });

      let message = '';
      if (!blocked.length) {
        message = '✅ Bloklangan foydalanuvchilar yo\'q.';
      } else {
        const lines = blocked.map((u, i) => {
          const display = u.username
            ? `@${u.username}`
            : `[foydalanuvchi](tg://user?id=${u.tgId})`;
          return `${i + 1}) 👤 ${display}`;
        });

        message = `🚫 *Bloklangan foydalanuvchilar:*\n\n${lines.join('\n')}`;
      }

      const keyboard = new InlineKeyboard()
        .text('📛 Bloklanganlar', 'view_blocked')
        .text('💬 Xabarlar', 'view_messages')
        .row()
        .text('🏠 Bosh menyu', 'main_menu');

      try {
        // Xabarni edit qilishga harakat qilamiz
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      } catch (error) {
        // Agar edit bo'lmasa, yangi xabar yuboramiz
        const sent = await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });

        await this.prisma.user.update({
          where: { tgId },
          data: { lastBotMessageId: sent.message_id },
        });
      }
    });

    // --- 💬 XABARLAR ---
    this.bot.callbackQuery('view_messages', async (ctx) => {
      await ctx.answerCallbackQuery();

      const tgId = String(ctx.from!.id);
      const chatId = ctx.chat?.id;
      if (!chatId) return;

      // Autentifikatsiya tekshiruvi
      const user = await this.prisma.user.findUnique({ where: { tgId } });
      if (!user?.isAuthenticated) {
        await ctx.reply('❗ Iltimos, avval tizimga kiring. /start');
        return;
      }

      // Eng oxirgi xabarni olish
      const lastMessage = await this.prisma.messages.findFirst({
        orderBy: { id: 'desc' },
      });

      let messageText = '';
      if (!lastMessage) {
        messageText = '💬 Hozircha hech qanday xabar yo\'q.';
      } else {
        messageText = `💬 *Eng oxirgi xabar:*\n\n👤 *${lastMessage.fullName}*\n📱 ${lastMessage.phone}\n${lastMessage.telegram ? `📞 @${lastMessage.telegram}\n` : ''}💌 ${lastMessage.message}`;
      }

      const keyboard = new InlineKeyboard()
        .text('📛 Bloklanganlar', 'view_blocked')
        .text('💬 Xabarlar', 'view_messages')
        .row()
        .text('🏠 Bosh menyu', 'main_menu');

      try {
        // Xabarni edit qilishga harakat qilamiz
        await ctx.editMessageText(messageText, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      } catch (error) {
        // Agar edit bo'lmasa, yangi xabar yuboramiz
        const sent = await ctx.reply(messageText, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });

        await this.prisma.user.update({
          where: { tgId },
          data: { lastBotMessageId: sent.message_id },
        });
      }
    });

    // --- 🏠 BOSH MENYU ---
    this.bot.callbackQuery('main_menu', async (ctx) => {
      await ctx.answerCallbackQuery();

      const tgId = String(ctx.from!.id);
      const chatId = ctx.chat?.id;
      if (!chatId) return;

      const user = await this.prisma.user.findUnique({ where: { tgId } });
      if (!user?.isAuthenticated) {
        await ctx.reply('❗ Iltimos, avval tizimga kiring. /start');
        return;
      }

      const keyboard = new InlineKeyboard()
        .text('📛 Bloklanganlar', 'view_blocked')
        .text('💬 Xabarlar', 'view_messages');

      try {
        // Xabarni edit qilishga harakat qilamiz
        await ctx.editMessageText('✅ Admin panelga xush kelibsiz!', {
          reply_markup: keyboard,
        });
      } catch (error) {
        // Agar edit bo'lmasa, yangi xabar yuboramiz
        const sent = await ctx.reply('✅ Admin panelga xush kelibsiz!', {
          reply_markup: keyboard,
        });

        await this.prisma.user.update({
          where: { tgId },
          data: { lastBotMessageId: sent.message_id },
        });
      }
    });
  }

  async safeDeleteMessage(ctx: any) {
    try {
      await ctx.deleteMessage();
    } catch (e) {
      // Xabar allaqachon o'chirilgan yoki topilmagan
      console.log('Xabarni o\'chirishda xatolik:', e);
    }
  }

  async deleteMessageById(chatId: number, messageId: number) {
    try {
      await this.bot.api.deleteMessage(chatId, messageId);
    } catch (e) {
      // Xabar topilmagan bo'lishi mumkin - bu normal holat
    }
  }

  async contact(payload: ContactDto) {
    // Yangi xabarni saqlash
    const newMessage = await this.prisma.messages.create({
      data: {
        fullName: payload.fullName,
        phone: payload.phone,
        telegram: payload.telegram,
        message: payload.message,
      },
    });

    // Adminlarga yangi xabar haqida xabar yuborish
    const admins = await this.prisma.user.findMany({
      where: { 
        isAuthenticated: true,
        isBlocked: false 
      },
    });

    for (const admin of admins) {
      try {
        // Yangi xabar yuborish (oldingi xabarni o'chirmasdan)
        const keyboard = new InlineKeyboard()
          .text('📛 Bloklanganlar', 'view_blocked')
          .text('💬 Xabarlar', 'view_messages');

        const messageText = `🔔 *Yangi xabar keldi!*\n\n👤 *${newMessage.fullName}*\n📱 ${newMessage.phone}\n${newMessage.telegram ? `📞 @${newMessage.telegram}\n` : ''}💌 ${newMessage.message}`;

        const sent = await this.bot.api.sendMessage(Number(admin.tgId), messageText, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });

        // Faqat yangi xabar ID'sini yangilash, oldingi xabarni o'chirmasdan
        await this.prisma.user.update({
          where: { tgId: admin.tgId },
          data: { lastBotMessageId: sent.message_id },
        });
      } catch (error) {
        console.log(`Admin ${admin.tgId} ga xabar yuborishda xatolik:`, error);
      }
    }

    return { status: 'success', message: 'Message success send!' };
  }

  async onModuleInit() {
    try {
      await this.bot.api.deleteWebhook();
      
      // Bot commands ni o'rnatish/o'chirish
      await this.bot.api.setMyCommands([
        // Hech qanday command bermaslik - start tugmasi yo'qoladi
      ]);
      
    } catch (err: any) {
      console.warn('Webhookni o\'chirishda xatolik:', err.description || err.message);
    }

    await this.bot.start();
    console.log('🤖 Bot ishga tushdi...');
  }
}