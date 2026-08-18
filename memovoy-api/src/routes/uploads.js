import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { z } from 'zod'
import { agentIdentifyDestinationFromPhoto } from '../services/aiAgent.js'

const ENDPOINT      = process.env.S3_ENDPOINT
const BUCKET        = process.env.S3_BUCKET ?? 'memovoy'
const REGION        = process.env.AWS_REGION ?? 'eu-west-1'
const MAX_IMAGE_SIZE = 10 * 1024 * 1024  // 10 MB
const MAX_VIDEO_SIZE = 200 * 1024 * 1024 // 200 MB

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID     ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  },
  ...(ENDPOINT && {
    endpoint:       ENDPOINT,
    forcePathStyle: true,
  }),
})

const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png':  ['png'],
  'image/webp': ['webp'],
  'image/gif':  ['gif'],
}

const ALLOWED_VIDEO_TYPES = {
  'video/mp4':  ['mp4'],
  'video/webm': ['webm'],
  'video/quicktime': ['mov'],
}

// Validates buffer magic bytes match the declared MIME type
export function checkMagicBytes(buf, mimeType) {
  if (buf.length < 8) return false
  if (mimeType === 'image/jpeg')
    return buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF
  if (mimeType === 'image/png')
    return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47
  if (mimeType === 'image/gif')
    return buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38
  if (mimeType === 'image/webp')
    return buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
           buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  if (mimeType === 'video/webm')
    return buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3
  // MP4/MOV: ftyp box typically at byte 4
  if (mimeType === 'video/mp4' || mimeType === 'video/quicktime')
    return buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70
  return true
}

export async function uploadsRoutes(app) {
  // POST /uploads/image — multipart, proxied through API
  app.post('/image', { preHandler: [app.authenticate], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const data = await request.file()
    if (!data) return reply.status(400).send({ message: 'Nenhum ficheiro enviado.' })

    const contentType = data.mimetype
    if (!(contentType in ALLOWED_IMAGE_TYPES)) {
      return reply.status(400).send({ message: 'Tipo de ficheiro não permitido.' })
    }

    const ext = data.filename.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_IMAGE_TYPES[contentType]?.includes(ext)) {
      return reply.status(400).send({ message: 'Extensão não corresponde ao tipo declarado.' })
    }

    const buffer = await data.toBuffer()
    if (buffer.length > MAX_IMAGE_SIZE) {
      return reply.status(400).send({ message: 'Ficheiro demasiado grande (máx 10MB).' })
    }
    if (!checkMagicBytes(buffer, contentType)) {
      return reply.status(400).send({ message: 'O conteúdo do ficheiro não corresponde ao tipo declarado.' })
    }

    const key = `uploads/${request.user.id}/${Date.now()}.${ext}`
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType, Body: buffer }))

    const publicUrl = ENDPOINT
      ? `${ENDPOINT}/${BUCKET}/${key}`
      : `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`

    reply.send({ publicUrl, key })
  })

  // POST /uploads/presign — returns a pre-signed PUT URL for direct browser upload
  app.post('/presign', { preHandler: [app.authenticate], config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const schema = z.object({
      filename:    z.string().min(1).max(255),
      contentType: z.string().min(1).max(100),
      size:        z.number().positive(),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    const { filename, contentType, size } = parsed.data
    const isVideo = contentType in ALLOWED_VIDEO_TYPES
    const isImage = contentType in ALLOWED_IMAGE_TYPES
    const ALLOWED  = isImage ? ALLOWED_IMAGE_TYPES : isVideo ? ALLOWED_VIDEO_TYPES : null

    if (!ALLOWED) return reply.status(400).send({ message: 'Tipo de ficheiro não suportado.' })

    const ext = filename.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED[contentType]?.includes(ext)) {
      return reply.status(400).send({ message: 'Extensão não corresponde ao tipo declarado.' })
    }

    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE
    if (size > maxSize) {
      return reply.status(400).send({ message: `Ficheiro demasiado grande (máx ${isVideo ? '200MB' : '10MB'}).` })
    }

    const folder = isVideo ? 'videos' : 'uploads'
    const key    = `${folder}/${request.user.id}/${Date.now()}.${ext}`

    const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType })
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 })

    const publicUrl = ENDPOINT
      ? `${ENDPOINT}/${BUCKET}/${key}`
      : `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`

    reply.send({ uploadUrl, publicUrl, key })
  })

  // POST /uploads/recognize-destination — identify travel destination from photo URL
  app.post('/recognize-destination', { preHandler: [app.authenticate], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const schema = z.object({
      imageUrl: z.string().refine(
        (v) => v.startsWith('https://') || v.startsWith('data:image/'),
        { message: 'imageUrl deve ser uma URL https ou data URI de imagem.' },
      ).refine(
        (v) => v.startsWith('data:image/') ? v.length <= 1_500_000 : v.length <= 2048,
        { message: 'URL demasiado longa.' },
      ),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    try {
      const result = await agentIdentifyDestinationFromPhoto(parsed.data.imageUrl)
      reply.send(result)
    } catch {
      reply.status(500).send({ message: 'Não foi possível identificar o destino. Tenta novamente.' })
    }
  })
}
