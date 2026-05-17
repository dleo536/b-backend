import {
  IsIn,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LocationSourceValues } from '../user.entity';

export class CompleteOnboardingDetailsDto {
  @IsDateString()
  dateOfBirth: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  country?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryCode?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  countryName?: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 120)
  cityName: string;

  @IsOptional()
  @IsString()
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

  @IsOptional()
  @IsString()
  @IsIn(LocationSourceValues)
  locationSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  bio?: string;
}
