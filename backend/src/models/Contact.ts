import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Unique,
  Default,
  HasMany
} from "sequelize-typescript";
import ContactCustomField from "./ContactCustomField";
import Ticket from "./Ticket";

interface ContactCreation {
  name: string; number?: string | null;
  lid?: string; email?: string; profilePicUrl?: string; isGroup?: boolean; extraInfo?: Array<{name: string; value: string}>;
}

@Table
class Contact extends Model<Contact, ContactCreation> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  name: string;

  @Unique
  @Column
  number: string;

  @Unique
  @Column
  lid: string;

  @AllowNull(false)
  @Default("")
  @Column
  email: string;

  @Column
  profilePicUrl: string;

  @Default(false)
  @Column
  isGroup: boolean;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => Ticket)
  tickets: Ticket[];

  @HasMany(() => ContactCustomField)
  extraInfo: ContactCustomField[];
}

export default Contact;
