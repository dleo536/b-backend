import {
  ArrayMaxSize,
  IsArray,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class AddModeratorAlbumDto {
  @IsString()
  @Matches(
    /^(?:[A-Za-z0-9]{22}|[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12})$/,
  )
  albumId: string;
}

export class EditModeratorAlbumsDto {
  @IsArray()
  @ArrayMaxSize(10000)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  albumIds: string[];

  // The list shown in the editor: reject stale edits instead of losing additions.
  @IsArray()
  @ArrayMaxSize(10000)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  expectedAlbumIds: string[];
}
