import { IsMobilePhone, IsNotEmpty, IsString, MaxLength } from "class-validator"

export class ContactDto {

    @IsNotEmpty()
    @IsString()
    fullName: string

    @IsMobilePhone('uz-UZ')
    phone: string

    @IsString()
    telegram: string

    @IsString()
    @MaxLength(10000)
    message: string
}