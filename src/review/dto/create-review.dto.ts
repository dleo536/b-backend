// src/reviews/dto/create-review.dto.ts
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUrl, Length, Max, Min, ValidateNested } from 'class-validator';
import { TrackHighlightDto } from './track-highlight.dto';
import { ReviewVisibility } from '../review.entity';

const LaunchReviewVisibilityValues = [ReviewVisibility.PUBLIC, ReviewVisibility.PRIVATE] as const;

export class CreateReviewDto {
  @IsString()
  @Length(1, 36)
  releaseGroupMbId: string;

  @IsOptional() @IsString() @Length(1, 36)
  releaseMbId?: string;

  @IsOptional() @IsString() @Length(1, 36)
  artistMbId?: string;

  @IsOptional() @IsString() @Length(1, 64)
  spotifyAlbumId?: string;

  @IsString() @Length(1, 512)
  albumTitleSnapshot: string;

  @IsString() @Length(1, 512)
  artistNameSnapshot: string;

  @IsOptional() @IsUrl()
  coverUrlSnapshot?: string;

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

  @IsOptional() @IsIn(LaunchReviewVisibilityValues)
  visibility?: 'public' | 'private';

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
