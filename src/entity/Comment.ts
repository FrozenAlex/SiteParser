import { Entity, Column, ManyToOne, PrimaryColumn } from "typeorm";
import Post from "./Post";

/**
 * Site comments
 */
@Entity()
export default class Comment {
	@PrimaryColumn({unique:true})
    id: number;

    @Column({length:255})
    title: string;
    
    @Column({length: 255})
    author: string;
    
    @Column()
	lastUpdate: Date;

    // TODO: Figure out the max size
	@Column({type: "longtext"})
	content: string;

	@ManyToOne((type) => Post, (post) => post.comments, {onDelete: "CASCADE"})
	post: Post;
}
