import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlbumList } from '../list/list.entity';
import { Review } from '../review/review.entity';
import { User } from '../user/user.entity';
import { CommentController } from './comment.controller';
import { Comment } from './comment.entity';
import { CommentService } from './comment.service';

@Module({
  imports: [TypeOrmModule.forFeature([Comment, Review, AlbumList, User])],
  controllers: [CommentController],
  providers: [CommentService],
})
export class CommentModule {}
