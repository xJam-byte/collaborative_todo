import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean existing data
  await prisma.invitation.deleteMany();
  await prisma.task.deleteMany();
  await prisma.listMember.deleteMany();
  await prisma.todoList.deleteMany();
  await prisma.user.deleteMany();

  // Create two hardcoded users
  const passwordHash = await bcrypt.hash('password123', 10);

  const alice = await prisma.user.create({
    data: {
      email: 'alice@example.com',
      name: 'Alice',
      password: passwordHash,
    },
  });

  const bob = await prisma.user.create({
    data: {
      email: 'bob@example.com',
      name: 'Bob',
      password: passwordHash,
    },
  });

  console.log(`✅ Created users: Alice (${alice.id}), Bob (${bob.id})`);

  // Create a shared list
  const sharedList = await prisma.todoList.create({
    data: {
      title: 'Shared Project Tasks',
      ownerId: alice.id,
      members: {
        createMany: {
          data: [
            { userId: alice.id, role: 'ADMIN' },
            { userId: bob.id, role: 'MEMBER' },
          ],
        },
      },
    },
  });

  console.log(`✅ Created shared list: ${sharedList.title} (${sharedList.id})`);

  // Create some sample tasks
  const tasks = await Promise.all([
    prisma.task.create({
      data: {
        text: 'Set up project infrastructure',
        completed: true,
        position: 'a',
        listId: sharedList.id,
        creatorId: alice.id,
      },
    }),
    prisma.task.create({
      data: {
        text: 'Implement user authentication',
        completed: false,
        position: 'b',
        listId: sharedList.id,
        creatorId: alice.id,
      },
    }),
    prisma.task.create({
      data: {
        text: 'Design the frontend UI',
        completed: false,
        position: 'c',
        listId: sharedList.id,
        creatorId: bob.id,
      },
    }),
    prisma.task.create({
      data: {
        text: 'Add real-time sync with WebSockets',
        completed: false,
        position: 'd',
        listId: sharedList.id,
        creatorId: alice.id,
      },
    }),
    prisma.task.create({
      data: {
        text: 'Write documentation',
        completed: false,
        position: 'e',
        listId: sharedList.id,
        creatorId: bob.id,
      },
    }),
  ]);

  console.log(`✅ Created ${tasks.length} sample tasks`);

  // Create Alice's personal list
  const aliceList = await prisma.todoList.create({
    data: {
      title: "Alice's Personal Notes",
      ownerId: alice.id,
      members: {
        create: {
          userId: alice.id,
          role: 'ADMIN',
        },
      },
    },
  });

  await prisma.task.create({
    data: {
      text: 'Review project requirements',
      completed: false,
      position: 'a',
      listId: aliceList.id,
      creatorId: alice.id,
    },
  });

  console.log(`✅ Created Alice's personal list`);

  console.log('\n📋 Seed data:');
  console.log('  User 1: alice@example.com / password123');
  console.log('  User 2: bob@example.com / password123');
  console.log(`  Shared List: "${sharedList.title}"`);
  console.log('  - Alice is ADMIN, Bob is MEMBER');
  console.log('\n🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
