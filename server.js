// 📌 ПЕРЕД НАЧАЛОМ УСТАНОВИ ПАКЕТЫ
// npm install express cors axios uuid telegraf

const express = require("express");
const fs = require("fs");
const cors = require("cors");
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { Telegraf } = require("telegraf");

const app = express();
const PORT = 3000;
app.use(express.json());
app.use(cors());

// 📌 Токен твоего Telegram бота (замени на свой)
const BOT_TOKEN = "8188912825:AAEEq8lTj3R_a0lx6OKPyt59Nc_jv04GRxs";
const ADMIN_CHAT_ID = "6533586308"; // <-- поправь это после шага ниже

// Путь к файлам бронирования
const BOOKINGS_FILE = "./bookings.json";
const PENDING_FILE = "./pending_bookings.json";

// Загружаем подтвержденные и ожидающие бронирования
const loadBookings = () => fs.existsSync(BOOKINGS_FILE) ? JSON.parse(fs.readFileSync(BOOKINGS_FILE)) : [];
const saveBookings = (bookings) => fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));

const loadPending = () => fs.existsSync(PENDING_FILE) ? JSON.parse(fs.readFileSync(PENDING_FILE)) : [];
const savePending = (pending) => fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2));

// Уведомление администратору
const notifyAdmin = (booking) => {
  const txt = `📩 Новая заявка #${booking.id}\nДата: ${booking.date}\nВремя: ${booking.hours.join(", ")}\nКлиент: ${booking.customer}\nUsername: ${booking.username}\nСумма: ${booking.totalprice} руб\n\n✅ Подтвердите: /approve ${booking.id}\n❌ Отмена: /cancel ${booking.id}`;
  return axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: ADMIN_CHAT_ID,
    text: txt
  }).catch(console.error);
};

// Уведомление клиенту
const notifyCustomer = (booking) => {
  const txt = `✅ Заявка создана!\nДата: ${booking.date}\nВремя: ${booking.hours.join(", ")}\nК оплате: ${booking.totalprice} руб.\n\n💳 Реквизиты:\n[здесь вставь свои реквизиты]`;
  return axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: booking.username,
    text: txt
  })
  .catch(() => console.log("⚠️ Клиенту не отправлено. Он должен первым писать боту команду /start"));
};

// Уведомление клиенту о подтверждении
const notifyApprovedCustomer = (booking) => {
  const txt = `✅🎉 Ваша заявка подтверждена!\nДата: ${booking.date}\nВремя: ${booking.hours.join(", ")}`;
  return axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: booking.username,
    text: txt
  }).catch(err => console.error('Ошибка отправки клиенту:', err));
};

// ✅ Команда старт (для инициализации диалога с клиентом)
bot.start(ctx => ctx.reply("👋 Приветствую! Здесь будут приходить уведомления о ваших заявках. Используйте веб-приложение, чтобы оформить бронирование."));

// ✅ ПОДТВЕРЖДЕНИЕ заявки админом
bot.command('approve', ctx => {
  if (String(ctx.message.chat.id) !== ADMIN_CHAT_ID)
    return ctx.reply('🚫 Вы не админ!');

  const id = Number(ctx.message.text.split(' ')[1]);
  let pending = loadPending();
  const booking = pending.find(b => b.id === id);

  if (!booking)
    return ctx.reply("⚠️ Заявка не найдена!");

  pending = pending.filter(b => b.id !== id);
  savePending(pending);

  let bookings = loadBookings();
  bookings.push({...booking, id});
  saveBookings(bookings);

  notifyApprovedCustomer(booking);
  ctx.reply(`✅ Заявка #${id} подтверждена.`);
});

// ✅ ОТМЕНА заявки админом
bot.command('cancel', ctx => {
  if (String(ctx.message.chat.id) !== ADMIN_CHAT_ID)
    return ctx.reply('🚫 Вы не админ!');

  const id = Number(ctx.message.text.split(' ')[1]);
  let pending = loadPending();
  const booking = pending.find(b => b.id === id);

  if (booking) {
    pending = pending.filter(b => b.id !== id);
    savePending(pending);

    ctx.reply(`🚫 Заявка #${id} успешно отменена.`);
  } else {
    ctx.reply("⚠️ Заявка не найдена среди ожидающих подтверждения!");
  }
});

// ✅ Удаление уже подтвержденной заявки
bot.command('remove', ctx => {
  if (String(ctx.message.chat.id) !== ADMIN_CHAT_ID)
    return ctx.reply('🚫 Вы не админ!');

  const id = Number(ctx.message.text.split(' ')[1]);
  let bookings = loadBookings();
  const bookingExists = bookings.some(b => b.id === id);

  if (!bookingExists)
    return ctx.reply(`⚠️ Подтвержденная заявка #${id} не найдена.`);

  bookings = bookings.filter(b => b.id !== id);
  saveBookings(bookings);

  ctx.reply(`🚫 Подтвержденная заявка #${id} удалена.`);
});

// 🔄 Настройка webhook
app.use(bot.webhookCallback('/bot'));
app.listen(PORT, () => {
  console.log(`🚀 Сервер работает на ${PORT}`);
  bot.telegram.setWebhook(`https://drumfitness.ru/bot`)
    .then(() => console.log('✅ Webhook установлен'))
    .catch(console.error);
});

// ❗️ Убираем лишний bot.launch() и второй app.listen()