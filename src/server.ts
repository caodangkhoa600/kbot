import OpenAI from 'openai'
import app from './app'
import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import mongoose from 'mongoose'
import MessageModel from './schemas/message'

const PORT = 8080
const openai = new OpenAI({ apiKey: process.env.GPT_TOKEN })

const formatMessageForTelegram = (message: string): string => {
  return (
    message
      .replace(/</g, '&lt;') // Escape <
      .replace(/>/g, '&gt;') // Escape >
      // Format ### Headings
      .replace(/^### (.+)$/gm, '<b>$1</b>') // H3 -> Bold
      .replace(/^## (.+)$/gm, '<b>$1</b>') // H2 -> Bold
      .replace(/^# (.+)$/gm, '<b>$1</b>') // H1 -> Bold
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')

      // Format *italic* → <i>italic</i>
      .replace(/\*(.*?)\*/g, '<i>$1</i>')

      // Format Code Blocks (```language ... ```)
      .replace(/```(\w+)?\n([\s\S]+?)```/g, (match, lang, code) => {
        return `<pre>${code.trim()}</pre>`
      })

      // Format Inline Code (`code`) → <code>code</code>
      .replace(/`([^`]+)`/g, '<code>$1</code>')
  )
}

function toBinary(text: string) {
  const codeUnits = new Uint16Array(text.length)
  for (let i = 0; i < codeUnits.length; i++) {
    codeUnits[i] = text.charCodeAt(i)
  }
  return btoa(String.fromCharCode(...new Uint8Array(codeUnits.buffer)))
}

function fromBinary(encoded: string) {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return String.fromCharCode(...new Uint16Array(bytes.buffer))
}

const callOpenAI = async (message: string, previousMessage: string[]): Promise<string> => {
  const userMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []

  if (previousMessage.length > 0) {
    previousMessage.forEach((text) => {
      userMessages.push({
        role: 'developer',
        content: `${text}`
      })
    })
  }

  userMessages.push({
    role: 'user',
    content: `${message}`
  })

  const completion = await openai.chat.completions.create({
    model: 'o3',
    messages: userMessages,
    store: true
  })
  if (!completion.choices[0].message.content) {
    return 'Can not get answer'
  }
  return formatMessageForTelegram(completion.choices[0].message.content)
}

async function addMessage(userChatId: number, message: string) {
  let userMessage = await MessageModel.findOne({
    userId: userChatId
  }).exec()

  if (userMessage) {
    userMessage.messages_base64.push(toBinary(message))
  } else {
    userMessage = new MessageModel({
      userId: userChatId,
      messages_base64: [toBinary(message)]
    })
  }

  await userMessage.save()
}

app.listen(PORT, async () => {
  // set-up datebase
  await mongoose.connect(process.env.MONGO_URL ?? '')

  const telegramBotToken: string | undefined = process.env.TELEGRAM_BOT_TOKEN
  const bot = new Telegraf(telegramBotToken ?? '')

  bot.command('newchat', async (ctx) => {
    MessageModel.deleteOne({
      userId: ctx.from.id
    }).exec()
    ctx.reply('You can start a new conversation')
  })

  bot.on(message('text'), async (ctx) => {
    ctx.telegram.sendMessage(ctx.message.chat.id, 'Chờ tí')
    const previous = await MessageModel.findOne({
      userId: ctx.from.id
    }).exec()

    const messages = previous?.messages_base64.map((text) => fromBinary(text)) ?? []

    const data = await callOpenAI(ctx.message.text, messages)

    const splited = data.split(/\n\s*\n/).filter((e) => e)

    for (let index = 0; index < splited.length; index++) {
      const element = splited[index]
      await ctx.telegram.sendMessage(ctx.message.chat.id, element, { parse_mode: 'HTML' })
    }
    addMessage(ctx.from.id, ctx.message.text)
  })

  bot.launch()
  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'))
  process.once('SIGTERM', () => bot.stop('SIGTERM'))
})
