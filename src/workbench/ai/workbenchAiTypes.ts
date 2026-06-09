import type { ComposerAttachment } from './composer/composerAttachmentTypes'

export type WorkbenchAiMessage = {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  /** 用户消息携带的附件（仅展示用；已上传为 nomi-local）。 */
  attachments?: ComposerAttachment[]
}
