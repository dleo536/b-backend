import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";
import { User } from "../user/user.entity";
import { AlbumList } from "./list.entity";

@Entity("list_likes")
@Index("IDX_list_likes_userId", ["userId"])
@Index("IDX_list_likes_listId", ["listId"])
export class ListLike {
  @PrimaryColumn("uuid")
  userId: string;

  @PrimaryColumn("uuid")
  listId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @ManyToOne(() => AlbumList, { onDelete: "CASCADE" })
  @JoinColumn({ name: "listId" })
  list: AlbumList;

  @CreateDateColumn()
  createdAt: Date;
}
