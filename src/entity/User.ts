import { Entity, Column, OneToOne } from "typeorm";
import Subscription from "./Subscription";


/**
 * Telegram user
 */
@Entity()
export default class User {
	@Column({
		unique: true,
		primary: true,
	})
	id: number;

	@Column({
        length: 255,
        nullable: true
	})
	username?: string;
	
	// Basic permissions
	@Column({length:30, default:"guest"})
	role: "admin" | "guest"
}
