// Установи пакеты перед запуском:
// npm install express cors axios uuid telegraf

const express = require('express');
const fs = require('fs');
const cors = require('cors');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { Telegraf } = require('telegraf');

// 🔧 Конфигурация (укажи свои данные)
const BOT_TOKEN = '8188912825:AAEEq8lTj3R_a0lx6OKPyt59Nc_jv04GRxs';
const ADMIN_CHAT_ID = '6533586308';

const BOOKINGS_FILE = 'bookings.json';
const PENDING_FILE = 'pending-bookings.json';

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cors());

// 🔷 Telegram bot init
const bot = new Telegraf(BOT_TOKEN);

// 🗃️ Функции работы с файлами
const loadJSON = file => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : [];
const saveJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

const loadBookings = () => loadJSON(BOOKINGS_FILE);
const saveBookings = data => saveJSON(BOOKINGS_FILE, data);
const loadPending = () => loadJSON(PENDING_FILE);
const savePending = data => saveJSON(PENDING_FILE, data);

// 🔔 Отправка сообщений в Telegram
const sendTelegram = (chat_id, text) => {
    return axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id, text })
        .catch(err => console.error('❌ Ошибка отправки:', err.message));
};

function notifyAdmin(booking) {
    const txt = `📩 Новая заявка #${booking.id}
Дата: ${booking.date}
Время: ${booking.hours.join(', ')}
Клиент: ${booking.customer}
Username: ${booking.username}
Сумма: ${booking.totalprice} руб.

✅ Подтвердить: /approve ${booking.id}
❌ Отменить: /cancel ${booking.id}`;

    return sendTelegram(ADMIN_CHAT_ID, txt);
}

function notifyCustomer(booking) {
    const txt = `✅ Заявка создана!
Дата: ${booking.date}
Время: ${booking.hours.join(', ')}
К оплате: ${booking.totalprice} руб

💳 Реквизиты для оплаты:
[сюда вставь твои реквизиты]`;

    return sendTelegram(booking.username, txt);
}

function notifyApprovedCustomer(booking) {
    const txt = `🎉✅ Ваша заявка подтверждена!
Дата: ${booking.date}
Время: ${booking.hours.join(', ')}`;

    return sendTelegram(booking.username, txt);
}

// 🌎 API маршруты

// ✅ Подтвержденные бронирования
app.get('/api/bookings', (req, res) => res.json(loadBookings()));

// 📝 Создание заявки (в ожидании)
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

// 🤖 Telegram команды

// ✅ Команда старт
bot.start(ctx => ctx.reply('👋 Добро пожаловать! Теперь вы будете получать уведомления о заявках.'));

// 🔑 Middleware проверки админа
bot.use((ctx, next) => {
    if(ctx.message && ['/approve', '/cancel', '/remove'].includes(ctx.message.text.split(' ')[0])) {
        if(String(ctx.message.chat.id) !== ADMIN_CHAT_ID) return ctx.reply('🚫 Вы не админ!');
    }
    return next();
});

// ✅ Подтверждение заявки
bot.command('approve', ctx => {
    const id = Number(ctx.message.text.split(' ')[1]);
    let pending = loadPending();
    const booking = pending.find(b => b.id === id);

    if (!booking) return ctx.reply('⚠️ Заявка не найдена среди ожидающих.');

    pending = pending.filter(b => b.id !== id);
    savePending(pending);

    const bookings = loadBookings();
    bookings.push(booking);
    saveBookings(bookings);

    notifyApprovedCustomer(booking);
    ctx.reply(`✅ Заявка #${id} подтверждена.`);
});

// ❌ Отмена заявки
bot.command('cancel', ctx => {
    const id = Number(ctx.message.text.split(' ')[1]);

    let pending = loadPending();
    const initialPending = pending.length;
    pending = pending.filter(b => b.id !== id);

    if (pending.length !== initialPending) {
        savePending(pending);
        return ctx.reply(`✅ Заявка #${id} отменена (была в ожидании).`);
    }

    let bookings = loadBookings();
    const initialBookings = bookings.length;
    bookings = bookings.filter(b => b.id !== id);

    if (bookings.length !== initialBookings) {
        saveBookings(bookings);
        return ctx.reply(`✅ Заявка #${id} отменена (была подтверждена).`);
    }

    ctx.reply('❌ Заявка не найдена.');
});

// 🗑️ Удаление подтвержденной заявки
bot.command('remove', ctx => {
    const id = Number(ctx.message.text.split(' ')[1]);
    let bookings = loadBookings();
    const initialBookings = bookings.length;

    bookings = bookings.filter(b => b.id !== id);
    if(bookings.length === initialBookings) return ctx.reply('❌ Заявка не найдена.');

    saveBookings(bookings);
    ctx.reply(`🗑️ Заявка #${id} удалена.`);
});

// 🛰️ Webhook и запуск сервера
app.use(bot.webhookCallback('/bot'));

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    const WEBHOOK_URL = 'https://drumfitness.ru/bot';  // укажи свой реальный домен обязательно HTTPS!
    bot.telegram.setWebhook(WEBHOOK_URL)
        .then(() => console.log(`✅ Webhook установлен на ${WEBHOOK_URL}`))
        .catch(err => console.error('❌ Ошибка webhook', err));
});
