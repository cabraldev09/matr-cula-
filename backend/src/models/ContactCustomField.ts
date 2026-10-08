import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo
} from "sequelize-typescript";
import Contact from "./Contact";

interface ContactCustomFieldCreation {
  contactId: number; name: string; value: string;
  id?: number;
}

@Table
class ContactCustomField extends Model<ContactCustomField, ContactCustomFieldCreation> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  name: string;

  @Column
  value: string;

  @ForeignKey(() => Contact)
  @Column
  contactId: number;

  @BelongsTo(() => Contact)
  contact: Contact;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default ContactCustomField;
