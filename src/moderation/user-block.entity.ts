import {
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    Column,
} from "typeorm";
import { User } from "../user/user.entity";

@Entity("user_blocks")
@Index(["blockerId", "blockedId"], { unique: true })
@Index(["blockerId"])
@Index(["blockedId"])
export class UserBlock {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column("uuid")
    blockerId: string;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "blockerId" })
    blocker: User;

    @Column("uuid")
    blockedId: string;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "blockedId" })
    blocked: User;

    @CreateDateColumn()
    createdAt: Date;
}
