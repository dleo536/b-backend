import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export class TrackHighlightDto {
  @IsOptional() @IsString() @Length(1, 64)
  trackMbId?: string;

  @IsOptional() @IsString() @Length(1, 256)
  title?: string;

  @IsOptional() @IsBoolean()
  favorite?: boolean;

  @IsOptional() @Type(() => Number) @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 1 }) @Min(0) @Max(10)
  ratingHalfSteps?: number;

  @IsOptional() @IsString() @Length(1, 5000)
  comment?: string;
}
