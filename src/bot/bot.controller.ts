import { Controller } from '@nestjs/common';
import { BotService } from './bot.service';
import { MessagePattern } from '@nestjs/microservices';
import { ContactDto } from './dto/contact.dto';

@Controller('bot')
export class BotController {
    constructor (private readonly botService: BotService) {}

    @MessagePattern('contact')
    contact (payload: ContactDto) {
        return this.botService.contact(payload);
    }
}
