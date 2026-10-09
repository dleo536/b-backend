import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('metadata_artists')
export class MetadataArtistEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 36, nullable: true })
  musicbrainzArtistId: string | null;
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, nullable: true })
  spotifyArtistId: string | null;
  @Column({ type: 'text', nullable: true }) name: string | null;
  @Column({ type: 'text', nullable: true }) spotifyArtistUrl: string | null;
  @Column({ type: 'text', nullable: true }) spotifyImageUrl: string | null;
  @Column({ type: 'timestamptz', nullable: true })
  spotifyFetchedAt: Date | null;
  @Column({ type: 'varchar', length: 16, nullable: true }) metadataProvider:
    | string
    | null;
  @Column({ type: 'double precision', nullable: true })
  metadataMatchConfidence: number | null;
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
