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

// Загрузка бронирований
function loadBookings() {
    if (fs.existsSync(BOOKINGS_FILE))
        return JSON.parse(fs.readFileSync(BOOKINGS_FILE));
    return {};
}

// Сохранение бронирований
function saveBookings(bookings) {
    fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
}

// Загрузка и сохранение заявок
function loadPending() {
    return fs.existsSync(PENDING_FILE) ? JSON.parse(fs.readFileSync(PENDING_FILE)) : [];
}
function savePending(pending) {
    fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2));
}

// 🚩 API: Получение подтверждённых слотов
app.get("/api/bookings", (req, res) => {
    res.json(loadBookings());
});

// 🚩 API: Создание заявки ждёт подтверждения
app.post("/api/bookings", (req, res) => {
    const {date, hours, customer, username, total_price} = req.body;
    const pending = loadPending();
    const id = uuidv4().slice(0, 8);

    const newBooking = {id, date, hours, customer, username, total_price};

    pending.push(newBooking);
    savePending(pending);

    notifyAdmin(newBooking);
    notifyCustomer(newBooking);

    res.json({status: "OK", bookingId: id});
});

// 🔔 Уведомление администратору
function notifyAdmin({id, date, hours, customer, username, total_price}) {
    const txt = `📌 Новая заявка #${id}\nДата: ${date}\nВремя: ${hours.join(", ")}\nКлиент: ${customer}\nUsername: @${username}\nСумма: ${total_price}руб.\n\nПодтвердить оплату командой:\n/approve ${id}`;
    axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: ADMIN_CHAT_ID,
        text: txt
    }).then(() => console.log("✅ Сообщение админу отправлено")).catch(console.error);
}

// 🔔 Уведомление клиенту с реквизитами
function notifyCustomer({username, date, hours, total_price}) {
    const txt = `✅ Заявка создана!\nДата: ${date}\nВремя: ${hours.join(", ")}\nК оплате: ${total_price} руб.\n\nРеквизиты:\nНапиши сюда твои реквизиты`;
    axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: `@${username}`,
        text: txt
    }).then(() => console.log("✅ Сообщение клиенту отправлено")).catch(() => console.log("❌ Не получилось отправить клиенту (пусть напишет боту /start)"));
}

// 🔷 Инициализация Telegram бота для подтверждений
const bot = new Telegraf(BOT_TOKEN);

bot.command("approve", ctx => {
    if (String(ctx.message.chat.id) !== ADMIN_CHAT_ID) {
        return ctx.reply("🚫 Вы не админ!");
    }

    const id = ctx.message.text.split(" ")[1];
    const pending = loadPending();
    const booking = pending.find(b => b.id === id);

    if (!booking) return ctx.reply("⚠️ Заявка не найдена!");

    const bookings = loadBookings();
    if (!bookings[booking.date]) bookings[booking.date] = [];
    bookings[booking.date].push(...booking.hours);
    saveBookings(bookings);

    savePending(pending.filter(b => b.id !== id));

    notifyApprovedCustomer(booking);
    ctx.reply(`✅ Заявка #${id} подтверждена!`);
});

// Информируем клиента о подтверждении
function notifyApprovedCustomer({username, date, hours}) {
    const txt = `🎉 Ваше бронирование подтверждено!\nДата: ${date}\nВремя: ${hours.join(", ")}`;
    axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: `@${username}`,
        text: txt
    }).then(console.log).catch(console.error);
}

// 🔷 Запуск бота и сервера
bot.launch();
app.listen(PORT, () => console.log(`✅ Сервер запущен: порт ${PORT}`));
