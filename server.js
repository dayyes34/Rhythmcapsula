const express = require('express');
const bodyParser = require('body-parser');
const { Telegraf } = require('telegraf');
const fs = require('fs');
const cors = require('cors');
const path = require('path');

// Конфигурация
const config = {
  botToken: '8188912825:AAEEq8lTj3R_a0lx6OKPyt59Nc_jv04GRxs',
  adminChatId: '6533586308', // ID чата администратора
  port: process.env.PORT || 3000,
  webhookDomain: 'https://drumfitness.ru' // Замените на ваш домен
};

// Инициализация Express и Telegram бота
const app = express();
const bot = new Telegraf(config.botToken);

// Настройка middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Путь к файлам бронирования
const BOOKINGS_FILE = "./bookings.json";
const PENDING_FILE = "./pending_bookings.json";
const USERS_FILE = "./users.json";

// Инициализация файлов данных, если они не существуют
function initDataFile(filePath, defaultData = {}) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData));
    console.log(`Created file: ${filePath}`);
  }
}

initDataFile(PENDING_FILE, { room1: {}, room2: {} });
initDataFile(BOOKINGS_FILE, { room1: {}, room2: {} });
initDataFile(USERS_FILE, {});

// Функции для работы с данными
function readDataFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return {};
  }
}

function writeDataFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error writing file ${filePath}:`, error);
    return false;
  }
}

// API: Получение списка забронированных слотов
app.get('/api/booked-slots', (req, res) => {
  const room = req.query.room || 'room1';

  try {
    const pendingBookings = readDataFile(PENDING_FILE);
    const confirmedBookings = readDataFile(BOOKINGS_FILE);

    // Создаем объект для забронированных слотов
    const booked = {};

    // Добавляем подтвержденные бронирования
    for (const date in confirmedBookings[room]) {
      if (!booked[date]) booked[date] = [];

      for (const booking of confirmedBookings[room][date]) {
        booking.hours.forEach(hour => {
          if (!booked[date].includes(hour)) {
            booked[date].push(hour);
          }
        });
      }
    }

    // Добавляем ожидающие подтверждения бронирования
    for (const date in pendingBookings[room]) {
      if (!booked[date]) booked[date] = [];

      for (const booking of pendingBookings[room][date]) {
        booking.hours.forEach(hour => {
          if (!booked[date].includes(hour)) {
            booked[date].push(hour);
          }
        });
      }
    }

    res.json(booked);
    console.log(`Sent booked slots for ${room}`);
  } catch (error) {
    console.error('Error getting booked slots:', error);
    res.status(500).json({ status: 'ERROR', message: 'Внутренняя ошибка сервера' });
  }
});

// API: Создание нового бронирования
app.post('/api/bookings', async (req, res) => {
    try {
      const { date, hours, customer, username, room = 'room1', total_price } = req.body;
  
      if (!date || !hours || !hours.length) {
        return res.status(400).json({ status: 'ERROR', message: 'Неверные данные бронирования' });
      }
  
      console.log(`New booking request: ${date}, ${room}, ${hours.join(',')}, ${customer}`);
  
      // Загружаем текущие данные
      const pendingBookings = readDataFile(PENDING_FILE);
      const confirmedBookings = readDataFile(BOOKINGS_FILE);
      const users = readDataFile(USERS_FILE);
  
      // Проверяем доступны ли выбранные слоты
      const isSlotAvailable = (date, hour, room) => {
        // Проверяем подтвержденные бронирования
        if (confirmedBookings[room] && confirmedBookings[room][date]) {
          for (const booking of confirmedBookings[room][date]) {
            if (booking.hours.includes(hour)) {
              return false;
            }
          }
        }
  
        // Проверяем ожидающие бронирования
        if (pendingBookings[room] && pendingBookings[room][date]) {
          for (const booking of pendingBookings[room][date]) {
            if (booking.hours.includes(hour)) {
              return false;
            }
          }
        }
  
        return true;
      };
  
      // Проверяем каждый час на доступность
      for (const hour of hours) {
        if (!isSlotAvailable(date, hour, room)) {
          console.log(`Slot ${date} ${hour}:00 already booked`);
          return res.status(409).json({ 
            status: 'ERROR', 
            message: `Час ${hour}:00 уже забронирован` 
          });
        }
      }
  
      // Убедимся, что структура для комнаты и даты существует
      if (!pendingBookings[room]) {
        pendingBookings[room] = {};
      }
  
      if (!pendingBookings[room][date]) {
        pendingBookings[room][date] = [];
      }
  
    // Создаем новое бронирование
const bookingId = Date.now().toString();
const chatId = users[username]?.chatId;

const newBooking = {
  id: bookingId,
  date,
  hours,
  customer,
  username,
  chatId,
  total_price,
  room, // Важно включить комнату в объект
  createdAt: new Date().toISOString()
};

// Вместо повторного чтения файла
pendingBookings[room][date].push(newBooking);
writeDataFile(PENDING_FILE, pendingBookings);

// Сохраняем обновленный массив
const saved = writeDataFile(PENDING_FILE, pendingBookings);
console.log('Created new pending booking', bookingId, 'saved:', saved);
  



    // Отправляем уведомление администратору
    const roomName = room === 'room1' ? 'Капсула 🔵' : 'Капсула 🔴 ';
    const adminMsg = `🆕 Новое бронирование!\n\n` +
                     `👤 Клиент: ${customer}\n` +
                     `📅 Дата: ${date}\n` +
                     `🕒 Время: ${hours.map(h => `${h}:00`).join(', ')}\n` +
                     `🥁 Драм-Рум: ${roomName}\n` +
                     `💰 Стоимость: ${total_price} ₽\n\n` +
                     `Для подтверждения используйте команду:\n` +
                     `/confirm_${bookingId}\n\n` +
                     `Для отмены используйте команду:\n` +
                     `/cancel_${bookingId} Причина`;

    try {
      await bot.telegram.sendMessage(config.adminChatId, adminMsg);
      console.log(`Notification sent to admin (${config.adminChatId})`);
    } catch (telegramError) {
      console.error('Error sending message to admin:', telegramError);
    }

    // Отправляем уведомление пользователю, если у нас есть его chatId
    if (chatId) {
      const userMsg = `🎯 Ваша бронь принята и ожидает подтверждения!\n\n` +
                      `📅 Дата: ${date}\n` +
                      `🕒 Время: ${hours.map(h => `${h}:00`).join(', ')}\n` +
                      `🥁 Драм-Рум: ${roomName}\n` +
                      `💰 Стоимость: ${total_price} ₽\n\n` +
                      `Администратор скоро свяжется с Вами для подтверждения`;

      try {
        await bot.telegram.sendMessage(chatId, userMsg);
        console.log(`Notification sent to user (${chatId})`);
      } catch (telegramError) {
        console.error('Error sending message to user:', telegramError);
      }
    }

    res.json({ status: 'OK', bookingId });
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ status: 'ERROR', message: 'Внутренняя ошибка сервера' });
  }
});

// Обработчики команд бота

// Команда /start - сохранение информации о пользователе
bot.start(async (ctx) => {
  try {
    const users = readDataFile(USERS_FILE);
    const user = ctx.from;

    // Сохраняем chat_id и информацию о пользователе
    users[user.username || user.id] = {
      chatId: ctx.chat.id,
      firstName: user.first_name,
      lastName: user.last_name,
      username: user.username,
      registeredAt: new Date().toISOString()
    };

    writeDataFile(USERS_FILE, users);
    console.log(`User registered: ${user.username || user.id}, chat_id: ${ctx.chat.id}`);

    const sentMessage = await ctx.reply("Привет! Я бот бронирования Ритм Капсулы.", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🥁 Записаться на чилле", web_app: { url: `https://drumfitness.ru?chat_id=${ctx.chat.id}` } }],
          [{ text: "👋 Дать пять админам", callback_data: "high_five" }],
          [{ text: "🚨 SOS: есть вопросик!", url: "https://t.me/rhythmcapsule" }]
        ]
      }
    });// Команда /start - сохранение информации о пользователе
    bot.start(async (ctx) => {
      try {
        const users = readDataFile(USERS_FILE);
        const user = ctx.from;
    
        // Сохраняем chat_id и информацию о пользователе
        users[user.username || user.id] = {
          chatId: ctx.chat.id,
          firstName: user.first_name,
          lastName: user.last_name,
          username: user.username,
          registeredAt: new Date().toISOString()
        };
    
        writeDataFile(USERS_FILE, users);
        console.log(`User registered: ${user.username || user.id}, chat_id: ${ctx.chat.id}`);
    
        // Отправляем сообщение с inline-кнопками
        const sentMessage = await ctx.reply("🥁 Ритм Капсула - твоя территория барабанного релакса!", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🥁 Записаться на чилле", web_app: { url: `https://drumfitness.ru?chat_id=${ctx.chat.id}` } }],
              [{ text: "👋 Дать пять админам", callback_data: "high_five" }],
              [{ text: "🚨 SOS: есть вопросик!", url: "https://t.me/rhythmcapsule" }]
            ]
          }
        });
    
        // Закрепляем сообщение
        try {
          await ctx.pinChatMessage(sentMessage.message_id);
        } catch (pinError) {
          console.error('Error pinning message:', pinError);
          // Продолжаем работу, даже если закрепление не удалось
        }
    
        // Отправляем обычную клавиатуру с кнопкой быстрой брони
        await ctx.reply("Рад познакомиться! Я помогу забронировать Ритм Капсулу.", {
          reply_markup: {
            keyboard: [
              [{ text: "⚡ Быстрая бронь" }]
            ],
            resize_keyboard: true,
            persistent: true
          }
        });
      } catch (error) {
        console.error('Error in start command:', error);
        ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
      }
    });
    
    // Обработчик кнопки "Быстрая бронь" - просто отправляет инлайн-меню заново
    bot.hears("⚡ Быстрая бронь", async (ctx) => {
      try {
        await ctx.reply("Привет! Я бот бронирования Ритм Капсулы. Пришла пора стукнуть в барабаны?", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "☕️ Записаться на чилле", web_app: { url: `https://drumfitness.ru?chat_id=${ctx.chat.id}` } }],
              [{ text: "👋 Дать пять админам", callback_data: "high_five" }],
              [{ text: "🚨 SOS: есть вопросик!", url: "https://t.me/rhythmcapsule" }]
            ]
          }
        });
        // Не закрепляем это сообщение
      } catch (error) {
        console.error('Error in quick booking:', error);
        ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
      }
    });




// Обработчик нажатия на кнопку "Дать пять админам"
bot.action('high_five', async (ctx) => {
  const userId = ctx.from.id;
  const userName = ctx.from.username 
    ? `@${ctx.from.username}` 
    : `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim();

  // Сообщаем пользователю, что пятюня отправлена
  await ctx.answerCbQuery("👋 Пятюня отправлена!", {show_alert: true});
  await ctx.reply("👋 Твоя пятюня отправлена админам!");

  // Отправляем уведомление администратору
  try {
    await bot.telegram.sendMessage(config.adminChatId, 
      `👋 Пользователь ${userName} дал тебе пять!`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "👋 Дать пять в ответ", callback_data: `high_five_back_${userId}` }]
        ]
      }
    });
    console.log(`High five notification sent to admin from user ${userId}`);
  } catch (error) {
    console.error('Error sending high five to admin:', error);
  }
});

// Обработчик для ответной пятюни от админа
bot.action(/high_five_back_(\d+)/, async (ctx) => {
  if (ctx.chat.id.toString() !== config.adminChatId) {
    return ctx.reply('У вас нет прав для выполнения этой команды.');
  }

  const userId = ctx.match[1];

  // Запрашиваем сообщение от админа
  const adminMsg = await ctx.reply("Напиши короткое сообщение для пользователя:", {
    reply_markup: {
      force_reply: true
    }
  });

  // Создаем обработчик один раз для этого конкретного ответа
  bot.use(async (ctx, next) => {
    // Если это ответ на наше сообщение
    if (ctx.message && ctx.message.reply_to_message && 
        ctx.message.reply_to_message.message_id === adminMsg.message_id &&
        ctx.from.id.toString() === config.adminChatId) {

      const replyText = ctx.message.text;

      try {
        // Отправляем ответную пятюню пользователю
        await bot.telegram.sendMessage(userId, 
          `🖐 Админ дал тебе пять в ответ!\n\n💬 ${replyText}`);

        // Сообщаем админу об успешной отправке
        await ctx.reply("✅ Твоя пятюня и сообщение отправлены пользователю!");

      } catch (telegramError) {
        console.error('Error sending high five back to user:', telegramError);
        await ctx.reply("❌ Не удалось отправить сообщение пользователю.");
      }

      return; // Не передаем дальше, так как это специальный случай
    }

    await next(); // Продолжаем обработку для других сообщений
  });

  await ctx.answerCbQuery("Теперь напиши сообщение для пользователя");
});

// Команда /confirm_<bookingId> - подтверждение бронирования администратором
bot.hears(/\/confirm_(.+)/, async (ctx) => {
  try {
    // Проверяем, что команду выполняет администратор
    if (ctx.chat.id.toString() !== config.adminChatId) {
      return ctx.reply('У вас нет прав для выполнения этой команды');
    }

    const bookingId = ctx.match[1];
    if (!bookingId) {
      return ctx.reply('Укажите ID бронирования. Пример: /confirm_1234567890');
    }


    console.log(`Admin attempting to confirm booking: ${bookingId}`);

    // Ищем бронирование в списке ожидающих
    const pendingBookings = readDataFile(PENDING_FILE);
    const confirmedBookings = readDataFile(BOOKINGS_FILE);


// Поиск бронирования по ID
let foundBooking = null;
let foundRoom = null;
let foundDate = null;

// Ищем бронирование в вложенной структуре
for (const room in pendingBookings) {
  for (const date in pendingBookings[room]) {
    const index = pendingBookings[room][date].findIndex(
      booking => booking.id === parseInt(bookingId) || booking.id === bookingId
    );

    if (index !== -1) {
      foundBooking = pendingBookings[room][date][index];
      foundRoom = room;
      foundDate = date;

      // Удаляем бронирование из списка ожидающих
      pendingBookings[room][date].splice(index, 1);
      break;
    }
  }
  if (foundBooking) break;
}

if (!foundBooking) {
  console.log(`Booking ${bookingId} not found`);
  return ctx.reply(`Бронь с ID ${bookingId} не найдена`);
}

// Убедимся что структура для комнаты и даты существует
if (!confirmedBookings[foundRoom]) {
  confirmedBookings[foundRoom] = {};
}

if (!confirmedBookings[foundRoom][foundDate]) {
  confirmedBookings[foundRoom][foundDate] = [];
}

// Добавляем бронирование в список подтвержденных
foundBooking.confirmedAt = new Date().toISOString();
confirmedBookings[foundRoom][foundDate].push(foundBooking);

// Сохраняем изменения
writeDataFile(PENDING_FILE, pendingBookings);
writeDataFile(BOOKINGS_FILE, confirmedBookings);

console.log(`Booking ${bookingId} confirmed successfully`);

    const roomName = foundRoom === 'room1' ? 'Зал 1' : 'Зал 2';

    // Отправляем уведомление администратору
    ctx.reply(`☑️ Бронь #${bookingId} подтверждена успешно!`);

    // Отправляем уведомление пользователю, если у нас есть его chatId
    if (foundBooking.chatId) {
      const userMsg = `☑️ Ваша бронь подтверждена!\n\n` +
                     `📅 Дата: ${foundBooking.date}\n` +
                     `🕒 Время: ${foundBooking.hours.map(h => `${h}:00`).join(', ')}\n` +
                     `🥁 Драм-рум: ${roomName}\n` +
                     `💰 Стоимость: ${foundBooking.total_price} ₽\n\n` +
                     `Ждём вас! Если у вас возникнут вопросы, свяжитесь с нами`;

      try {
        await bot.telegram.sendMessage(foundBooking.chatId, userMsg);
        console.log(`Confirmation notification sent to user (${foundBooking.chatId})`);
      } catch (telegramError) {
        console.error('Error sending confirmation to user:', telegramError);
      }
    }
  } catch (error) {
    console.error('Error in confirm command:', error);
    ctx.reply('Произошла ошибка при подтверждении бронирования.');
  }
});

// Команда /cancel <bookingId> [причина] - отмена бронирования администратором
bot.hears(/\/cancel_(.+?)(?:\s+(.+))?$/, async (ctx) => {
  try {
    // Проверяем, что команду выполняет администратор
    if (ctx.chat.id.toString() !== config.adminChatId) {
      return ctx.reply('У вас нет прав для выполнения этой команды.');
    }

    const bookingId = ctx.match[1];
    const reason = ctx.match[2] || 'Причина не указана';

    if (!bookingId) {
      return ctx.reply('Пожалуйста, укажите ID брони. Пример: /cancel_1234567890 Причина отмены');
    }


    console.log(`Admin attempting to cancel booking: ${bookingId}`);

    // Ищем бронирование в списке ожидающих
    const pendingBookings = readDataFile(PENDING_FILE);

    let foundBooking = null;
    let foundRoom = null;
    let foundDate = null;

    // Поиск бронирования по ID
    for (const room in pendingBookings) {
      for (const date in pendingBookings[room]) {
        const index = pendingBookings[room][date].findIndex(booking => booking.id === bookingId);
        if (index !== -1) {
          foundBooking = pendingBookings[room][date][index];
          foundRoom = room;
          foundDate = date;

          // Удаляем бронирование из списка ожидающих
          pendingBookings[room][date].splice(index, 1);
          break;
        }
      }
      if (foundBooking) break;
    }

    if (!foundBooking) {
      console.log(`Booking ${bookingId} not found for cancellation`);
      return ctx.reply(`Бронирование с ID ${bookingId} не найдено.`);
    }

    // Сохраняем изменения
    writeDataFile(PENDING_FILE, pendingBookings);

    console.log(`Booking ${bookingId} cancelled successfully`);

    const roomName = foundRoom === 'room1' ? 'Капсула 🔵' : 'Капсула 🔴 ';

    // Отправляем уведомление администратору
    ctx.reply(`❌ Бронь #${bookingId} отменена`);

    // Отправляем уведомление пользователю, если у нас есть его chatId
    if (foundBooking.chatId) {
      const userMsg = `❌ Ваша бронь отменена\n\n` +
                     `📅 Дата: ${foundBooking.date}\n` +
                     `🕒 Время: ${foundBooking.hours.map(h => `${h}:00`).join(', ')}\n` +
                     `🥁 Драм-Рум: ${roomName}\n\n` +
                     `🤔 Причина: ${reason}\n\n` +
                     `Если у вас возникли вопросы, свяжитесь с нами`;

      try {
        await bot.telegram.sendMessage(foundBooking.chatId, userMsg);
        console.log(`Cancellation notification sent to user (${foundBooking.chatId})`);
      } catch (telegramError) {
        console.error('Error sending cancellation to user:', telegramError);
      }
    }
  } catch (error) {
    console.error('Error in cancel command:', error);
    ctx.reply('Произошла ошибка при отмене бронирования');
  }
});
// Команда /listconfirmed - просмотр подтвержденных бронирований
bot.command('bookings', async (ctx) => {
  try {
    // Проверяем, что команду выполняет администратор
    if (ctx.chat.id.toString() !== config.adminChatId) {
      return ctx.reply('У вас нет прав для выполнения этой команды.');
    }

    // Загружаем данные
    const confirmedBookings = readDataFile(BOOKINGS_FILE);

    // Подготавливаем сообщение
    let message = '📋 *Подтвержденные бронирования:*\n\n';
    let bookingsFound = false;

    // Проходимся по всем комнатам и датам
    for (const room in confirmedBookings) {
      for (const date in confirmedBookings[room]) {
        const bookings = confirmedBookings[room][date];

        if (bookings && bookings.length > 0) {
          message += `*Комната ${room}, ${date}:*\n`;

          bookings.forEach(booking => {
            const hours = booking.hours.join(', ');
            message += `ID: ${booking.id} | Часы: ${hours} | Клиент: ${booking.customer || 'Неизвестно'}\n`;
            message += `Подтверждено: ${new Date(booking.confirmedAt).toLocaleString('ru-RU')}\n\n`;
          });

          bookingsFound = true;
        }
      }
    }

    if (!bookingsFound) {
      message = 'Нет подтвержденных бронирований.';
    }

    return ctx.replyWithMarkdown(message);
  } catch (error) {
    console.error('Error listing confirmed bookings:', error);
    ctx.reply('Произошла ошибка при получении списка подтвержденных бронирований.');
  }
});

// Команда /deleteconfirmed_<bookingId> - удаление подтвержденного бронирования
bot.hears(/\/delete_(\d+)/, async (ctx) => {
  try {
    // Проверяем, что команду выполняет администратор
    if (ctx.chat.id.toString() !== config.adminChatId) {
      return ctx.reply('У вас нет прав для выполнения этой команды.');
    }

    if (!ctx.match[1]) {
      return ctx.reply('Пожалуйста, укажите ID бронирования. Пример: /delete_1234567890');
    }
    const bookingId = ctx.match[1]; // без parseInt - оставляем как строку

    // Загружаем данные
    const confirmedBookings = readDataFile(BOOKINGS_FILE);

    // Ищем и удаляем бронирование
    let bookingFound = false;
    let roomInfo = '';
    let dateInfo = '';

    // Проходимся по всем комнатам и датам
    for (const room in confirmedBookings) {
      for (const date in confirmedBookings[room]) {
        const bookingIndex = confirmedBookings[room][date].findIndex(booking => String(booking.id) === bookingId);

        if (bookingIndex !== -1) {
          // Сохраняем информацию для отчета
          const booking = confirmedBookings[room][date][bookingIndex];
          roomInfo = room;
          dateInfo = date;
          const hours = booking.hours.join(', ');

          // Удаляем бронирование
          confirmedBookings[room][date].splice(bookingIndex, 1);
          bookingFound = true;

           // Сохраняем изменения
           writeDataFile(BOOKINGS_FILE, confirmedBookings);

           return ctx.reply(
             `✅ Подтвержденное бронирование удалено:
 ID: ${bookingId}
 Комната: ${roomInfo}
 Дата: ${dateInfo}
 Часы: ${hours}
 Клиент: ${booking.customer || 'Неизвестно'}`
           );
        }
      }
    }

    if (!bookingFound) {
      return ctx.reply(`⚠️ Подтвержденное бронирование с ID ${bookingId} не найдено.`);
    }

  } catch (error) {
    console.error('Error deleting confirmed booking:', error);
    ctx.reply('Произошла ошибка при удалении подтвержденного бронирования.');
  }
});

// Команда /list - вывод всех ожидающих подтверждения бронирований
bot.command('list', async (ctx) => {
  try {
    // Проверяем, что команду выполняет администратор
    if (ctx.chat.id.toString() !== config.adminChatId) {
      return ctx.reply('У вас нет прав для выполнения этой команды.');
    }

    console.log('Admin requested pending bookings list');

    const pendingBookings = readDataFile(PENDING_FILE);

    let message = '📋 Список ожидающих подтверждения бронирований:\n\n';
    let hasBookings = false;

    for (const room in pendingBookings) {
      for (const date in pendingBookings[room]) {
        for (const booking of pendingBookings[room][date]) {
          hasBookings = true;
          message += `🆔 ${booking.id}\n` +
                     `👤 Клиент: ${booking.customer}\n` +
                     `📅 Дата: ${booking.date}\n` +
                     `🕒 Время: ${booking.hours.map(h => `${h}:00`).join(', ')}\n` +
                     `🏠 Драм-Рум: ${room === 'room1' ? '🔵' : '🔴'}\n` +
                     `💰 Стоимость: ${booking.total_price} ₽\n` +
                     `⏱ Создано: ${new Date(booking.createdAt).toLocaleString()}\n\n`;
        }
      }
    }

    if (!hasBookings) {
      message = '📂 Нет ожидающих подтверждения бронирований.';
    }

    await ctx.reply(message);
  } catch (error) {
    console.error('Error in list command:', error);
    ctx.reply('Произошла ошибка при получении списка бронирований.');
  }
});

// Команда /help - справка по командам
bot.command('help', (ctx) => {
  const isAdmin = ctx.chat.id.toString() === config.adminChatId;
  let message = '📌 Доступные команды:\n\n';

  message += '/start - Начать использование бота\n';

  if (isAdmin) {
    message += '\n🔐 Команды администратора:\n\n' +
              '/list - Показать все ожидающие бронирования\n' +
              '/confirm_ID - Подтвердить бронирование\n' +
              '/bookings - Список подтвержденных бронирований\n' +
              '/delete_ID - Удалить подтвержденное бронирование\n' +
              '/cancel_ID причина - Отменить бронирование\n';
  }

  ctx.reply(message);
});

// Настройка webhook для Telegram бота
const WEBHOOK_PATH = '/webhook/' + config.botToken;
const WEBHOOK_URL = config.webhookDomain + WEBHOOK_PATH;

// Обработчик webhook от Telegram
app.post(WEBHOOK_PATH, (req, res) => {
  bot.handleUpdate(req.body, res);
});

// Запуск сервера
app.listen(config.port, async () => {
  console.log(`Server is running on port ${config.port}`);

  try {
    // Устанавливаем webhook для бота
    await bot.telegram.setWebhook(WEBHOOK_URL);
    console.log('Webhook set successfully to:', WEBHOOK_URL);

    // Добавляем проверку статуса webhook
    const webhookInfo = await bot.telegram.getWebhookInfo();
    console.log('Webhook info:', webhookInfo);
  } catch (error) {
    console.error('Error setting webhook:', error);
    console.log('Falling back to polling mode...');

    // Если не удалось установить webhook, используем polling
    bot.launch().then(() => {
      console.log('Bot started in polling mode');
    }).catch(err => {
      console.error('Failed to start bot in polling mode:', err);
    });
  }
});

// Обработка ошибок и завершение работы
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.once('SIGINT', () => {
  bot.stop('SIGINT');
  console.log('Bot stopped due to SIGINT');
  process.exit(0);
});

process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  console.log('Bot stopped due to SIGTERM');
  process.exit(0);
})