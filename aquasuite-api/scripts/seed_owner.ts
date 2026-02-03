import dotenv from 'dotenv'
import bcrypt from 'bcrypt'
import pg from 'pg'

dotenv.config()

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

async function run() {
  const username = 'khaledal'
  const pinPlain = 'Swim123!'
  const pinHash = await bcrypt.hash(pinPlain, 12)

  const existing = await pool.query(`SELECT id FROM users WHERE username=$1`, [username])
  if (existing.rowCount === 0) {
    await pool.query(
      `INSERT INTO users (first_name,last_name,username,pin_hash,must_change_pin,primary_role_id,is_active)
       VALUES ($1,$2,$3,$4,true,1,true)`,
      ['Khaled', 'Alomari', username, pinHash]
    )
    console.log('Created owner user:', username, 'PIN:', pinPlain)
  } else {
    console.log('Owner user already exists:', username)
  }

  await pool.end()
}

run().catch((e) => { console.error(e); process.exit(1) })
