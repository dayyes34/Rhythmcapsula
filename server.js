// СНАЧАЛА УСТАНОВИ ПАКЕТЫ через npm:
// npm install express cors axios uuid telegraf

// ✅ Загрузка библиотек
const express = require('express');
const fs = require('fs');
const cors = require('cors');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { Telegraf } = require('telegraf');

// Константы и настройки
const app = express();
const PORT = 3000;
app.use(express.json());
app.use(cors());

// 🔴 ВАЖНО: Здесь вставь свои личные данные!
const BOT_TOKEN = '8188912825:AAEEq8lTj3R_a0lx6OKPyt59Nc_jv04GRxs'; // тут вставь токен от @BotFather
const ADMIN_CHAT_ID = '533586308'; // тут вставь ID админа

// Файлы данных (Убедись, что файлы существуют на сервере)
const BOOKINGS_FILE = 'bookings.json';
const PENDING_FILE = 'pending-bookings.json';

// Функции загрузки и сохранения данных
const loadBookings = () => fs.existsSync(BOOKINGS_FILE) ? JSON.parse(fs.readFileSync(BOOKINGS_FILE)) : [];
const saveBookings = bookings => fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));

const loadPending = () => fs.existsSync(PENDING_FILE) ? JSON.parse(fs.readFileSync(PENDING_FILE)) : [];
const savePending = pending => fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2));

// API: подтверждённые слоты
app.get('/api/bookings', (req, res) => {
  res.json(loadBookings());
});

// API: создать заявку
app.post('/api/bookings', (req, res) => {
  const { date, hours, customer, username, totalprice } = req.body;
  const pending = loadPending();
  const id = pending.length ? Math.max(...pending.map(b => b.id)) + 1 : 1;
  const booking = { id, date, hours, customer, username, totalprice };
  pending.push(booking);
  savePending(pending);
  notifyAdmin(booking);
  notifyCustomer(booking);
  res.json({ status: 'OK', bookingId: id });
});

// Инициализация Telegram-бота
const bot = new Telegraf(BOT_TOKEN);

// Команда /start
bot.start(ctx => ctx.reply("👋 Привет! Здесь будут уведомления о ваших заявках."));

// Уведомления в Telegram
const notifyAdmin = (booking) => {
  const txt = `📩 Новая заявка #${booking.id}\nДата: ${booking.date}\nВремя: ${booking.hours.join(", ")}\nКлиент: ${booking.customer}\nUsername: ${booking.username}\nСумма: ${booking.totalprice} руб\n\n✅ Подтвердить: /approve ${booking.id}\n❌ Отмена: /cancel ${booking.id}`;
  axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id: ADMIN_CHAT_ID, text: txt });
};

const notifyCustomer = (booking) => {
  const txt = `✅ Заявка создана!\nДата: ${booking.date}\nВремя: ${booking.hours.join(", ")}\nИтого: ${booking.totalprice} руб.\n\n💳 Реквизиты: [сюда введи свои данные для оплаты]`;
  axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id: booking.username, text: txt })
  .catch(() => console.log("⚠️ Клиент ещё не отправил /start боту."));
};

const notifyApprovedCustomer = (booking) => {
  const txt = `✅🎉 Заявка подтверждена!\nДата: ${booking.date}\nВремя: ${booking.hours.join(", ")}`;
  axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id: booking.username, text: txt });
};

// Команда approve
bot.command('approve', ctx => {
  if (String(ctx.message.chat.id) !== ADMIN_CHAT_ID)
    return ctx.reply('🚫 Вы не админ!');
  const id = Number(ctx.message.text.split(' ')[1]);
  let pending = loadPending();
  const booking = pending.find(b => b.id === id);
  if (!booking) return ctx.reply("⚠️ Заявка не найдена.");
  pending = pending.filter(b => b.id !== id);
  savePending(pending);
  const bookings = loadBookings();
  bookings.push(booking);
  saveBookings(bookings);
  notifyApprovedCustomer(booking);
  ctx.reply(`✅ Заявка #${booking.id} подтверждена.`);
});

// Команда cancel
bot.command('cancel', ctx => {
  if (String(ctx.message.chat.id) !== ADMIN_CHAT_ID)
    return ctx.reply('🚫 Вы не админ!');
  const id = Number(ctx.message.text.split(' ')[1]);
  let pending = loadPending();
  pending = pending.filter(b => b.id !== id);
  savePending(pending);
  ctx.reply(`❌ Заявка #${id} отменена.`);
});

// Команда remove
bot.command('remove', ctx => {
  if (String(ctx.message.chat.id) !== ADMIN_CHAT_ID)
    return ctx.reply('🚫 Вы не админ!');
  const id = Number(ctx.message.text.split(' ')[1]);
  let bookings = loadBookings();
  bookings = bookings.filter(b => b.id !== id);
  saveBookings(bookings);
  ctx.reply(`🗑️ Подтверждённая заявка #${id} удалена.`);
});

// Запуск бота и сервера вместе через webhook
app.use(bot.webhookCallback('/bot'));
app.listen(PORT, () => {
  console.log(`🚀 Сервер на порту ${PORT}`);
  bot.telegram.setWebhook(`https://drumfitness.ru/bot`)
    .then(() => console.log('✅ Webhook установлен'))
    .catch(console.error);
});
