import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlbumList, ListVisibility } from '../list/list.entity';
import { ModerationService } from '../moderation/moderation.service';
import { Review, ReviewVisibility } from '../review/review.entity';
import { User } from '../user/user.entity';
import { Comment, CommentTargetType } from './comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    @InjectRepository(Review)
    private readonly reviewRepository: Repository<Review>,
    @InjectRepository(AlbumList)
    private readonly listRepository: Repository<AlbumList>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly moderationService: ModerationService,
  ) {}

  private async findUserByIdentifier(identifier?: string): Promise<User | null> {
    if (!identifier?.trim()) {
      return null;
    }

    const normalized = identifier.trim();
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        normalized,
      );

    return this.userRepository.findOne({
      where: isUuid ? { id: normalized } : { oauthId: normalized },
    });
  }

  private canViewReview(review: Review, viewerUserId?: string | null) {
    if (review.isDraft) {
      return Boolean(viewerUserId) && review.userId === viewerUserId;
    }

    return (
      review.visibility === ReviewVisibility.PUBLIC ||
      (Boolean(viewerUserId) && review.userId === viewerUserId)
    );
  }

  private canViewList(list: AlbumList, viewerUserId?: string | null) {
    return (
      list.visibility === ListVisibility.PUBLIC ||
      (Boolean(viewerUserId) && list.ownerId === viewerUserId)
    );
  }

  private async assertTargetCanBeViewed(
    targetType: CommentTargetType,
    targetId: string,
    viewerUserId?: string | null,
  ) {
    if (targetType === CommentTargetType.REVIEW) {
      const review = await this.reviewRepository.findOne({ where: { id: targetId } });
      if (!review) {
        throw new NotFoundException('Review not found');
      }
      if (!this.canViewReview(review, viewerUserId)) {
        throw new ForbiddenException('You cannot view this review');
      }
      return;
    }

    const list = await this.listRepository.findOne({ where: { id: targetId } });
    if (!list) {
      throw new NotFoundException('List not found');
    }
    if (!this.canViewList(list, viewerUserId)) {
      throw new ForbiddenException('You cannot view this list');
    }
  }

  async findForTarget(
    targetType: CommentTargetType,
    targetId: string,
    viewerFirebaseUid?: string,
  ) {
    const viewerUser = viewerFirebaseUid
      ? await this.findUserByIdentifier(viewerFirebaseUid)
      : null;

    await this.assertTargetCanBeViewed(targetType, targetId, viewerUser?.id || null);

    return this.commentRepository.find({
      where: { targetType, targetId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  async createForTarget(
    targetType: CommentTargetType,
    targetId: string,
    createCommentDto: CreateCommentDto,
    currentFirebaseUid: string,
  ) {
    const body = createCommentDto.body?.trim();
    if (!body) {
      throw new BadRequestException('Comment body is required');
    }

    const user = await this.findUserByIdentifier(currentFirebaseUid);
    if (!user) {
      throw new NotFoundException('Authenticated user profile not found');
    }

    await this.assertTargetCanBeViewed(targetType, targetId, user.id);
    this.moderationService.assertTextFieldsAreAllowed([
      { label: 'comment', value: body },
    ]);

    const comment = this.commentRepository.create({
      userId: user.id,
      targetType,
      targetId,
      body,
    });

    const savedComment = await this.commentRepository.save(comment);

    if (targetType === CommentTargetType.REVIEW) {
      await this.reviewRepository.increment({ id: targetId }, 'commentsCount', 1);
    } else {
      await this.listRepository.increment({ id: targetId }, 'commentsCount', 1);
    }

    return this.commentRepository.findOneOrFail({
      where: { id: savedComment.id },
      relations: ['user'],
    });
  }
}
