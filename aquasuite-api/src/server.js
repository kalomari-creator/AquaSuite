import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import dotenv from 'dotenv'

dotenv.config()

const app = Fastify({ logger: true })

await app.register(cors, { origin: true })
await app.register(websocket)

app.get('/health', async () => {
  return { status: 'AquaSuite running' }
})

app.get('/ws', { websocket: true }, (connection) => {
  connection.socket.send(JSON.stringify({ message: 'connected to AquaSuite' }))
})

const start = async () => {
  try {
    await app.listen({
      port: process.env.PORT || 3000,
      host: '127.0.0.1'
    })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
