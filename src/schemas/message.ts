import { model, Schema } from 'mongoose'

interface IMessage {
  userId: number //From telegram id
  messages_base64: string[]
}

const messageSchema = new Schema<IMessage>({
  userId: Number,
  messages_base64: [String]
})
const MessageModel = model('Message', messageSchema)

export default MessageModel
