import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

/** Own collection keyed by roomId — never embedded in Room (coding-standards §5.3). */
@Schema({ timestamps: { createdAt: "createdAt", updatedAt: false } })
export class ChatMessageDocument extends Document {
  @Prop({ type: String, required: true })
  roomId!: string;

  @Prop({ type: String, required: true })
  userId!: string;

  @Prop({ type: String, required: true })
  authorName!: string;

  @Prop({ type: String, required: true, maxlength: 1000 })
  content!: string;

  @Prop({ type: Date, default: null })
  editedAt?: Date | null;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;

  createdAt!: Date;
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessageDocument);

// History pagination: newest first within a room, cursor on _id.
ChatMessageSchema.index({ roomId: 1, _id: -1 });
