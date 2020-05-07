import {
	Entity,
	Column,
	ManyToOne,
	PrimaryGeneratedColumn,
} from "typeorm";
import Topic from "./Topic";

/**
 * Subscription class
 */
@Entity()
export default class Subscription {
	@PrimaryGeneratedColumn()
	id: number;

	// Notify about new comments
	@Column({
		default: true,
	})
	newComments: boolean;

	// Notify about changed comments
	@Column({
		default: true,
	})
	changedComments: boolean;

	// Notify about changed comments
	@Column({
		default: true,
	})
	changedPosts: boolean;

	// Notify about changed comments
	@Column({
		default: false,
	})
	silent: boolean;

	// Notify about new announcements
	@Column({
		default: true,
	})
	newHeader: boolean;

	// Notify about new articles
	@Column({
		default: true,
	})
	newPosts: boolean;

	// Match commenter
	@Column({
		default: "",
	})
	commentMatch: string
	
	// Look for a word in header
	@Column({
		default: "",
	})
	headerMatch: string;

	// Subscription topic
	@ManyToOne((type) => Topic, (topic) => topic.subscriptions, { onDelete: "CASCADE" })
	topic: Topic;

	// Chat to send messages to
	@Column({
		type: "bigint",
		unique: false,
	})
	chatId: number;
}
