import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from "typeorm";
import Post from "./Post";
import Subscription from "./Subscription";

@Entity()
export default class Topic {
	@PrimaryGeneratedColumn()
	id: number;

	@Column({ length: 255 })
    url: string;
    
    @Column({ length: 2000, nullable:true})
	announcement?: string;

	@Column({ length: 255 })
    name: string;
    
    @Column({ length: 255 })
    displayName: string;

    @OneToMany(type => Post, post => post.topic, {
    })
    posts: Post[];

    @OneToMany(type => Subscription, subscription => subscription.topic)
    subscriptions: Subscription[];
}
