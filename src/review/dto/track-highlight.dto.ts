import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";

export class TrackHighlightDto {
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
