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

            await this.safeDeleteMessage(ctx);

            let user = await this.prisma.user.findUnique({ where: { tgId } });
            if (!user) {
                user = await this.prisma.user.create({ data: { tgId, username } });
            } else {
                await this.prisma.user.update({
                    where: { tgId },
                    data: { username, count: 0, isAuthenticated: false },
                });
            }

            if (user.lastBotMessageId && ctx.chat?.id) {
                await this.deleteMessageById(ctx.chat.id, user.lastBotMessageId);
            }

            const sent = await ctx.reply('🔐 Parolingizni kiriting:');
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

            await this.safeDeleteMessage(ctx);

            const user = await this.prisma.user.findUnique({ where: { tgId } });
            if (!user) {
                await ctx.reply('❗ Iltimos, /start buyrug‘ini yuboring.');
                return;
            }

            if (user.isBlocked) {
                await ctx.reply('🚫 Siz bloklangansiz.');
                return;
            }

            if (user.lastBotMessageId && ctx.chat?.id) {
                await this.deleteMessageById(ctx.chat.id, user.lastBotMessageId);
            }

            if (text !== process.env.BOT_PASSWORD) {
                const newCount = user.count + 1;
                const isBlocked = newCount >= 3;

                const sent = await ctx.reply(
                    isBlocked
                        ? '🚫 Urinishlar tugadi. Siz bloklandingiz.'
                        : `❌ Noto‘g‘ri parol. Urinish: ${newCount}/3`
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

            // ✅ Parol to‘g‘ri → admin panel
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

            const user = await this.prisma.user.findUnique({ where: { tgId } });
            if (user?.lastBotMessageId) {
                await this.deleteMessageById(chatId, user.lastBotMessageId);
            }

            const blocked = await this.prisma.user.findMany({
                where: { isBlocked: true },
                select: { tgId: true, username: true },
            });

            let message = '';
            if (!blocked.length) {
                message = '✅ Bloklangan foydalanuvchilar yo‘q.';
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
                .text('💬 Xabarlar', 'view_messages');

            const sent = await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard,
            });

            await this.prisma.user.update({
                where: { tgId },
                data: { lastBotMessageId: sent.message_id },
            });
        });

        // --- 💬 XABARLAR (bo‘sh holat) ---
        this.bot.callbackQuery('view_messages', async (ctx) => {
            await ctx.answerCallbackQuery();

            const tgId = String(ctx.from!.id);
            const chatId = ctx.chat?.id;
            if (!chatId) return;

            const user = await this.prisma.user.findUnique({ where: { tgId } });
            if (user?.lastBotMessageId) {
                await this.deleteMessageById(chatId, user.lastBotMessageId);
            }

            const keyboard = new InlineKeyboard()
                .text('📛 Bloklanganlar', 'view_blocked')
                .text('💬 Xabarlar', 'view_messages');

            const sent = await ctx.reply('💬 Hozircha hech qanday xabar yo‘q.', {
                reply_markup: keyboard,
            });

            await this.prisma.user.update({
                where: { tgId },
                data: { lastBotMessageId: sent.message_id },
            });
        });
    }

    // Foydalanuvchi xabarini o‘chirish
    async safeDeleteMessage(ctx: any) {
        try {
            await ctx.deleteMessage();
        } catch (e) {
            // xatoni yutamiz
        }
    }

    // Istalgan xabarni o‘chirish
    async deleteMessageById(chatId: number, messageId: number) {
        try {
            await this.bot.api.deleteMessage(chatId, messageId);
        } catch (e) {
            // quietly ignore
        }
    }


    async contact(payload: ContactDto) {
        await this.prisma.messages.create({
            data: {
                fullName: payload.fullName,
                phone: payload.phone, 
                message: payload.message,
                telegram: payload.telegram,
            }
        })

        return { status: 'success', message: 'Message success send !' };
    }

    async onModuleInit() {
        await this.bot.start();
        console.log('🤖 Bot ishga tushdi...');
    }
}
