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
// Этот endpoint остаётся полной информацией:
app.get('/api/bookings', (req, res) => {
    const bookings = loadBookings();
    res.json(bookings);
 });
 
 // Новый endpoint специально для календаря:
 app.get('/api/booked-slots', (req, res) => {
   const bookings = loadBookings();
   let result = {};
   bookings.forEach(booking => {
     if (!result[booking.date]) result[booking.date] = [];
     result[booking.date].push(...booking.hours);
   });
   res.json(result);
 });
 

// 🚩 API: Создание заявки ждёт подтверждения
app.post("/api/bookings", (req, res) => {
    const {date, hours, customer, username, total_price} = req.body;
    const pending = loadPending();

    // Новый простой ID (числовое значение)
    const id = pending.length ? Math.max(...pending.map(b => b.id)) + 1 : 1; 

    const newBooking = {id, date, hours, customer, username, total_price};

    pending.push(newBooking);
    savePending(pending);

    notifyAdmin(newBooking);
    notifyCustomer(newBooking);

    res.json({status: "OK", bookingId: id});
});


// 🔔 Уведомление администратору
function notifyAdmin({id, date, hours, customer, username, total_price}) {
    const txt = `📌 Новая заявка #${id}\nДата: ${date}\nВремя: ${hours.join(", ")}\nКлиент: ${customer}\nUsername: @${username}\nСумма: ${total_price}руб.\n\nПодтвердить оплату командой:\n/approve ${id}\nОтменить заявку командой:\n/cancel ${id}`;
    axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: ADMIN_CHAT_ID,
        text: txt
    })
    .then(() => console.log("✅ Сообщение админу отправлено"))
    .catch(console.error);
}

// 🔔 Уведомление клиенту с реквизитами
function notifyCustomer({username, date, hours, total_price}) {
    const bookings = loadBookings();
    const userInfo = bookings[username];
    const chat_id = userInfo ? userInfo.chat_id : null;

    if (!chat_id) {
        console.log(`❌ Нет chat_id для ${username}. Пусть нажмёт /start.`);
        return;
    }

    const txt = `✅ Заявка создана!\nДата: ${date}\nВремя: ${hours.join(", ")}\nК оплате: ${total_price} руб.\n\nРеквизиты:\nНапиши сюда твои реквизиты`;
    axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chat_id,
        text: txt
    })
    .then(() => console.log("✅ Сообщение клиенту отправлено"))
    .catch(() => console.error("❌ Ошибка отправки сообщения клиенту."));
}

function notifyApprovedCustomer({username, date, hours}) {
    const bookings = loadBookings();
    const userInfo = bookings[username];
    const chat_id = userInfo ? userInfo.chat_id : null;

    if (!chat_id) {
        console.log(`❌ Нет chat_id для ${username}. Пусть нажмёт /start.`);
        return;
    }

    const txt = `🎉✅ Ваша заявка подтверждена!\nДата: ${date}\nВремя: ${hours.join(", ")}`;
    axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chat_id,
        text: txt
    })
    .then(() => console.log('✅ Клиент уведомлен о подтверждении'))
    .catch(err => console.error('❌ Ошибка уведомления клиента:', err));
}


// 🔷 Инициализация Telegram бота для подтверждений
const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
    const username = ctx.from.username;
    const chat_id = ctx.chat.id;

    let bookings = loadBookings();
    bookings[username] = { chat_id };
    saveBookings(bookings);

    ctx.reply('Привет! Ваш chat_id сохранен.');
});


// часть подтверждения заявки администратором
bot.command("approve", (ctx) => {
    if (String(ctx.message.chat.id) !== String(ADMIN_CHAT_ID)) 
        return ctx.reply("Вы не админ!");

    const id = Number(ctx.message.text.split(" ")[1]); 
    let pending = loadPending();
    const booking = pending.find(b => b.id === id);
    if (!booking) return ctx.reply("⚠️ Заявка не найдена!");

    let bookings = loadBookings();

    // Новый id для подтвержденной брони
    const bookingId = bookings.length
        ? Math.max(...Object.values(bookings).map(b => b.id || 0)) + 1
        : 1;

    bookings[booking.username] = {
        ...bookings[booking.username],
        id: bookingId,
        date: booking.date,
        hours: booking.hours,
        customer: booking.customer,
        total_price: booking.total_price
    };

    saveBookings(bookings);
    savePending(pending.filter(b => b.id !== id));

    notifyApprovedCustomer(booking);
    ctx.reply(`✅ Заявка #${bookingId} подтверждена!`);
});

// ❌ ОТМЕНА
bot.command('cancel', ctx => {
    if (String(ctx.message.chat.id) !== ADMIN_CHAT_ID) {
        return ctx.reply('🚫 Вы не админ!');
    }

    const id = Number(ctx.message.text.split(' ')[1]);
    let pending = loadPending();
    const booking = pending.find(b => b.id === id);

    if (booking) {
        pending = pending.filter(b => b.id !== id);
        savePending(pending);
        ctx.reply(`✅ Заявка #${id} отменена (была в ожидании).`);
        return;
    }

    const bookings = loadBookings();
    let found = false;

    for (let date in bookings) {
        if (bookings[date].length) {
            const initialHours = bookings[date].length;
            bookings[date] = bookings[date].filter(hour => !booking?.hours.includes(hour));
            if (bookings[date].length < initialHours) {
                found = true;
                saveBookings(bookings);
                break;
            }
        }
    }

    found
        ? ctx.reply(`✅ Заявка #${id} отменена (была подтверждена).`)
        : ctx.reply(`❌ Заявка #${id} не найдена.`);
});


// Информируем клиента о подтверждении
function notifyApprovedCustomer(booking) {
    const bookings = loadBookings();
    const userInfo = bookings[booking.username];
    const chat_id = userInfo ? userInfo.chat_id : null;

    if (!chat_id) {
        console.log(`❌ Нет chat_id для ${booking.username}. Пусть нажмёт /start.`);
        return;
    }

    const txt = `🎉✅ Ваша заявка подтверждена!\nНомер заявки: #${booking.id}\nДата: ${booking.date}\nВремя: ${booking.hours.join(", ")}`;
    axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chat_id,
        text: txt
    })
    .then(() => console.log('✅ Клиент уведомлен о подтверждении'))
    .catch(err => console.error('❌ Ошибка отправки клиенту:', err));
}

bot.command('remove', ctx => {
    if (String(ctx.message.chat.id) !== ADMIN_CHAT_ID) {
        return ctx.reply('🚫 Вы не админ!');
    }

    const id = Number(ctx.message.text.split(' ')[1]);
    let bookings = loadBookings();
    const booking = bookings.find(b => b.id === id);

    if (!booking) return ctx.reply(`❌ Подтверждённая заявка #${id} не найдена.`);

    bookings = bookings.filter(b => b.id !== id);
    saveBookings(bookings);

    ctx.reply(`✅ Подтвержденная заявка #${id} удалена.`);
});
// ❗️ Добавьте логи для отладки
bot.use(Telegraf.log());

// 🚀 Настройте webhook для бота
app.use(bot.webhookCallback('/api/bot'));  // путь для webhook будет ваш_домен.ru/bot

// Запустите express сервер
app.listen(PORT, () => {
    console.log(`🚀 App running on port ${PORT}`);

    // ✅ Установите webhook в Telegram явно
    const webhookUrl = 'https://drumfitness.ru/api/bot'; // 👈 исправьте на ваш HTTPS-домен
    bot.telegram.setWebhook(webhookUrl)
        .then(() => console.log('✅ Webhook успешно установлен:', webhookUrl))
        .catch(err => console.error('❌ Webhook не установлен:', err));
});
