import {
    IsDateString,
    IsEmail,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUrl,
    Length,
    MaxLength,
} from "class-validator";
export class CreateUserDto {

    @IsOptional() @IsEmail()
    email?: string;

    @IsString()
    @IsNotEmpty()
    @Length(3, 24)
    username: string;

    @IsOptional() @IsString() @MaxLength(160)
    bio?: string;

    @IsOptional() @IsDateString()
    dateOfBirth?: string;

    @IsOptional() @IsString() @Length(1, 80)
    country?: string;

    @IsOptional() @IsString() @Length(1, 120)
    city?: string;

    @IsOptional() @IsUrl()
    avatarUrl?: string;

    @IsOptional() @IsUrl()
    bannerUrl?: string;

    @IsOptional() @IsString() @MaxLength(120)
    location?: string;

    @IsOptional() @IsUrl()
    websiteUrl?: string;
    @IsOptional()
    @IsString()
    @Length(1, 80)
    firstName?: string;

    @IsOptional()
    @IsString()
    @Length(1, 80)
    lastName?: string;
}
