import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, Index, ManyToOne, JoinColumn } from "typeorm";
import { User } from "../user/user.entity";

const numericRatingTransformer = {
  to: (value?: number | null) => {
    if (value === null || value === undefined) {
      return value;
    }

    return Number(value.toFixed(1));
  },
  from: (value?: string | number | null) => {
    if (value === null || value === undefined) {
      return value;
    }

    return Number(value);
  },
};

export const ReviewVisibility = {
  PUBLIC: 'public',
  FRIENDS: 'friends',
  PRIVATE: 'private',
} as const;

export type ReviewVisibility = 'public' | 'friends' | 'private';

export const ReviewVisibilityValues = ['public', 'friends', 'private'];




@Entity('reviews')
@Index(['userId', 'releaseGroupMbId'], {
  unique: true,
  where: '"isDraft" = false', // allow multiple drafts, but only one published review per album per user
})
@Index('idx_review_album_lookup', ['releaseGroupMbId'])
@Index('idx_review_visibility', ['visibility'])
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // --- Ownership ---
  @Column('uuid')
  userId: string; // UUID FK to users.id

  @ManyToOne(() => User, (user) => user.reviews, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 128, nullable: true })
  firebaseUid?: string; // Firebase UID (stored separately, no relation)

  // --- Album identity (normalized to release group) ---
  @Column({ type: 'uuid', nullable: true })
  albumId?: string; // If you keep a local Album table; otherwise omit.

  @Column({ type: 'varchar', length: 36 })
  releaseGroupMbId: string; // MusicBrainz Release Group ID (primary “album” key)

  @Column({ type: 'varchar', length: 36, nullable: true })
  releaseMbId?: string; // Specific release pressing, optional

  @Column({ type: 'varchar', length: 36, nullable: true })
  artistMbId?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  spotifyAlbumId?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  discogsMasterId?: string;

  // --- Snapshots (denormalized for stable rendering even if upstream data changes) ---
  @Column({ type: 'varchar', length: 512 })
  albumTitleSnapshot: string;

  @Column({ type: 'varchar', length: 512 })
  artistNameSnapshot: string;

  @Column({ type: 'text', nullable: true })
  coverUrlSnapshot?: string;

  // --- Review content ---
  // Stored as a 10-point score with one decimal place, e.g. 9.2 / 10.
  @Column({ type: 'numeric', precision: 3, scale: 1, nullable: true, transformer: numericRatingTransformer })
  ratingHalfSteps?: number;

  @Column({ type: 'varchar', length: 140, nullable: true })
  headline?: string;

  @Column({ type: 'text', nullable: true })
  body?: string;

  @Column({ type: 'boolean', default: false })
  isSpoiler: boolean;

  @Column({ type: 'boolean', default: false })
  isDraft: boolean;

  @Column({ type: 'enum', enum: ReviewVisibilityValues, default: ReviewVisibility.PUBLIC })
  visibility: ReviewVisibility;


  // --- Optional arrays / JSON (PostgreSQL) ---
  @Column({ type: 'text', array: true, default: '{}' })
  tags: string[];

  /**
   * Lightweight per-track notes/faves/ratings without creating a full join table.
   * Example shape:
   * [
   *   { trackMbId: '...', title: 'Intro', favorite: true, ratingHalfSteps: 8.5 },
   *   { trackMbId: '...', title: 'Track 2', comment: 'great chorus' }
   * ]
   */
  @Column({ type: 'jsonb', nullable: true })
  trackHighlights?: Array<{
    trackMbId?: string;
    title?: string;
    favorite?: boolean;
    ratingHalfSteps?: number;
    comment?: string;
  }>;

  // --- Counters (denormalized; keep in sync via service/Domain events) ---
  @Column({ type: 'integer', default: 0 })
  likesCount: number;

  @Column({ type: 'integer', default: 0 })
  commentsCount: number;

  // --- “Diary log” style fields ---
  @Column({ type: 'date', nullable: true })
  listenedOn?: string; // user’s watch/listen date

  @Column({ type: 'integer', default: 0 })
  relistenCount: number;

  // --- Bookkeeping ---
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Optional: capture the first time a review became non-draft
  @Column({ type: 'timestamptz', nullable: true })
  publishedAt?: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
