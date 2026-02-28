// src/reviews/dto/update-review.dto.ts
import {
  IsArray, IsBoolean, IsDateString, IsEnum, IsInt,
  IsString, Length, Max, Min, ValidateNested, ArrayMaxSize,
  IsOptional,
  IsIn,
} from 'class-validator';
import { ReviewVisibility } from '../review.entity';

class TrackHighlightDto {
  @IsOptional() @IsString() @Length(1, 64)
  trackMbId?: string;

  @IsOptional() @IsString() @Length(1, 256)
  title?: string;

  @IsOptional() @IsBoolean()
  favorite?: boolean;

  @IsOptional() @IsInt() @Min(1) @Max(10)
  ratingHalfSteps?: number;

  @IsOptional() @IsString() @Length(1, 5000)
  comment?: string;
}

export class UpdateReviewDto {
  @IsOptional() @IsInt() @Min(1) @Max(10)
  ratingHalfSteps?: number;

  @IsOptional() @IsString() @Length(1, 140)
  headline?: string;

  @IsOptional() @IsString()
  body?: string;

  @IsOptional() @IsBoolean()
  isSpoiler?: boolean;

  @IsOptional() @IsBoolean()
  isDraft?: boolean;

  @IsOptional() @IsIn(Object.values(ReviewVisibility))
  visibility?: ReviewVisibility;

  @IsOptional() @IsDateString()
  listenedOn?: string;

  @IsOptional() @IsInt() @Min(0)
  relistenCount?: number;

  @IsOptional() @IsArray() @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  trackHighlights?: TrackHighlightDto[];

  @IsOptional() @IsArray()
  tags?: string[];
}
