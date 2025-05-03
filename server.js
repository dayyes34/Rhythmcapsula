const express = require('express');
const fs = require('fs');
const cors = require('cors');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { Telegraf } = require('telegraf');

const app = express();
const PORT = 3000;
app.use(express.json());
app.use(cors());

// Токен твоего Telegram бота (замени на свой)
const BOT_TOKEN = '8188912825AAEEq8lTj3Ra0lx6OKPyt59Ncjv04GRxs';
const ADMIN_CHAT_ID = '6533586308'; // поправь это после шага ниже

// Путь к файлам бронирования
const BOOKINGS_FILE = 'bookings.json';
const PENDING_FILE = 'pending-bookings.json';

// Загрузка бронирований
function loadBookings() {
    if (fs.existsSync(BOOKINGS_FILE)) {
        return JSON.parse(fs.readFileSync(BOOKINGS_FILE));
    }
    return [];
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

// API: Получение подтверждённых слотов
app.get('/api/bookings', (req, res) => {
    const bookings = loadBookings();
    res.json(bookings);
});

// Новый endpoint специально для календаря
app.get('/api/booked-slots', (req, res) => {
    const { room = 'drum' } = req.query; // По умолчанию drum, если не указано
    const bookings = loadBookings();
    let result = {};

    // Фильтруем бронирования по комнате
    const filteredBookings = bookings.filter(booking => 
        !booking.room || booking.room === room
    );

    filteredBookings.forEach(booking => {
        if (!result[booking.date]) result[booking.date] = [];
        booking.hours.forEach(hour => {
            if (!result[booking.date].includes(hour)) {
                result[booking.date].push(hour);
            }
        });
    });

    res.json(result);
});

// API: Создание заявки (ждёт подтверждения)
app.post('/api/bookings', (req, res) => {
    const { date, hours, customer, username, totalprice, room = 'drum' } = req.body;
    const pending = loadPending();

    // Новый простой ID (числовое значение)
    const id = pending.length ? Math.max(...pending.map(b => b.id)) + 1 : 1;

    const newBooking = { id, date, hours, customer, username, totalprice, room };

    pending.push(newBooking);
    savePending(pending);

    notifyAdmin(newBooking);
    notifyCustomer(newBooking);

    res.json({ status: 'OK', bookingId: id });
});

// Уведомление администратору
function notifyAdmin({ id, date, hours, customer, username, totalprice, room }) {
    const roomText = room === 'drum' ? 'Барабанная комната' : 'Фитнес зал';
    const txt = `Новая заявка #${id}\nДата: ${date}\nВремя: ${hours.join(', ')}\nКомната: ${roomText}\nКлиент: ${customer}\nUsername: ${username}\nСумма: ${totalprice}руб\n\nПодтвердить оплату командой:\n/approve ${id}\nОтменить заявку командой:\n/cancel ${id}`;

    axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: ADMIN_CHAT_ID,
        text: txt
    })
    .then(() => console.log('Сообщение админу отправлено'))
    .catch(console.error);
}

// Уведомление клиенту с реквизитами
function notifyCustomer({ username, date, hours, totalprice, room }) {
    const bookings = loadBookings();
    const userInfo = bookings[username];
    const chatId = userInfo ? userInfo.chatId : null;

    if (!chatId) {
        console.log(`Нет chatId для ${username}. Пусть нажмёт /start`);
        return;
    }

    const roomText = room === 'drum' ? 'Барабанная комната' : 'Фитнес зал';
    const txt = `Заявка создана\nДата: ${date}\nВремя: ${hours.join(', ')}\nКомната: ${roomText}\nК оплате: ${totalprice} руб\n\nРеквизиты:\nНапиши сюда твои реквизиты`;

    axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: txt
    })
    .then(() => console.log('Сообщение клиенту отправлено'))
    .catch(err => console.error('Ошибка отправки сообщения клиенту', err));
}

function notifyApprovedCustomer(username, date, hours, room) {
    const bookings = loadBookings();
    const userInfo = bookings[username];
    const chatId = userInfo ? userInfo.chatId : null;

    if (!chatId) {
        console.log(`Нет chatId для ${username}. Пусть нажмёт /start`);
        return;
    }

    const roomText = room === 'drum' ? 'Барабанная комната' : 'Фитнес зал';
    const txt = `Ваша заявка подтверждена\nДата: ${date}\nВремя: ${hours.join(', ')}\nКомната: ${roomText}`;

    axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: txt
    })
    .then(() => console.log('Клиент уведомлен о подтверждении'))
    .catch(err => console.error('Ошибка уведомления клиента', err));
}

// Инициализация Telegram бота для подтверждений
const bot = new Telegraf(BOT_TOKEN);

bot.start(ctx => {
    const username = ctx.from.username;
    const chatId = ctx.chat.id;

    let bookings = loadBookings();
    bookings[username] = { chatId };
    saveBookings(bookings);

    ctx.reply('Привет! Ваш chatId сохранен');
});

// Команда подтверждения заявки администратором
bot.command('approve', ctx => {
    if (String(ctx.message.chat.id) !== String(ADMIN_CHAT_ID)) {
        return ctx.reply('Вы не админ');
    }

    const id = Number(ctx.message.text.split(' ')[1]);
    let pending = loadPending();
    const booking = pending.find(b => b.id === id);

    if (!booking) return ctx.reply('Заявка не найдена');

    let bookings = loadBookings();

    // Новый id для подтвержденной брони
    const bookingId = bookings.length ? 
        Math.max(...Object.values(bookings).map(b => b.id || 0)) + 1 : 1;

    bookings[booking.username] = bookings[booking.username] || {};
    bookings.push({
        id: bookingId,
        date: booking.date,
        hours: booking.hours,
        customer: booking.customer,
        username: booking.username,
        totalprice: booking.totalprice,
        room: booking.room || 'drum'
    });

    saveBookings(bookings);
    savePending(pending.filter(b => b.id !== id));

    notifyApprovedCustomer(booking.username, booking.date, booking.hours, booking.room || 'drum');
    ctx.reply(`Заявка ${bookingId} подтверждена`);
});

// Команда отмены заявки
bot.command('cancel', ctx => {
    if (String(ctx.message.chat.id) !== ADMIN_CHAT_ID) {
        return ctx.reply('Вы не админ');
    }

    const id = Number(ctx.message.text.split(' ')[1]);
    let pending = loadPending();
    const booking = pending.find(b => b.id === id);

    if (booking) {
        pending = pending.filter(b => b.id !== id);
        savePending(pending);
        ctx.reply(`Заявка ${id} отменена (была в ожидании)`);
        return;
    }

    const bookings = loadBookings();
    let found = false;

    for (let date in bookings) {
        if (bookings[date].length) {
            const initialHours = bookings[date].length;
            bookings[date] = bookings[date].filter(hour => !booking.hours.includes(hour));
            if (bookings[date].length < initialHours) {
                found = true;
                saveBookings(bookings);
                break;
            }
        }
    }

    found ? 
        ctx.reply(`Заявка ${id} отменена (была подтверждена)`) : 
        ctx.reply(`Заявка ${id} не найдена`);
});

// Команда удаления подтвержденной заявки
bot.command('remove', ctx => {
    if (String(ctx.message.chat.id) !== ADMIN_CHAT_ID) {
        return ctx.reply('Вы не админ');
    }

    const id = Number(ctx.message.text.split(' ')[1]);
    let bookings = loadBookings();
    const booking = bookings.find(b => b.id === id);

    if (!booking) return ctx.reply(`Подтверждённая заявка ${id} не найдена`);

    bookings = bookings.filter(b => b.id !== id);
    saveBookings(bookings);

    ctx.reply(`Подтвержденная заявка ${id} удалена`);
});

// Логи для отладки
bot.use(Telegraf.log());

// Настройка webhook для бота
app.use(bot.webhookCallback('/api/bot'));  // путь для webhook будет ваш_домен.ru/bot

// Запуск express сервера
app.listen(PORT, () => {
    console.log(`App running on port ${PORT}`);

    // Установка webhook в Telegram (оставляем как было)
    const webhookUrl = 'https://drumfitness.ru/api/bot';  // исправьте на ваш HTTPS-домен
    bot.telegram.setWebhook(webhookUrl)
        .then(() => console.log('Webhook успешно установлен:', webhookUrl))
        .catch(err => console.error('Webhook не установлен:', err));
});