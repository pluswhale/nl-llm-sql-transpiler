import * as dotenv from 'dotenv';
dotenv.config();

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

const DB_PATH = (process.env.DATABASE_URL ?? 'file:./prisma/dev.db').replace('file:', '');
const resolved = path.resolve(process.cwd(), DB_PATH.replace(/^\.\//, ''));
const dir = path.dirname(resolved);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(resolved);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guest_name TEXT NOT NULL,
    channel TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'open'
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    direction TEXT NOT NULL,
    body TEXT NOT NULL,
    sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    label TEXT NOT NULL
  );
`);

db.prepare('DELETE FROM tags').run();
db.prepare('DELETE FROM messages').run();
db.prepare('DELETE FROM conversations').run();

interface ConversationSeed {
  guest_name: string;
  channel: string;
  created_at: string;
  status: string;
  tags: string[];
  messages: { direction: 'sent' | 'received'; body: string; offset: number }[];
}

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

const conversations: ConversationSeed[] = [
  {
    guest_name: 'Alice Morgan',
    channel: 'whatsapp',
    created_at: daysAgo(1),
    status: 'unanswered',
    tags: ['complaint', 'breakfast'],
    messages: [
      { direction: 'received', body: 'Hello, I had a problem with my breakfast this morning.', offset: 0 },
      { direction: 'received', body: 'The eggs were cold and the coffee was not fresh.', offset: 1 },
    ],
  },
  {
    guest_name: 'Bob Chen',
    channel: 'email',
    created_at: daysAgo(2),
    status: 'open',
    tags: ['wifi'],
    messages: [
      { direction: 'received', body: 'The wifi in room 204 keeps dropping.', offset: 0 },
      { direction: 'sent', body: 'We apologize for the inconvenience. Our technician will visit shortly.', offset: 2 },
      { direction: 'received', body: 'Thank you, please hurry.', offset: 3 },
    ],
  },
  {
    guest_name: 'Carol Davis',
    channel: 'sms',
    created_at: daysAgo(3),
    status: 'closed',
    tags: ['parking'],
    messages: [
      { direction: 'received', body: 'Is there parking available for tonight?', offset: 0 },
      { direction: 'sent', body: 'Yes, we have valet parking available 24/7.', offset: 1 },
      { direction: 'received', body: 'Perfect, thank you!', offset: 2 },
      { direction: 'sent', body: 'You are welcome. See you soon!', offset: 3 },
    ],
  },
  {
    guest_name: 'David Kim',
    channel: 'whatsapp',
    created_at: daysAgo(1),
    status: 'unanswered',
    tags: ['complaint'],
    messages: [
      { direction: 'received', body: 'The room was not cleaned when we checked in.', offset: 0 },
      { direction: 'received', body: 'This is unacceptable for a 5-star hotel.', offset: 1 },
    ],
  },
  {
    guest_name: 'Emma Wilson',
    channel: 'email',
    created_at: daysAgo(5),
    status: 'closed',
    tags: ['breakfast', 'parking'],
    messages: [
      { direction: 'received', body: 'Can I get breakfast delivered to my room?', offset: 0 },
      { direction: 'sent', body: 'Absolutely! Room service breakfast is available from 7-11am.', offset: 1 },
      { direction: 'received', body: 'Great, also do you validate parking?', offset: 2 },
      { direction: 'sent', body: 'Yes we do, please bring your ticket to the front desk.', offset: 3 },
      { direction: 'received', body: 'Perfect, will do!', offset: 4 },
    ],
  },
  {
    guest_name: 'Frank Torres',
    channel: 'sms',
    created_at: daysAgo(6),
    status: 'open',
    tags: ['wifi'],
    messages: [
      { direction: 'received', body: 'What is the wifi password?', offset: 0 },
      { direction: 'sent', body: 'The password is HotelGuest2024, enjoy your stay!', offset: 1 },
    ],
  },
  {
    guest_name: 'Grace Lee',
    channel: 'whatsapp',
    created_at: daysAgo(8),
    status: 'unanswered',
    tags: ['complaint'],
    messages: [
      { direction: 'received', body: 'The air conditioning in my room is broken.', offset: 0 },
    ],
  },
  {
    guest_name: 'Henry Park',
    channel: 'email',
    created_at: daysAgo(10),
    status: 'closed',
    tags: [],
    messages: [
      { direction: 'received', body: 'I would like to extend my stay by two nights.', offset: 0 },
      { direction: 'sent', body: 'That has been arranged. Your checkout is now Friday.', offset: 1 },
      { direction: 'received', body: 'Wonderful, thank you so much!', offset: 2 },
    ],
  },
  {
    guest_name: 'Iris Nakamura',
    channel: 'sms',
    created_at: daysAgo(4),
    status: 'unanswered',
    tags: ['breakfast', 'complaint'],
    messages: [
      { direction: 'received', body: 'I ordered breakfast but it never arrived.', offset: 0 },
      { direction: 'received', body: 'It has been over an hour.', offset: 30 },
    ],
  },
  {
    guest_name: 'James Brown',
    channel: 'whatsapp',
    created_at: daysAgo(12),
    status: 'closed',
    tags: ['parking'],
    messages: [
      { direction: 'received', body: 'Is there overnight parking?', offset: 0 },
      { direction: 'sent', body: 'Yes, $20 per night in our secure garage.', offset: 2 },
      { direction: 'received', body: 'Sounds good, I will use that.', offset: 3 },
      { direction: 'sent', body: 'Great, just let the valet know upon arrival.', offset: 4 },
    ],
  },
  {
    guest_name: 'Karen Smith',
    channel: 'email',
    created_at: daysAgo(2),
    status: 'open',
    tags: ['wifi', 'complaint'],
    messages: [
      { direction: 'received', body: 'The internet speed is incredibly slow today.', offset: 0 },
      { direction: 'sent', body: 'We are aware and working on it. Expected fix in 2 hours.', offset: 1 },
      { direction: 'received', body: 'I am working remotely and need it now. This is frustrating.', offset: 2 },
    ],
  },
  {
    guest_name: 'Leo Martinez',
    channel: 'sms',
    created_at: daysAgo(14),
    status: 'closed',
    tags: [],
    messages: [
      { direction: 'received', body: 'What time is checkout?', offset: 0 },
      { direction: 'sent', body: 'Standard checkout is 11am. Late checkout until 2pm is available for $30.', offset: 1 },
    ],
  },
  {
    guest_name: 'Mia Johnson',
    channel: 'whatsapp',
    created_at: daysAgo(1),
    status: 'unanswered',
    tags: ['breakfast'],
    messages: [
      { direction: 'received', body: 'Can I get a gluten-free breakfast option?', offset: 0 },
    ],
  },
  {
    guest_name: 'Nathan Clark',
    channel: 'email',
    created_at: daysAgo(20),
    status: 'closed',
    tags: ['complaint'],
    messages: [
      { direction: 'received', body: 'The noise from the street kept me up all night.', offset: 0 },
      { direction: 'sent', body: 'We sincerely apologize. We can move you to a quieter room.', offset: 2 },
      { direction: 'received', body: 'Yes please, that would be great.', offset: 3 },
      { direction: 'sent', body: 'Done! Room 512 is ready for you.', offset: 4 },
      { direction: 'received', body: 'Thank you for the swift response.', offset: 5 },
    ],
  },
  {
    guest_name: 'Olivia White',
    channel: 'sms',
    created_at: daysAgo(3),
    status: 'open',
    tags: ['parking'],
    messages: [
      { direction: 'received', body: 'My car is blocked in the parking lot.', offset: 0 },
      { direction: 'sent', body: 'Our valet team is on the way.', offset: 1 },
    ],
  },
  {
    guest_name: 'Peter Hall',
    channel: 'whatsapp',
    created_at: daysAgo(30),
    status: 'closed',
    tags: [],
    messages: [],
  },
  {
    guest_name: 'Quinn Adams',
    channel: 'email',
    created_at: daysAgo(7),
    status: 'unanswered',
    tags: ['complaint', 'wifi'],
    messages: [
      { direction: 'received', body: 'The TV and wifi both stopped working in my room.', offset: 0 },
      { direction: 'received', body: 'I also found a bug in the bathroom which is unacceptable.', offset: 5 },
    ],
  },
  {
    guest_name: 'Rachel Green',
    channel: 'sms',
    created_at: daysAgo(15),
    status: 'closed',
    tags: ['breakfast'],
    messages: [
      { direction: 'received', body: 'Does the breakfast include fresh juice?', offset: 0 },
      { direction: 'sent', body: 'Yes, we have orange, apple, and grapefruit juice daily.', offset: 1 },
      { direction: 'received', body: 'Perfect, looking forward to it!', offset: 2 },
    ],
  },
  {
    guest_name: 'Sam Turner',
    channel: 'whatsapp',
    created_at: daysAgo(9),
    status: 'open',
    tags: [],
    messages: [
      { direction: 'received', body: 'Can I get extra towels and pillows?', offset: 0 },
      { direction: 'sent', body: 'Of course! Housekeeping will bring them in 10 minutes.', offset: 1 },
    ],
  },
  {
    guest_name: 'Tina Foster',
    channel: 'email',
    created_at: daysAgo(6),
    status: 'unanswered',
    tags: ['complaint', 'breakfast'],
    messages: [
      { direction: 'received', body: 'I found a hair in my breakfast plate this morning.', offset: 0 },
      { direction: 'received', body: 'I expect a full refund for the meal.', offset: 2 },
    ],
  },
];

const insertConv = db.prepare(
  `INSERT INTO conversations (guest_name, channel, created_at, status) VALUES (?, ?, ?, ?)`,
);
const insertMsg = db.prepare(
  `INSERT INTO messages (conversation_id, direction, body, sent_at) VALUES (?, ?, ?, ?)`,
);
const insertTag = db.prepare(`INSERT INTO tags (conversation_id, label) VALUES (?, ?)`);

const seedAll = db.transaction(() => {
  for (const conv of conversations) {
    const { lastInsertRowid } = insertConv.run(conv.guest_name, conv.channel, conv.created_at, conv.status);
    const convId = Number(lastInsertRowid);

    for (const msg of conv.messages) {
      const sentAt = new Date(new Date(conv.created_at).getTime() + msg.offset * 60_000).toISOString();
      insertMsg.run(convId, msg.direction, msg.body, sentAt);
    }

    for (const label of conv.tags) {
      insertTag.run(convId, label);
    }
  }
});

seedAll();

const convCount = (db.prepare('SELECT COUNT(*) as n FROM conversations').get() as { n: number }).n;
const msgCount = (db.prepare('SELECT COUNT(*) as n FROM messages').get() as { n: number }).n;
const tagCount = (db.prepare('SELECT COUNT(*) as n FROM tags').get() as { n: number }).n;

console.log(`Seeded: ${convCount} conversations, ${msgCount} messages, ${tagCount} tags`);
db.close();
