const express = require("express");
const fs = require("fs");
const cors = require("cors");
const axios = require("axios");
const { Telegraf } = require("telegraf");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = 3000;

// НЕ ЗАБУДЬ УКАЗАТЬ ТОКЕН И ЧАТ АДМИНА!
const BOT_TOKEN = "8188912825:AAEEq8lTj3R_a0lx6OKPyt59Nc_jv04GRxs"; 
const ADMIN_CHAT_ID = 6533586308;  

const BOOKINGS_FILE = "bookings.json";
const PENDING_FILE = "pending_bookings.json";

// Загрузка и сохранение подтверждённых бронирований
function loadBookings() {
  return fs.existsSync(BOOKINGS_FILE) ? JSON.parse(fs.readFileSync(BOOKINGS_FILE)) : [];
}

function saveBookings(bookings) {
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
}

// Загрузка и сохранение неподтверждённых заявок
function loadPending() {
  return fs.existsSync(PENDING_FILE) ? JSON.parse(fs.readFileSync(PENDING_FILE)) : [];
}

function savePending(pending) {
  fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2));
}

// API получения подтверждённых слотов
app.get("/api/bookings", (req, res) => {
  const bookings = loadBookings();
  res.json(bookings);
});

// Только слоты занятые (чтобы показать в календаре)
app.get("/api/bookedslots", (req, res) => {
  const bookings = loadBookings();
  let result = {};
  bookings.forEach(booking => {
    if (!result[booking.date]) result[booking.date] = [];
    result[booking.date].push(...booking.hours);
  });
  res.json(result);
});

// API для создания заявки (уходит в pending)
app.post("/api/bookings", (req, res) => {
  const { date, hours, customer, username, totalprice, chat_id } = req.body;

  if (!chat_id) {
    return res.status(400).json({status: "ERROR", message: "Не передан chat_id клиента"});
  }

  const pending = loadPending();
  const id = pending.length ? Math.max(...pending.map(b => b.id)) + 1 : 1;

  const newBooking = {id, date, hours, customer, username, chat_id, totalprice};
  pending.push(newBooking);
  savePending(pending);

  notifyAdmin(newBooking);
  notifyCustomer(newBooking);

  res.json({status: "OK", bookingId: id});
});

// Функции уведомлений (Админ)
function notifyAdmin({id, date, hours, customer, username, totalprice}) {
  const txt = `Новая заявка #${id}\nДата: ${date}\nВремя: ${hours.join(", ")}\nКлиент: ${customer}\nUsername: ${username}\nСумма: ${totalprice} руб\n\n✅ Одобрить: /approve ${id}\n❌ Отменить: /cancel ${id}`;

  axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: ADMIN_CHAT_ID,
    text: txt
  })
  .then(() => console.log("Отправлено админу"))
  .catch(console.error);
}

// Функции уведомлений (Клиент)
function notifyCustomer({chat_id, date, hours, totalprice}) {
  const txt = `✅ Ваша заявка создана\nДата: ${date}\nВремя: ${hours.join(", ")}\nК оплате: ${totalprice} руб\n\nРеквизиты для оплаты:\n(здесь реквизиты)`;

  axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id,
    text: txt
  })
  .then(() => console.log("Отправлено клиенту"))
  .catch(err => console.error("Ошибка отправки клиенту:", err));
}

// Telegram-бот
const bot = new Telegraf(BOT_TOKEN);

// START (опционально — узнать chat_id)
bot.start(ctx => {
  ctx.reply(`Ваш chat_id: ${ctx.chat.id}`);
});

// APPROVE заявка
bot.command("approve", ctx => {
  if (String(ctx.message.chat.id) !== String(ADMIN_CHAT_ID)) 
    return ctx.reply("Вы не админ!");

  const id = Number(ctx.message.text.split(" ")[1]);
  let pending = loadPending();
  const booking = pending.find(b => b.id === id);

  if (!booking) return ctx.reply("Заявка не найдена");

  let bookings = loadBookings();
  const bookingId = bookings.length ? Math.max(...bookings.map(b => b.id)) + 1 : 1;

  const confirmedBooking = {
    id: bookingId,
    date: booking.date,
    hours: booking.hours,
    customer: booking.customer,
    username: booking.username,
    chat_id: booking.chat_id,
    totalprice: booking.totalprice
  };

  bookings.push(confirmedBooking);
  saveBookings(bookings);
  savePending(pending.filter(b => b.id !== id));

  notifyApprovedCustomer(confirmedBooking);
  ctx.reply(`✅ Заявка #${id} подтверждена`);
});

// Уведомляем клиента о подтверждении
function notifyApprovedCustomer({chat_id, date, hours}) {
  const txt = `🎉 Ваша заявка подтверждена!\nДата: ${date}\nВремя: ${hours.join(", ")}`;

  axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id,
    text: txt
  })
  .then(() => console.log("Клиент уведомлен о подтверждении"))
  .catch(err => console.error("Ошибка отправки клиенту", err));
}

// Установка webhook (опционально)
const webhookUrl = `https://drumfitness.ru/api/bot`;
bot.telegram.setWebhook(webhookUrl);
app.use(bot.webhookCallback('/api/bot'));

// Запускаем сервер
app.listen(PORT, () => {
  console.log(`🌐 Сервер запущен на порту: ${PORT}`);
});
