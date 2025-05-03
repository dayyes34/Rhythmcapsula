const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { Telegraf } = require('telegraf');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = "8188912825:AAEEq8lTj3R_a0lx6OKPyt59Nc_jv04GRxs";
const ADMIN_CHAT_ID = "6533586308"; // <-- поправь это после шага ниже

// Пути к файлам для хранения данных
const BOOKINGS_FILE = 'bookings.json';
const PENDING_FILE = 'pending_bookings.json';

// Функции для работы с хранилищем
function loadBookings() {
    try {
        return JSON.parse(fs.readFileSync(BOOKINGS_FILE));
    } catch (e) {
        return {};
    }
}

function saveBookings(bookings) {
    fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
}

function loadPending() {
    try {
        return JSON.parse(fs.readFileSync(PENDING_FILE));
    } catch (e) {
        return [];
    }
}

function savePending(pending) {
    fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2));
}

// API для получения занятых слотов
app.get('/api/bookedslots', (req, res) => {
    const room = req.query.room || '1'; // По умолчанию первый рум
    const bookings = loadBookings();
    let result = {};

    // Фильтруем только бронирования для указанного рума
    Object.values(bookings).forEach(userBookings => {
        if (!Array.isArray(userBookings)) return; // Пропускаем объекты с chatid

        userBookings.forEach(booking => {
            // Проверяем, что бронирование относится к запрошенному руму
            if (!booking.room || String(booking.room) === String(room)) {
                if (!result[booking.date]) result[booking.date] = [];
                booking.hours.forEach(hour => {
                    if (!result[booking.date].includes(hour)) {
                        result[booking.date].push(hour);
                    }
                });
            }
        });
    });

    res.json(result);
});

// API для создания новой заявки
app.post('/api/bookings', (req, res) => {
    const {date, hours, customer, username, totalprice, room} = req.body;
    const pending = loadPending();

    // Новый простой ID - числовое значение
    const id = pending.length ? Math.max(...pending.map(b => b.id)) + 1 : 1;

    const newBooking = {id, date, hours, customer, username, totalprice, room};

    pending.push(newBooking);
    savePending(pending);

    notifyAdmin(newBooking);
    notifyCustomer(username, date, hours, totalprice);

    res.json({status: 'OK', bookingId: id});
});

// Функция уведомления администратора
function notifyAdmin({id, date, hours, customer, username, totalprice, room}) {
    const roomText = room ? `\nЗал: ${room}` : '';
    const txt = `Новая заявка #${id}\nДата: ${date}\nВремя: ${hours.join(', ')}\nКлиент: ${customer}\nUsername: ${username}${roomText}\nСумма: ${totalprice}руб\n\nПодтвердить оплату командой:\n/approve_${id}\nОтменить заявку командой:\n/cancel_${id}`;

    axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: ADMIN_CHAT_ID,
        text: txt
    })
    .then(() => console.log('Сообщение администратору отправлено'))
    .catch(() => console.error('Ошибка отправки сообщения администратору'));
}

// Функция уведомления клиента
function notifyCustomer(username, date, hours, totalprice) {
    const bookings = loadBookings();
    const userInfo = bookings[username];
    const chatid = userInfo ? userInfo.chatid : null;

    if (!chatid) {
        console.log(`Нет chatid для ${username}. Пусть нажмёт /start`);
        return;
    }

    const txt = `🎯 Заявка создана\nДата: ${date}\nВремя: ${hours.join(', ')}\nК оплате: ${totalprice} руб\n\nРеквизиты:\nНапиши сюда твои реквизиты`;
    axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatid,
        text: txt
    })
    .then(() => console.log('Сообщение клиенту отправлено'))
    .catch(() => console.error('Ошибка отправки сообщения клиенту'));
}

// Функция уведомления клиента о подтверждении
function notifyApprovedCustomer(booking) {
    const bookings = loadBookings();
    const userInfo = bookings[booking.username];
    const chatid = userInfo ? userInfo.chatid : null;

    if (!chatid) {
        console.log(`Нет chatid для ${booking.username}. Пусть нажмёт /start`);
        return;
    }

    const roomText = booking.room ? `\nЗал: ${booking.room}` : '';
    const txt = `✅ Ваша заявка подтверждена\nНомер заявки: ${booking.id}\nДата: ${booking.date}\nВремя: ${booking.hours.join(', ')}${roomText}`;

    axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatid,
        text: txt
    })
    .then(() => console.log('Клиент уведомлен о подтверждении'))
    .catch(err => console.error('Ошибка отправки клиенту', err));
}

// Инициализация Telegram бота для подтверждений
const bot = new Telegraf(BOT_TOKEN);

bot.start(ctx => {
    const username = ctx.from.username;
    const chatid = ctx.chat.id;

    let bookings = loadBookings() || {};

    // Создаем хранилище chat_id, даже если пользователь еще не бронировал
    if (!bookings[username]) {
        bookings[username] = { chatid };
    } else {
        bookings[username].chatid = chatid;
    }

    saveBookings(bookings);

    ctx.reply(`Привет! Ваш chat_id сохранен. Теперь вы можете приступить к бронированию.`);
});

// Команда подтверждения заявки администратором
bot.command('approve', ctx => {
    if (String(ctx.message.chat.id) !== String(ADMIN_CHAT_ID)) {
        return ctx.reply('Вы не админ');
    }

    // Используем _ как разделитель
    const id = Number(ctx.message.text.split('_')[1]);
    let pending = loadPending();
    const booking = pending.find(b => b.id === id);
    if (!booking) return ctx.reply('Заявка не найдена');

    let bookings = loadBookings();

    // Новый id для подтвержденной брони
    const bookingId = bookings[booking.username] && Array.isArray(bookings[booking.username]) ? 
                      Math.max(...bookings[booking.username].map(b => b.id || 0), 0) + 1 : 1;

    if (!bookings[booking.username] || !Array.isArray(bookings[booking.username])) {
        const chatid = bookings[booking.username] ? bookings[booking.username].chatid : null;
        bookings[booking.username] = [];
        if (chatid) bookings[booking.username].chatid = chatid;
    }

    bookings[booking.username].push({
        id: bookingId,
        date: booking.date,
        hours: booking.hours,
        customer: booking.customer,
        totalprice: booking.totalprice,
        room: booking.room
    });

    saveBookings(bookings);
    savePending(pending.filter(b => b.id !== id));

    notifyApprovedCustomer(booking);
    ctx.reply(`Заявка ${bookingId} подтверждена`);
});

// Команда отмены ожидающей заявки
bot.command('cancel', ctx => {
    if (String(ctx.message.chat.id) !== ADMIN_CHAT_ID) {
        return ctx.reply('Вы не админ');
    }

    // Используем _ как разделитель
    const id = Number(ctx.message.text.split('_')[1]);
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

    for (let username in bookings) {
        if (Array.isArray(bookings[username])) {
            const bookingIndex = bookings[username].findIndex(b => b.id === id);
            if (bookingIndex !== -1) {
                bookings[username].splice(bookingIndex, 1);
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

    // Используем _ как разделитель
    const id = Number(ctx.message.text.split('_')[1]);
    let bookings = loadBookings();
    let found = false;

    for (let username in bookings) {
        if (Array.isArray(bookings[username])) {
            const bookingIndex = bookings[username].findIndex(b => b.id === id);
            if (bookingIndex !== -1) {
                bookings[username].splice(bookingIndex, 1);
                found = true;
                saveBookings(bookings);
                break;
            }
        }
    }

    found ? 
        ctx.reply(`Подтвержденная заявка ${id} удалена`) : 
        ctx.reply(`Подтверждённая заявка ${id} не найдена`);
});

// Добавляем логи для отладки
bot.use(Telegraf.log());

// Настраиваем webhook для бота
app.use(bot.webhookCallback('/api/bot')); // путь для webhook будет вашдомен/api/bot

// Запускаем express сервер
app.listen(PORT, () => {
    console.log(`App running on port ${PORT}`);

    // Устанавливаем webhook в Telegram явно
    const webhookUrl = `https://drumfitness.ru/api/bot`; // исправьте на ваш HTTPS-домен
    bot.telegram.setWebhook(webhookUrl)
        .then(() => console.log(`Webhook успешно установлен: ${webhookUrl}`))
        .catch(err => console.error('Webhook не установлен', err));
});