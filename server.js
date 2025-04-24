// npm install express cors axios uuid telegraf
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const { Telegraf } = require("telegraf");
const axios = require("axios");

const app = express();
const PORT = 3000;
app.use(express.json());
app.use(cors());

// === CONFIGURE THIS === //
const BOT_TOKEN = "8188912825:AAEEq8lTj3Ra0lx6OKPyt59Ncjv04GRxs";
const ADMIN_CHAT_ID = 6533586308; // Telegram ID админа
const WEBHOOK_URL = "https://drumfitness.ru/api/bot";
// ========= //

const BOOKINGS_FILE = "./bookings.json";
const PENDING_FILE = "./pending_bookings.json";

// Telegram bot init
const bot = new Telegraf(BOT_TOKEN);

// Получить уже подтвержденные занятые слоты
app.get("/api/bookedslots", (req, res) => {
    const bookings = loadBookings(); // загружаем подтвержденные слоты
  
    // формируем удобный для фронтенда формат { '2024-02-05': ['12:00', '13:00'], ... }
    const bookedSlots = {};
  
    bookings.forEach(b => {
      if(!bookedSlots[b.date]) bookedSlots[b.date] = [];
      bookedSlots[b.date].push(...b.hours);
    });
  
    res.json(bookedSlots);
  });
  
// Load bookings
function loadBookings() {
  if (fs.existsSync(BOOKINGS_FILE))
    return JSON.parse(fs.readFileSync(BOOKINGS_FILE));
  return [];
}

function saveBookings(bookings) {
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
}

// Load pending bookings
function loadPending() {
  if (fs.existsSync(PENDING_FILE))
    return JSON.parse(fs.readFileSync(PENDING_FILE));
  return [];
}

function savePending(pending) {
  fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2));
}

// Notify admin (новая заявка)
function notifyAdmin(booking) {
  const txt = `🟡 Новая заявка #${booking.id}\nДата: ${booking.date}\nВремя: ${booking.hours.join(", ")}\nКлиент: ${booking.customer}\nTelegram ID: ${booking.telegramId}\nСумма: ${booking.totalprice} руб\n\n✅ Подтвердить /approve ${booking.id}\n⛔️ Отменить /cancel ${booking.id}`;
  axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: ADMIN_CHAT_ID,
    text: txt,
  })
  .then(() => console.log("Админ уведомлен"))
  .catch(console.error);
}

// Клиенту сообщение при новой заявке
function notifyCustomerNew(booking) {
  const txt = `✅ Заявка #${booking.id} создана\nДата: ${booking.date}\nВремя: ${booking.hours.join(", ")}\nК оплате: ${booking.totalprice} руб\n\n👉 Отправьте оплату по реквизитам: ТВОИ РЕКВИЗИТЫ`;
  axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: booking.telegramId,
    text: txt,
  })
  .then(() => console.log("Клиент уведомлен о новой заявке"))
  .catch(console.error);
}

// Клиенту сообщение при подтверждении заявки
function notifyCustomerApproved(booking) {
  const txt = `🎉 Ваша заявка #${booking.id} подтверждена!\nДата: ${booking.date}\nВремя: ${booking.hours.join(", ")}`;
  axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: booking.telegramId,
    text: txt,
  })
  .then(() => console.log("Клиент уведомлен о подтверждении"))
  .catch(console.error);
}

// API создание новой заявки
app.post("/api/bookings", (req, res) => {
  const { date, hours, customer, telegramId, username, totalprice } = req.body;
  const pending = loadPending();

  const id = pending.length ? Math.max(...pending.map(b => b.id)) + 1 : 1;
  const newBooking = { id, date, hours, customer, telegramId, username, totalprice };

  pending.push(newBooking);
  savePending(pending);

  notifyCustomerNew(newBooking);
  notifyAdmin(newBooking);

  res.json({ status: "OK", bookingId: id });
});

// Admin подтверждает заявку
bot.command("approve", (ctx) => {
  if (String(ctx.message.chat.id) !== String(ADMIN_CHAT_ID))
    return ctx.reply("Вы не админ");

  const id = Number(ctx.message.text.split(" ")[1]);
  let pending = loadPending();
  const booking = pending.find(b => b.id === id);
  if (!booking) return ctx.reply("Заявка не найдена");

  const bookings = loadBookings();
  bookings.push(booking);
  saveBookings(bookings);

  pending = pending.filter(b => b.id !== id);
  savePending(pending);

  notifyCustomerApproved(booking);
  ctx.reply(`✅ Заявка #${booking.id} подтверждена`);
});

// Admin отменяет заявку
bot.command("cancel", (ctx) => {
  if (String(ctx.message.chat.id) !== String(ADMIN_CHAT_ID))
    return ctx.reply("Вы не админ");

  const id = Number(ctx.message.text.split(" ")[1]);
  let pending = loadPending();
  let booking = pending.find(b => b.id === id);

  if (booking) {
    pending = pending.filter(b => b.id !== id);
    savePending(pending);
    ctx.reply(`⛔️ Заявка #${id} отменена (из ожидающих)`);
    return;
  }

  let bookings = loadBookings();
  booking = bookings.find(b => b.id === id);

  if (booking) {
    bookings = bookings.filter(b => b.id !== id);
    saveBookings(bookings);
    ctx.reply(`⛔️ Заявка #${id} отменена (из подтвержденных)`);
  } else {
    ctx.reply("Заявка не найдена");
  }
});

// Клиенты пишут админу через бота
bot.on("message", (ctx) => {
  if (ctx.message.chat.id !== ADMIN_CHAT_ID) {
    ctx.forwardMessage(ADMIN_CHAT_ID);
    ctx.reply("Ваше сообщение отправлено администратору");
  } else if (ctx.message.reply_to_message?.forward_from?.id) {
    const clientId = ctx.message.reply_to_message.forward_from.id;
    ctx.telegram.sendMessage(clientId, ctx.message.text)
      .catch(console.error);
  }
});

// Start bot, webhook
bot.telegram.setWebhook(WEBHOOK_URL)
.then(() => console.log("Webhook установлен"))
.catch(console.error);

app.use(bot.webhookCallback("/api/bot"));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
