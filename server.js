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

// Путь к файлам бронирования (разделенные по комнатам)
const BOOKINGS_FILE = 'bookings.json';
const PENDING_FILE = 'pending-bookings.json';

// Загрузка бронирований
function loadBookings() {
    if (fs.existsSync(BOOKINGS_FILE)) {
        return JSON.parse(fs.readFileSync(BOOKINGS_FILE));
    }
    return { drum: [], fitness: [] }; // Инициализируем с двумя комнатами
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

// API: Получение подтверждённых слотов (полная информация)
app.get('/api/bookings', (req, res) => {
    const bookings = loadBookings();
    res.json(bookings);
});

// API: Получение забронированных слотов для календаря по комнате
app.get('/api/booked-slots', (req, res) => {
    const { room = 'drum' } = req.query; // По умолчанию drum, если не указано
    const bookings = loadBookings();

    // Выбираем бронирования только для указанной комнаты
    const roomBookings = bookings[room] || [];

    let result = {};
    roomBookings.forEach(booking => {
        if (!result[booking.date]) result[booking.date] = [];
        booking.hours.forEach(hour => {
            if (!result[booking.date].includes(hour)) {
                result[booking.date].push(hour);
            }
        });
    });

    res.json(result);
});

// API: Создание заявки на бронирование (ждёт подтверждения)
app.post('/api/bookings', (req, res) => {
    const { date, hours, customer, username, room = 'drum', totalprice } = req.body;
    const pending = loadPending();

    // Новый простой ID (числовое значение)
    const id = pending.length ? Math.max(...pending.map(b => b.id)) + 1 : 1;

    // Включаем информацию о комнате
    const newBooking = { id, date, hours, customer, username, room, totalprice };

    pending.push(newBooking);
    savePending(pending);

    notifyAdmin(newBooking);
    notifyCustomer(newBooking);

    res.json({ status: 'OK', bookingId: id });
});

// Уведомление администратору
function notifyAdmin({ id, date, hours, customer, username, room, totalprice }) {
    const roomText = room === 'drum' ? 'Барабанная комната' : 'Фитнес зал';
    const txt = `🔔 Новая заявка #${id}\nДата: ${date}\nВремя: ${hours.join(', ')}\nКомната: ${roomText}\nКлиент: ${customer}\nUsername: ${username}\nСумма: ${totalprice}руб\n\nПодтвердить оплату командой:\n/approve ${id}\nОтменить заявку командой:\n/cancel ${id}`;

    axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: ADMIN_CHAT_ID,
        text: txt
    })
    .then(() => console.log('Сообщение админу отправлено'))
    .catch(console.error);
}

// Уведомление клиенту с реквизитами
function notifyCustomer({ username, date, hours, room, totalprice }) {
    const bookings = loadBookings();
    const userInfo = bookings[username];
    const chatId = userInfo ? userInfo.chatId : null;

    if (!chatId) {
        console.log(`Нет chatId для ${username}. Пусть нажмёт /start`);
        return;
    }

    const roomText = room === 'drum' ? 'Барабанная комната' : 'Фитнес зал';
    const txt = `🔔 Заявка создана\nДата: ${date}\nВремя: ${hours.join(', ')}\nКомната: ${roomText}\nК оплате: ${totalprice} руб\n\nРеквизиты:\nНапиши сюда твои реквизиты`;

    axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: txt
    })
    .then(() => console.log('Сообщение клиенту отправлено'))
    .catch(err => console.error('Ошибка отправки сообщения клиенту', err));
}

function notifyApprovedCustomer(booking) {
    const bookings = loadBookings();
    const userInfo = bookings[booking.username];
    const chatId = userInfo ? userInfo.chatId : null;

    if (!chatId) {
        console.log(`Нет chatId для ${booking.username}. Пусть нажмёт /start`);
        return;
    }

    const roomText = booking.room === 'drum' ? 'Барабанная комната' : 'Фитнес зал';
    const txt = `✅ Ваша заявка подтверждена\nНомер заявки: ${booking.id}\nДата: ${booking.date}\nВремя: ${booking.hours.join(', ')}\nКомната: ${roomText}`;

    axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: txt
    })
    .then(() => console.log('Клиент уведомлен о подтверждении'))
    .catch(err => console.error('Ошибка отправки клиенту', err));
}

// Инициализация Telegram бота для подтверждений
const bot = new Telegraf(BOT_TOKEN);

bot.start(ctx => {
    const username = ctx.from.username;
    const chatId = ctx.chat.id;

    let bookings = loadBookings();

    // Сохраняем информацию о пользователе
    if (!bookings.users) bookings.users = {};
    bookings.users[username] = { chatId };

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

    // Создадим массив для комнаты, если его нет
    if (!bookings[booking.room]) bookings[booking.room] = [];

    // Новый id для подтвержденной брони
    const bookingId = bookings[booking.room].length ? 
        Math.max(...bookings[booking.room].map(b => b.id)) + 1 : 1;

    // Добавляем бронь в соответствующую комнату
    bookings[booking.room].push({
        id: bookingId,
        date: booking.date,
        hours: booking.hours,
        customer: booking.customer,
        username: booking.username,
        totalprice: booking.totalprice
    });

    saveBookings(bookings);
    savePending(pending.filter(b => b.id !== id));

    notifyApprovedCustomer(booking);
    ctx.reply(`✅ Заявка #${bookingId} подтверждена в ${booking.room === 'drum' ? 'барабанной комнате' : 'фитнес зале'}`);
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
        ctx.reply(`❌ Заявка #${id} отменена (была в ожидании)`);
        return;
    }

    const bookings = loadBookings();
    let found = false;

    // Проверяем обе комнаты
    ['drum', 'fitness'].forEach(room => {
        if (bookings[room] && bookings[room].length) {
            const bookingIndex = bookings[room].findIndex(b => b.id === id);
            if (bookingIndex !== -1) {
                bookings[room].splice(bookingIndex, 1);
                found = true;
                saveBookings(bookings);
            }
        }
    });

    found ? 
        ctx.reply(`❌ Заявка #${id} отменена (была подтверждена)`) : 
        ctx.reply(`❓ Заявка #${id} не найдена`);
});

// Команда удаления подтвержденной заявки
bot.command('remove', ctx => {
    if (String(ctx.message.chat.id) !== ADMIN_CHAT_ID) {
        return ctx.reply('Вы не админ');
    }

    const id = Number(ctx.message.text.split(' ')[1]);
    let bookings = loadBookings();
    let found = false;

    // Проверяем обе комнаты
    ['drum', 'fitness'].forEach(room => {
        if (bookings[room]) {
            const bookingIndex = bookings[room].findIndex(b => b.id === id);
            if (bookingIndex !== -1) {
                bookings[room].splice(bookingIndex, 1);
                found = true;
            }
        }
    });

    if (!found) return ctx.reply(`❓ Подтверждённая заявка #${id} не найдена`);

    saveBookings(bookings);
    ctx.reply(`✅ Подтвержденная заявка #${id} удалена.`);
});

// Логи для отладки
bot.use(Telegraf.log());

// Настройка webhook для бота
app.use(bot.webhookCallback('/api/bot'));  // путь для webhook будет ваш_домен.ru/bot

// Запуск express сервера
app.listen(PORT, () => {
    console.log(`🚀 App running on port ${PORT}`);

    // Установка webhook в Telegram
    const webhookUrl = 'https://drumfitness.ru/api/bot'; // исправьте на ваш HTTPS-домен
    bot.telegram.setWebhook(webhookUrl)
        .then(() => console.log('✅ Webhook успешно установлен:', webhookUrl))
        .catch(err => console.error('❌ Webhook не установлен:', err));
});