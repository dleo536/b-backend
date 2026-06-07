import { Comment } from './comment.entity';

export const toCommentResponse = (comment: Comment) => ({
  id: comment.id,
  userId: comment.userId,
  username: comment.user?.username || 'Unknown user',
  displayName: comment.user?.displayName || null,
  avatarUrl: comment.user?.avatarUrl || null,
  targetType: comment.targetType,
  targetId: comment.targetId,
  body: comment.body,
  createdAt: comment.createdAt,
  updatedAt: comment.updatedAt,
});

export const toCommentResponses = (comments: Comment[]) =>
  comments.map(toCommentResponse);
