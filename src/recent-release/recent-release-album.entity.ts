import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('recent_release_albums')
@Index(['spotifyAlbumId'], { unique: true })
@Index('IDX_recent_release_albums_sort', ['sortOrder', 'createdAt'])
export class RecentReleaseAlbum {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  spotifyAlbumId: string;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;

  @Column({ type: 'jsonb' })
  albumSnapshot: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
