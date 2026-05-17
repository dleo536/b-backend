import {
  IsIn,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LocationSourceValues } from '../user.entity';

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
  @Length(2, 2)
  countryCode?: string;

  @IsString()
  @IsOptional()
  @Length(1, 80)
  countryName?: string;

  @IsString()
  @IsOptional()
  @Length(1, 120)
  city?: string;

  @IsString()
  @IsOptional()
  @Length(1, 120)
  cityName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  regionName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsString()
  @IsOptional()
  @IsIn(LocationSourceValues)
  locationSource?: string;

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
