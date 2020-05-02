import { Entity, Column, ManyToOne, OneToMany, PrimaryGeneratedColumn, BeforeInsert } from "typeorm";
import Topic from "./Topic";
import Comment from "./Comment";
import { randomString } from "../helpers";

@Entity()
export default class Post {
	// Article id
	@PrimaryGeneratedColumn()
	id: number;

	// Short url
	@Column({length:6})
	url: string;

	// Title
	@Column({length:255})
	title: string;

	// Original article url
	@Column({length:1000})
	originalUrl: string;

	// The author of the article
	@Column({length: 255, nullable: true})
    author?: string; 

	// Short description of an article
	@Column({type: "text" })
	excerpt: string; 
	
	// Count of comments for updates
	@Column()
	commentCount: number;

	// Last update of the post
	@Column({nullable:true})
	lastUpdate?: Date;

	// TODO: Figure out the max size
	// Content of the article
	@Column({ nullable: false, type: "longtext" })
	content: string;

    // Topic of the article
    @ManyToOne(type => Topic, topic => topic.posts, {
		onDelete:"CASCADE"
	})
	topic: Topic;
	
	// Comments
	@OneToMany(type => Comment, comment => comment.post, {
	})
	comments: Comment[];
	
	// Generate url before insert
	@BeforeInsert()
	generateUrl() {
		this.url = randomString(6);
	}
}
