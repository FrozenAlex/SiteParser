import {
	Entity,
	Column,
	ManyToOne,
	PrimaryGeneratedColumn,
	OneToOne,
	JoinColumn,
	PrimaryColumn,
} from "typeorm";
import Topic from "./Topic";
import User from "./User";

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

	// Notify about new announcements
	@Column({
		default: true,
	})
	newAnnouncements: boolean;

	// Notify about new articles
	@Column({
		default: true,
	})
	newArticles: boolean;

	// Admin articles
	@Column({
		default: true,
	})
	newAdminArticles: boolean;

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
