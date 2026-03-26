import { IsEmail, IsOptional, IsString, Length, Matches } from "class-validator";

export class CheckAvailabilityDto {
    @IsOptional()
    @IsString()
    @Length(3, 24)
    @Matches(/^[A-Za-z0-9._]+$/)
    username?: string;

    @IsOptional()
    @IsEmail()
    email?: string;
}
