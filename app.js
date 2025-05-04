Telegram.WebApp.expand();
const MSK_OFFSET=180, openHour=7, closeHour=23, daysShow=28;
let selD=null, selH=null, selL=3;
let final_price = 0; // Итоговая цена бронирования
let activeRoom = 'room1'; // Активная комната по умолчанию

let BOOKED = {
  room1: {},
  room2: {}
}; 

// Загружаем данные бронирования для обеих комнат
function loadBookings() {
  fetch('https://drumfitness.ru/api/booked-slots?room=room1')
    .then(res => res.json())
    .then(data => {
      BOOKED.room1 = data;
      return fetch('https://drumfitness.ru/api/booked-slots?room=room2');
    })
    .then(res => res.json())
    .then(data => {
      BOOKED.room2 = data;
      render();
    })
    .catch(err => { 
      console.error(err); 
      alert('Ошибка загрузки расписания :('); 
    });
}

// Переключение между вкладками
function switchRoom(room) {
  activeRoom = room;
  document.getElementById('tab-room1').classList.toggle('active', room === 'room1');
  document.getElementById('tab-room2').classList.toggle('active', room === 'room2');
  // Сбрасываем выбор при переключении комнаты
  selD = null;
  selH = null;
  selL = 3;
  render();
}

// Получаем текущие час и минуты в МСК
function getCurrentMskHour() {
  const now = new Date();
  const mskNow = new Date(now.getTime() + 6e4 * (MSK_OFFSET + now.getTimezoneOffset()));
  return {
    hour: mskNow.getHours(),
    minutes: mskNow.getMinutes(),
    date: mskNow.toISOString().slice(0, 10)
  };
}

function mskD(d){return new Date(d.getTime()+6e4*(MSK_OFFSET+d.getTimezoneOffset())).toISOString().slice(0,10);}

function render() {
    let d = new Date(), html = '';
    const currentTime = getCurrentMskHour();

    for (let i = 0; i < daysShow; i++) {
        let k = mskD(d), sd = new Date(d.getTime() + 6e4 * (MSK_OFFSET + d.getTimezoneOffset()));
        html += `<div class="date-block"><b>${sd.toLocaleDateString('ru', {weekday: 'long', day: 'numeric', month: 'short'})}</b>
        <div class="slot-container">`;

        for (let h = openHour; h < closeHour; h++) {
            // Проверяем, забронирован ли слот
            let b = BOOKED[activeRoom][k]?.includes(h) ? 'booked' : '';

            // Проверяем, является ли этот час уже прошедшим сегодня
            if (k === currentTime.date && h < currentTime.hour) {
                b = 'past';
            }

            html += `<div class='slot ${b}' data-d='${k}' data-h='${h}'>${h}:00</div>`;
        }

        html += `</div></div><hr>`;
        d.setDate(d.getDate() + 1);
    }

    document.getElementById('calendar').innerHTML = html;

    // Устанавливаем обработчики событий на доступные слоты
    document.querySelectorAll('.slot:not(.booked):not(.past)').forEach(e => {
        e.onclick = () => choose(e.dataset.d, +e.dataset.h);
    });

    if (selD && selH !== null) {
        upd(); // Обновляем информацию о выбранном слоте если есть выбранный слот
    } else {
        document.getElementById('summary').innerHTML = 'Выберите слот для бронирования';
    }
}

function free(d, h) {
    const currentTime = getCurrentMskHour();
    // Проверяем, не прошло ли уже время для текущего дня
    if (d === currentTime.date && h < currentTime.hour) {
        return false;
    }
    return h >= openHour && h < closeHour && !BOOKED[activeRoom][d]?.includes(h);
}

function getInitialL(d,h){
    if(free(d,h+1)&&free(d,h+2))return 3;
    if(free(d,h+1))return 2;
    if((!free(d,h-1)&&!free(d,h+1))||(h==closeHour-1&&!free(d,h-1)))return 1;
    return 0;
}

function canBookOne(d,h){return(!free(d,h-1)&&!free(d,h+1))||(h==closeHour-1&&!free(d,h-1))}

function choose(d, h) {
    selD = d;
    selH = h;
    selL = getInitialL(d, h);
    upd();
}

function upd() {
    document.querySelectorAll('.slot').forEach(e=>e.classList.remove('selected'));
    if(selL<1){selD=null;selH=null;selL=0;document.getElementById('summary').innerHTML='Неверный выбор';return;}

    // Выделяем выбранные слоты
    for(let h=selH; h<selH+selL; h++) {
        document.querySelector(`.slot[data-d='${selD}'][data-h='${h}']`).classList.add('selected');
    }

    // Расчет цены для комнаты 1
    let price = 0;
    if(selL == 1) {
        price = 400; // 1 час = 300₽
    } else {
        price = 600; // Первые 2 часа = 600₽
        if(selL > 2) {
            price += (selL - 2) * 200; // Каждый дополнительный час +200₽
        }
    }

    // Для комнаты 2 цена на 100₽ ниже
    if(activeRoom === 'room2') {
        price -= 100;
    }

    // Применение скидок для определенных часов
    let total = 0;
    let hourlyRate = price / selL; // Распределяем цену равномерно на все часы

    for(let i=0; i<selL; i++) {
        let curHour = selH + i;
        let discount = 0;
        if(curHour >= 7 && curHour < 11) discount = 0.3;
        else if(curHour >= 11 && curHour < 14) discount = 0.1;
        total += hourlyRate * (1-discount);
    }

    total = Math.round(total);
    final_price = total; // Записываем итоговую цену в переменную

    // Отображение информации
    document.getElementById('hCount').innerText = selL;
    let discText = '';
    if(total < price) {
        discText = `<span class="old-price">${price}₽</span><span class="discount-price">${total}₽</span>`;
    } else {
        discText = `<span class="regular-price">${price}₽</span>`;
    }

    let roomName = activeRoom === 'room1' ? 'Капсула 🔵' : 'Капсула 🔴';
    document.getElementById('summary').innerHTML = `Выбрано ${selD} с ${selH}:00 до ${selH+selL}:00 ${discText} ${roomName}`;
}

document.getElementById('minusHour').onclick=()=>{
    if(selL>3||(selL==3&&free(selD,selH+1))||(selL==2&&canBookOne(selD,selH))){selL--;upd();}
    else alert('Минимальное бронирование 2 часа');
};

document.getElementById('plusHour').onclick=()=>{
    if(free(selD,selH+selL)){selL++;upd();}
    else alert('Час занят или конец дня');
};

// пример метода отправки бронирования
function bookSlots() {
  if (!selD || selH === null || selL < 1) {
    alert("Выбери слот для бронирования!");
    return;
  }

  // Telegram данные пользователя (username и имя)
  const username = Telegram.WebApp.initDataUnsafe?.user?.username;
  const customer = Telegram.WebApp.initDataUnsafe?.user?.first_name || username || "unknown";

  fetch('https://drumfitness.ru/api/bookings', {
     method: "POST",
     headers: {
       "Content-Type": "application/json"
     },
     body: JSON.stringify({
        date: selD,
        hours: Array.from({length: selL}, (_, i) => selH + i),
        customer: customer,
        username: username,
        room: activeRoom, // Добавляем информацию о выбранной комнате
        total_price: final_price
     })
  })
  .then(res => res.json())
  .then(res => {
     if(res.status === "OK"){
         alert("✅ Забронировано успешно! Скоро администратор подтвердит заявку");
         location.reload();
     } else {
         alert("❌ Ошибка при бронировании! Попробуй повторить запрос");
     }
  })
  .catch(err => {
      console.error(err);
      alert("Ошибка связи с сервером. Повторите чуть позже");
  });
}

// Загружаем данные при запуске
loadBookings();
