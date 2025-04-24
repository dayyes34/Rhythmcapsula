// npm install express cors axios telegraf
const express = require('express');
const fs = require('fs');
const cors = require('cors');
const { Telegraf } = require('telegraf');

const app = express();
app.use(express.json());
app.use(cors());

const BOT_TOKEN = '8188912825:AAEEq8lTj3R_a0lx6OKPyt59Nc_jv04GRxs';
const ADMIN_CHAT_ID = '6533586308';

const BOOKINGS_FILE = 'bookings.json';
const PENDING_FILE = 'pending-bookings.json';

const bot = new Telegraf(BOT_TOKEN);

// Загрузка и сохранение данных
const readJSON = file => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : [];
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// уведомления в Telegram
const sendTelegram = async (chat_id, text) => {
    try {
        await bot.telegram.sendMessage(chat_id, text);
    } catch (e) {
        console.error('Ошибка отправки сообщения:', e.message);
    }
};

// Уведомления Админу и Клиенту
const notifyAdmin = booking => sendTelegram(ADMIN_CHAT_ID, `📩 Новая заявка #${booking.id}\nДата: ${booking.date}\nВремя: ${booking.hours.join(', ')}\nКлиент: ${booking.customer}\nUsername: ${booking.username}\nСумма: ${booking.totalprice}\n\n✅ Подтвердить: /approve ${booking.id}\n❌ Отменить: /cancel ${booking.id}`);
const notifyCustomer = booking => sendTelegram(booking.username, `✅ Заявка принята!\n📅 ${booking.date}\n🕒 ${booking.hours.join(', ')}\n💳 Сумма: ${booking.totalprice} руб\n\n(здесь реквизиты для оплаты)`);
const notifyApprovedCustomer = booking => sendTelegram(booking.username, `✅🎉 Ваша заявка подтверждена!\n📅 ${booking.date}\n🕒 ${booking.hours.join(', ')}`);

// API маршрут создания брони
app.post('/api/bookings', (req, res) => {
    const { date, hours, customer, username, totalprice } = req.body;
    const pending = readJSON(PENDING_FILE);
    const id = pending.length ? Math.max(...pending.map(p => p.id)) + 1 : 1;
    const booking = { id, date, hours, customer, username, totalprice };
    pending.push(booking);
    writeJSON(PENDING_FILE, pending);
    notifyAdmin(booking);
    notifyCustomer(booking);
    res.json({ status: 'OK', bookingId: id });
});

// API подтвержденных броней
app.get('/api/bookings', (req, res) => res.json(readJSON(BOOKINGS_FILE)));

// команды telegram
bot.start(ctx => ctx.reply('👋 Привет! Теперь бот будет сообщать тебе о статусе твоих заявок.'));

bot.command('approve', ctx => {
    if (String(ctx.chat.id) !== ADMIN_CHAT_ID) return ctx.reply('⛔️ Не админ!');
    const id = Number(ctx.message.text.split(' ')[1]);
    const pending = readJSON(PENDING_FILE);
    const idx = pending.findIndex(p => p.id === id);
    if (idx === -1) return ctx.reply('Заявка не найдена.');

    const [booking] = pending.splice(idx, 1);
    const bookings = readJSON(BOOKINGS_FILE);
    bookings.push(booking);
    writeJSON(BOOKINGS_FILE, bookings);
    writeJSON(PENDING_FILE, pending);

    notifyApprovedCustomer(booking);
    ctx.reply(`✅ Заявка #${id} подтверждена.`);
});

bot.command('cancel', ctx => {
    if (String(ctx.chat.id) !== ADMIN_CHAT_ID) return ctx.reply('⛔️ Не админ!');
    const id = Number(ctx.message.text.split(' ')[1]);
    let pending = readJSON(PENDING_FILE);
    const lengthBefore = pending.length;
    pending = pending.filter(p => p.id !== id);
    if (pending.length !== lengthBefore) {
        writeJSON(PENDING_FILE, pending);
        return ctx.reply(`❌ Заявка #${id} отменена.`);
    }
    ctx.reply('⚠️ Заявка не найдена.');
});

bot.command('remove', ctx => {
    if (String(ctx.chat.id) !== ADMIN_CHAT_ID) return ctx.reply('⛔️ Не админ!');
    const id = Number(ctx.message.text.split(' ')[1]);
    let bookings = readJSON(BOOKINGS_FILE);
    const lengthBefore = bookings.length;
    bookings = bookings.filter(b => b.id !== id);
    if (bookings.length !== lengthBefore) {
        writeJSON(BOOKINGS_FILE, bookings);
        return ctx.reply(`🗑 Заявка #${id} удалена.`);
    }
    ctx.reply('Заявка не найдена.');
});

// webhook endpoint
app.use(bot.webhookCallback('/bot'));

// сервер слушает порт
app.listen(3000, async () => {
    console.log(`🚀 Сервер запущен на порту 3000`);
    const url = 'https://drumfitness.ru/bot'; // убедись в корректности
    await bot.telegram.setWebhook(url)
        .then(() => console.log(`✅ Webhook установлен: ${url}`))
        .catch(e => console.error(`❌ Ошибка установки webhook:`, e));
});
