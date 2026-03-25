// src/reviews/dto/update-review.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsNumber,
  IsString, Length, Max, Min, ValidateNested, ArrayMaxSize, IsInt,
  IsOptional,
} from 'class-validator';
import { TrackHighlightDto } from './track-highlight.dto';

export class UpdateReviewDto {
  @IsOptional() @Type(() => Number) @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 1 }) @Min(0) @Max(10)
  ratingHalfSteps?: number;

  @IsOptional() @IsString() @Length(1, 140)
  headline?: string;

  @IsOptional() @IsString()
  body?: string;

  @IsOptional() @IsBoolean()
  isSpoiler?: boolean;

  @IsOptional() @IsBoolean()
  isDraft?: boolean;

  @IsOptional() @IsDateString()
  listenedOn?: string;

  @IsOptional() @IsInt() @Min(0)
  relistenCount?: number;

  @IsOptional() @IsArray() @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TrackHighlightDto)
  trackHighlights?: TrackHighlightDto[];

  @IsOptional() @IsArray() @ArrayMaxSize(50)
  @IsString({ each: true }) @Length(1, 64, { each: true })
  tags?: string[];
}
