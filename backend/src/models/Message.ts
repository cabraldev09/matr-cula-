import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  DataType,
  PrimaryKey,
  Default,
  BelongsTo,
  ForeignKey
} from "sequelize-typescript";
import Contact from "./Contact";
import Ticket from "./Ticket";
import { sign } from "jsonwebtoken";
import authConfig from "../config/auth";

interface MessageCreation {
  id: string; ticketId: number; body: string;
  contactId?: number; fromMe?: boolean; read?: boolean; mediaType?: string; mediaUrl?: string; ack?: number; quotedMsgId?: string;
}

@Table
class Message extends Model<Message, MessageCreation> {
  @PrimaryKey
  @Column
  id: string;

  @Default(0)
  @Column
  ack: number;

  @Default(false)
  @Column
  read: boolean;

  @Default(false)
  @Column
  fromMe: boolean;

  @Column(DataType.TEXT)
  body: string;

  @Column(DataType.STRING)
  get mediaUrl(): string | null {
    const filename = this.getDataValue("mediaUrl");
    if (filename) {
      const mediaToken = sign({ scope: "media", filename }, authConfig.secret, {
        algorithm: "HS256", expiresIn: "5m"
      });
      return `${process.env.BACKEND_URL}:${
        process.env.PROXY_PORT
      }/public/${encodeURIComponent(filename)}?mediaToken=${encodeURIComponent(mediaToken)}`;
    }
    return null;
  }

  @Column
  mediaType: string;

  @Default(false)
  @Column
  isDeleted: boolean;

  @CreatedAt
  @Column(DataType.DATE(6))
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE(6))
  updatedAt: Date;

  @ForeignKey(() => Message)
  @Column
  quotedMsgId: string;

  @BelongsTo(() => Message, "quotedMsgId")
  quotedMsg: Message;

  @ForeignKey(() => Ticket)
  @Column
  ticketId: number;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  @ForeignKey(() => Contact)
  @Column
  contactId: number;

  @BelongsTo(() => Contact, "contactId")
  contact: Contact;
}

export default Message;
