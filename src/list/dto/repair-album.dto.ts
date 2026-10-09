import { IsString, IsUUID, Length, Matches } from 'class-validator';

export class PreviewAlbumRepairDto {
  @IsUUID()
  albumId: string;

  @IsString()
  @Matches(/^[A-Za-z0-9]{22}$/)
  spotifyAlbumId: string;

  @IsString()
  @Length(5, 1000)
  reason: string;
}

export class ApplyAlbumRepairDto extends PreviewAlbumRepairDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  previewFingerprint: string;
}
