import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRecentReleaseAlbumDto {
  @IsString()
  @IsNotEmpty()
  spotifyAlbumId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateRecentReleaseAlbumsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRecentReleaseAlbumDto)
  albums: CreateRecentReleaseAlbumDto[];
}
