import {
    IsDateString,
    IsOptional,
    IsString,
    IsUrl,
    Length,
    MaxLength,
} from "class-validator";

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
    @MaxLength(160)
    bio?: string;

    @IsOptional()
    @IsDateString()
    dateOfBirth?: string;

    @IsString()
    @IsOptional()
    @Length(1, 80)
    country?: string;

    @IsString()
    @IsOptional()
    @Length(1, 120)
    city?: string;

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
