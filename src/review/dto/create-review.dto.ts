// src/reviews/dto/create-review.dto.ts
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { ReviewVisibility } from '../review.entity';

export class CreateReviewDto {
  @IsOptional() @IsString() @Length(1, 128)
  firebaseUid?: string; // Firebase UID - mapped to User.id in service

  @IsOptional() @IsString() @Length(1, 128)
  userId?: string; // Backend UUID (preferred) or legacy UID identifier

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

  @IsOptional() @IsString()
  coverUrlSnapshot?: string;

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

  @IsOptional()
  trackHighlights?: Array<{ trackMbId?: string; title?: string; favorite?: boolean; ratingHalfSteps?: number; comment?: string }>;

  @IsOptional()
  tags?: string[];
}
