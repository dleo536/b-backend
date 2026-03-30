import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";
import { User } from "./user.entity";

@Entity("user_follows")
@Index("IDX_user_follows_followerId", ["followerId"])
@Index("IDX_user_follows_followingId", ["followingId"])
export class UserFollow {
  @PrimaryColumn("uuid")
  followerId: string;

  @PrimaryColumn("uuid")
  followingId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "followerId" })
  follower: User;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "followingId" })
  following: User;

  @CreateDateColumn()
  createdAt: Date;
}
