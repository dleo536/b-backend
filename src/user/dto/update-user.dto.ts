import { IsOptional, IsString, IsUrl, Length, MaxLength } from "class-validator";

export class UpdateUserDto {
    @IsString()
    @IsOptional()
    @Length(3, 24)
    username?: string;

    @IsString()
    @IsOptional()
    @MaxLength(120)
    displayName?: string;

    @IsString()
    @IsOptional()
    @MaxLength(500)
    bio?: string;

    @IsOptional()
    @IsUrl()
    avatarUrl?: string;

    @IsOptional()
    @IsUrl()
    bannerUrl?: string;

    @IsString()
    @IsOptional()
    @MaxLength(120)
    location?: string;

    @IsOptional()
    @IsUrl()
    websiteUrl?: string;
}
