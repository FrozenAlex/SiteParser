import { Entity, Column } from "typeorm";

@Entity()
export default class Cookie {
        @Column({
                length: 100,
                unique: true,
                primary:true
        })
        username: string;

        @Column({ length: 255, nullable: false })
        value: string;

        @Column()
        expires: Date;
}