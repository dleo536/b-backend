import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth-user.interface';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { OptionalFirebaseAuthGuard } from '../auth/optional-firebase-auth.guard';
import { CommentTargetType } from './comment.entity';
import { CommentService } from './comment.service';
import { toCommentResponse, toCommentResponses } from './comment-response';
import { CreateCommentDto } from './dto/create-comment.dto';

@Controller()
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @UseGuards(OptionalFirebaseAuthGuard)
  @Get('reviews/:id/comments')
  getReviewComments(
    @Param('id') id: string,
    @CurrentUser() currentUser?: AuthenticatedUser,
  ) {
    return this.commentService
      .findForTarget(CommentTargetType.REVIEW, id, currentUser?.uid)
      .then(toCommentResponses);
  }

  @UseGuards(FirebaseAuthGuard)
  @Post('reviews/:id/comments')
  createReviewComment(
    @Param('id') id: string,
    @Body() createCommentDto: CreateCommentDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.commentService
      .createForTarget(
        CommentTargetType.REVIEW,
        id,
        createCommentDto,
        currentUser.uid,
      )
      .then(toCommentResponse);
  }

  @UseGuards(OptionalFirebaseAuthGuard)
  @Get('lists/:id/comments')
  getListComments(
    @Param('id') id: string,
    @CurrentUser() currentUser?: AuthenticatedUser,
  ) {
    return this.commentService
      .findForTarget(CommentTargetType.LIST, id, currentUser?.uid)
      .then(toCommentResponses);
  }

  @UseGuards(FirebaseAuthGuard)
  @Post('lists/:id/comments')
  createListComment(
    @Param('id') id: string,
    @Body() createCommentDto: CreateCommentDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.commentService
      .createForTarget(
        CommentTargetType.LIST,
        id,
        createCommentDto,
        currentUser.uid,
      )
      .then(toCommentResponse);
  }
}
