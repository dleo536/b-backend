import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../user/user.entity';
import { Review } from './review.entity';

@Entity('review_likes')
@Index('IDX_review_likes_userId', ['userId'])
@Index('IDX_review_likes_reviewId', ['reviewId'])
export class ReviewLike {
  @PrimaryColumn('uuid')
  userId: string;

  @PrimaryColumn('uuid')
  reviewId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Review, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reviewId' })
  review: Review;

  @CreateDateColumn()
  createdAt: Date;
}
