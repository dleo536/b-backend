// src/users/entities/user.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from 'typeorm';
import { Review } from '../review/review.entity';

export const AuthProvider = {
  LOCAL: 'local',
  GOOGLE: 'google',
  APPLE: 'apple',
  GITHUB: 'github',
  SPOTIFY: 'spotify',
} as const;

export type AuthProvider = 'local' | 'google' | 'apple' | 'github' | 'spotify';

export const AuthProviderValues = ['local', 'google', 'apple', 'github', 'spotify'];

export const UserRole = {
  USER: 'user',
  MOD: 'mod',
  ADMIN: 'admin',
} as const;

export type UserRole = 'user' | 'mod' | 'admin';

export const UserRoleValues = ['user', 'mod', 'admin'];

export const ProfileVisibility = {
  PUBLIC: 'public',
  FRIENDS: 'friends',
  PRIVATE: 'private',
} as const;

export type ProfileVisibility = 'public' | 'friends' | 'private';

export const ProfileVisibilityValues = ['public', 'friends', 'private'];

@Entity('user')
@Index(['emailLower'], { unique: true })
@Index(['usernameLower'], { unique: true })
@Index(['createdAt'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // --- Identity ---
  @Column({ type: 'varchar', length: 64 })
  username: string; // user-facing (preserve case)

  @Column({ type: 'varchar', length: 64, unique: true })
  usernameLower: string; // store lowercase for unique/case-insensitive lookups

  @Column({ type: 'varchar', length: 120, nullable: true })
  displayName?: string;

  // --- Contact / Auth ---
  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  emailLower?: string; // normalized email; nullable if account is OAuth-only without email

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  passwordHash?: string; // null for OAuth-only

  @Column({ type: 'enum', enum: AuthProviderValues, default: AuthProvider.LOCAL })
  authProvider: AuthProvider;

  @Column({ type: 'varchar', length: 191, nullable: true })
  oauthId?: string; // provider user id

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt?: Date;

  // --- Profile ---
  @Column({ type: 'text', nullable: true })
  bio?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  avatarUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  bannerUrl?: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  location?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  websiteUrl?: string;

  // --- Social/Music IDs (for imports, scrobbling, linking)
  @Column({ type: 'jsonb', default: {} })
  externalIds: {
    spotifyUserId?: string;
    lastfmUsername?: string;
    musicbrainzUserId?: string;
    discogsUsername?: string;
    appleMusicTokenRef?: string; // if you store a token reference/id (not the token)
  };

  // --- Preferences (UI + behavior) ---
  @Column({
    type: 'jsonb', default: {
      theme: 'system',
      ratingScale: 'HALF_STARS', // HALF_STARS | QUARTER_STARS | TEN_POINT
      defaultReviewVisibility: 'public',
      showListeningActivity: true,
      allowCommentsFrom: 'everyone', // everyone | followers | nobody
    }
  })
  preferences: {
    theme?: 'light' | 'dark' | 'system';
    ratingScale?: 'HALF_STARS' | 'QUARTER_STARS' | 'TEN_POINT';
    defaultReviewVisibility?: ProfileVisibility | 'public' | 'friends' | 'private';
    showListeningActivity?: boolean;
    allowCommentsFrom?: 'everyone' | 'followers' | 'nobody';
  };

  @Column({ type: 'enum', enum: ProfileVisibilityValues, default: ProfileVisibility.PUBLIC })
  profileVisibility: ProfileVisibility;

  // --- Roles / moderation ---
  @Column({ type: 'enum', enum: UserRoleValues, array: true, default: [UserRole.USER] })
  roles: UserRole[];

  @Column({ type: 'boolean', default: false })
  isSuspended: boolean;

  @Column({ type: 'text', nullable: true })
  suspendReason?: string;

  // --- Taste (lightweight, optional) ---
  @Column({ type: 'text', array: true, default: '{}' })
  favoriteGenres: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  favoriteArtists: string[];

  // --- Counters (denormalized for fast queries) ---
  @Column({ type: 'integer', default: 0 })
  followersCount: number;

  @Column({ type: 'integer', default: 0 })
  followingCount: number;

  @Column({ type: 'integer', default: 0 })
  reviewsCount: number;

  @Column({ type: 'integer', default: 0 })
  likesReceivedCount: number;

  // --- Onboarding ---
  @Column({ type: 'boolean', default: false })
  isOnboarded: boolean;

  @Column({ type: 'smallint', default: 0 })
  onboardingStep: number;

  // --- Relations ---
  @OneToMany(() => Review, (review) => review.user)
  reviews: Review[];

  // If/when you add these tables:
  // @OneToMany(() => ReviewLike, (like) => like.user) likes: ReviewLike[];
  // @OneToMany(() => ReviewComment, (c) => c.user) comments: ReviewComment[];

  // --- Bookkeeping ---
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
