// src/lists/entities/album-list.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
  ManyToOne, JoinColumn
} from 'typeorm';
import { User } from '../user/user.entity';
//   import { AlbumListItem } from './album-list-item.entity';

export enum ListVisibility {
  PUBLIC = 'public',
  FRIENDS = 'friends',
  PRIVATE = 'private',
}

export enum ListType {
  CUSTOM = 'custom',
  FAVORITES = 'favorites',       // e.g., “Favorite Albums”
  TOP_N = 'top_n',               // e.g., “Top 100”
  YEAR = 'year',                 // e.g., “Best of 2024”
  THEME = 'theme',               // e.g., “Rainy Day Records”
}

@Entity('album_lists')
@Index(['ownerId', 'slug'], { unique: true })              // pretty URL per user
@Index(['visibility'])
@Index(['createdAt'])
export class AlbumList {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Ownership
  @Column('uuid')
  ownerId: string; // UUID FK to users.id

  @ManyToOne(() => User, u => u.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @Column({ type: 'varchar', length: 128, nullable: true })
  firebaseUid?: string; // Firebase UID (stored separately, no relation)

  // Identity / display
  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'varchar', length: 140 })
  slug: string; // lowercase, url-safe; enforce per-user uniqueness

  @Column({ type: 'enum', enum: ListType, default: ListType.CUSTOM })
  listType: ListType;

  @Column({ type: 'boolean', default: false })
  isSystem: boolean; // true for auto-created lists (Backlog/Favorites)

  @Column({ type: 'enum', enum: ListVisibility, default: ListVisibility.PUBLIC })
  visibility: ListVisibility;

  @Column({ type: 'text', nullable: true })
  description?: string;

  // Album references in this list (Spotify album IDs)
  @Column({ type: 'varchar', array: true, default: '{}' })
  albumIds: string[];

  // Visuals
  @Column({ type: 'varchar', length: 255, nullable: true })
  coverUrl?: string; // optional list cover (e.g., collage)

  // Collaboration
  @Column({ type: 'boolean', default: false })
  isCollaborative: boolean;

  // If collaborative, store editor user IDs (lightweight). For heavy use, make a join table.
  @Column({ type: 'varchar', array: true, default: '{}' })
  editorIds: string[]; // Firebase UIDs

  // Ordering / behavior
  @Column({ type: 'boolean', default: false })
  isPinned: boolean; // pin to profile

  @Column({ type: 'boolean', default: false })
  isLocked: boolean; // prevent edits without unlocking (great for “Top 100”)

  // Counters (denormalized)
  @Column({ type: 'integer', default: 0 })
  itemsCount: number;

  @Column({ type: 'integer', default: 0 })
  followersCount: number; // if you add list-follows

  @Column({ type: 'integer', default: 0 })
  likesCount: number;

  @Column({ type: 'integer', default: 0 })
  commentsCount: number;

  // Relations
  // @OneToMany(() => AlbumListItem, item => item.list, { cascade: ['insert', 'update'] })
  // items: AlbumListItem[];

  // Bookkeeping
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;

  // Optional: first publish timestamp if you add drafts later
  // @Column({ type: 'timestamptz', nullable: true }) publishedAt?: Date;
}
