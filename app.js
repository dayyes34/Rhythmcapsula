TelegramWebApp.expand();
const MSK_OFFSET=-180, openHour=7, closeHour=23, daysShow=28;
let selD=null, selH=null, selL=3;
let final_price = 0; // Итоговая цена бронирования

// Добавляем хранение двух расписаний для разных румов
let BOOKED = {};
let BOOKED_ROOM1 = {};
let BOOKED_ROOM2 = {};
let currentRoom = 1; // По умолчанию показываем первый рум

// Загружаем данные обоих румов
function loadBookedSlots() {
    fetch('https://drumfitness.ru/api/bookedslots?room=1')
        .then(res => res.json())
        .then(data => {
            BOOKED_ROOM1 = data || {};
            if (currentRoom === 1) BOOKED = BOOKED_ROOM1;
            render();
        })
        .catch(err => {
            console.error(err);
            alert("Ошибка загрузки расписания для рума 1");
        });

    fetch('https://drumfitness.ru/api/bookedslots?room=2')
        .then(res => res.json())
        .then(data => {
            BOOKED_ROOM2 = data || {};
            if (currentRoom === 2) BOOKED = BOOKED_ROOM2;
            render();
        })
        .catch(err => {
            console.error(err);
            alert("Ошибка загрузки расписания для рума 2");
        });
}

// Переключение между комнатами
function switchRoom(roomNumber) {
    currentRoom = roomNumber;
    BOOKED = roomNumber === 1 ? BOOKED_ROOM1 : BOOKED_ROOM2;

    // Обновляем UI активной вкладки
    document.getElementById('room1-tab').classList.toggle('active', roomNumber === 1);
    document.getElementById('room2-tab').classList.toggle('active', roomNumber === 2);

    // Обновляем цветовую схему
    document.body.classList.toggle('room1-theme', roomNumber === 1);
    document.body.classList.toggle('room2-theme', roomNumber === 2);

    selD = null;
    selH = null;
    selL = 3;
    render();
    upd();
}

function mskD(d){return new Date(d.getTime()-6e4*(MSK_OFFSET+d.getTimezoneOffset())).toISOString().slice(0,10);}

function render() {
    let d = new Date(), html = '';

    // Добавляем вкладки переключения
    html += `
    <div class="tabs-container">
        <div id="room1-tab" class="tab ${currentRoom === 1 ? 'active' : ''}" onclick="switchRoom(1)">Зал 1</div>
        <div id="room2-tab" class="tab ${currentRoom === 2 ? 'active' : ''}" onclick="switchRoom(2)">Зал 2</div>
    </div>`;

    // Получаем текущую дату и время (МСК)
    const now = new Date();
    const currentDateMsk = mskD(now);
    const currentHourMsk = now.getUTCHours() + 3; // МСК = UTC+3

    for (let i = 0; i < daysShow; i++) {
        let k = mskD(d), sd = new Date(d.getTime() - 6e4 * (MSK_OFFSET + d.getTimezoneOffset()));
        html += `<div class="dateblock">${sd.toLocaleDateString('ru', {weekday: 'long', day: 'numeric', month: 'short'})}</div>
        <div class="slot-container">`;

        for (let h = openHour; h < closeHour; h++) {
            // Проверка, что слот прошёл (для текущего дня)
            let isPastSlot = k === currentDateMsk && h <= currentHourMsk;

            // booked учитывает и подтверждённые слоты, и прошедшие
            let isBooked = (BOOKED[k] && BOOKED[k].includes(h)) || isPastSlot;

            // Добавляем класс past-slot для прошедших слотов
            let additionalClass = isPastSlot ? ' past-slot' : '';

            html += `<div class="slot ${isBooked ? 'booked' : 'not-booked'}${additionalClass}" data-d="${k}" data-h="${h}">${h}:00</div>`;
        }

        html += `</div><hr>`;
        d.setDate(d.getDate() + 1);
    }

    document.getElementById('calendar').innerHTML = html;
    document.querySelectorAll('.slot.not-booked:not(.past-slot)').forEach(e => e.onclick = () => choose(e.dataset.d, e.dataset.h));
}

function free(d, h) { return h >= openHour && h < closeHour && !BOOKED[d]?.includes(h); }

function choose(d, h) {
    selD = d;
    selH = Number(h);
    selL = getInitialL(d, h);
    upd();
}

// Метод отправки бронирования
function bookSlots() {
    if (selD === null || selH === null || selL < 1) {
        alert('Выбери слот для бронирования');
        return;
    }

    // Telegram данные пользователя username и имя
    const username = TelegramWebApp.initDataUnsafe.user.username;
    const customer = TelegramWebApp.initDataUnsafe.user.first_name || username || "unknown";

    fetch('https://drumfitness.ru/api/bookings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            date: selD,
            hours: Array.from({length: selL}, (_, i) => selH + i),
            customer: customer,
            username: username,
            totalprice: final_price,
            room: currentRoom // Добавляем номер рума
        })
    })
    .then(res => res.json())
    .then(res => {
        if(res.status === 'OK') {
            alert('Забронировано успешно! Скоро администрация подтвердит заявку');
            location.reload();
        } else {
            alert('Ошибка при бронировании. Попробуй повторить запрос');
        }
    })
    .catch(err => {
        console.error(err);
        alert('Ошибка связи с сервером. Повторите чуть позже');
    });
}

function getInitialL(d, h) {
    if(free(d, h) && free(d, h+1) && free(d, h+2)) return 3;
    if(free(d, h) && free(d, h+1)) return 2;
    if(free(d, h) && (h+1 >= closeHour || !free(d, h+1))) return 1;
    return 0;
}

function canBookOne(d, h) { return free(d, h) && (h+1 >= closeHour || !free(d, h+1)); }

function upd() {
    document.querySelectorAll('.slot').forEach(e => e.classList.remove('selected'));
    if(selL < 1 || selD === null || selH === null) {
        document.getElementById('summary').innerHTML = 'Неверный выбор';
        return;
    }

    let total = 0, full = 0;
    let basePrices = [];

    for(let h = selH; h < selH + selL; h++) {
        document.querySelector(`.slot[data-d="${selD}"][data-h="${h}"]`).classList.add('selected');
        // исправлено тут, теперь явно указано для 1/2/3 часов
        let basePrice = selL === 1 ? 400 : selL === 2 ? 300 : (h - selH === 2) ? 300 : 250;
        basePrices.push(basePrice);
    }

    full = basePrices.reduce((a, b) => a + b, 0);

    basePrices.forEach((hourPrice, i) => {
        let curHour = selH + i;
        let discount = 0;
        if(curHour >= 7 && curHour <= 11) discount = 0.3;
        else if(curHour >= 11 && curHour <= 14) discount = 0.1;
        total += hourPrice * (1 - discount);
    });

    total = Math.round(total);
    final_price = total; // Записываем итоговую цену в нашу переменную

    document.getElementById('hCount').innerText = selL;
    let discText;
    if(total !== full) {
        discText = `<span class="oldprice">${full}</span><span class="finalprice">${total}</span>`;
    } else discText = full;
    document.getElementById('summary').innerHTML = `Выбрано ${selD} с ${selH}:00 до ${selH + selL}:00 ${discText}`;
}

document.getElementById('minusHour').onclick = () => {
    if(selL > 1) {
        selL--;
        upd();
    } else {
        alert('Нельзя уменьшить меньше минимума');
    }
};

document.getElementById('plusHour').onclick = () => {
    if(free(selD, selH + selL)) {
        selL++;
        upd();
    } else {
        alert('Час занят или конец дня');
    }
};

// Инициализация при загрузке страницы
document.body.classList.add('room1-theme'); // По умолчанию тема первого рума
loadBookedSlots();