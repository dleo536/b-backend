import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('metadata_albums')
export class MetadataAlbumEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 36, nullable: true })
  musicbrainzReleaseGroupId: string | null;
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 36, nullable: true })
  musicbrainzReleaseId: string | null;
  @Column({ type: 'varchar', length: 36, nullable: true }) musicbrainzArtistId:
    | string
    | null;
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, nullable: true })
  spotifyAlbumId: string | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) spotifyArtistId:
    | string
    | null;
  @Column({ type: 'text', nullable: true }) spotifyAlbumUrl: string | null;
  @Column({ type: 'text', nullable: true }) spotifyArtistUrl: string | null;
  @Column({ type: 'text', nullable: true }) spotifyImageUrl: string | null;
  @Column({ type: 'timestamptz', nullable: true })
  spotifyFetchedAt: Date | null;
  @Column({ type: 'varchar', length: 16, nullable: true }) metadataProvider:
    | string
    | null;
  @Column({ type: 'double precision', nullable: true })
  metadataMatchConfidence: number | null;
  @Column({ type: 'text', nullable: true }) title: string | null;
  @Column({ type: 'text', nullable: true }) artistName: string | null;
  @Column({ type: 'integer', nullable: true }) releaseYear: number | null;
  @Column({ type: 'varchar', length: 32, nullable: true }) albumType:
    | string
    | null;
  @Column({ type: 'jsonb', nullable: true }) musicbrainzSnapshot: Record<
    string,
    any
  > | null;
  @Column({ type: 'jsonb', nullable: true }) spotifySnapshot: Record<
    string,
    any
  > | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
