const MSKOFFSET = 180; 
const openHour = 7;
const closeHour = 23;
const daysShow = 28;

let selD = null, selH = null, selL = 3;
let final_price = 0; // Итоговая цена бронирования

let BOOKED = {};
let activeRoom = 'drum'; // Значения: 'drum' или 'fitness'
let scrollPosition = 0; // Для сохранения позиции скролла

// Загружаем данные при запуске
document.addEventListener('DOMContentLoaded', function() {
  // Настраиваем переключатели комнат
  const drumBtn = document.getElementById('drumRoomBtn');
  const fitnessBtn = document.getElementById('fitnessRoomBtn');

  if (drumBtn) {
    drumBtn.addEventListener('click', function() {
      switchRoom('drum');
    });
  } else {
    console.error('Кнопка #drumRoomBtn не найдена');
  }

  if (fitnessBtn) {
    fitnessBtn.addEventListener('click', function() {
      switchRoom('fitness');
    });
  } else {
    console.error('Кнопка #fitnessRoomBtn не найдена');
  }

  // Настраиваем кнопки для +/- часов
  document.getElementById('minusHour').onclick = () => {
    if(selL > 3 || (selL == 3 && free(selD, selH+1)) || (selL == 2 && canBookOne(selD, selH))) {
        selL--; 
        upd();
    } else alert('Нельзя уменьшить меньше минимума');
  };

  document.getElementById('plusHour').onclick = () => {
    if(free(selD, selH+selL)) {
        selL++; 
        upd();
    } else alert('Час занят или конец дня');
  };

  // Загружаем начальные данные
  loadBookedSlots();
});

// Загрузка данных о забронированных слотах
function loadBookedSlots() {
  fetch(`https://drumfitness.ru/api/booked-slots?room=${activeRoom}`)
    .then(res => res.json())
    .then(data => {
      BOOKED = data; // твой новый API УЖЕ дает формат как раз даты/часы
      render();
      updateRoomButtons();
    })
    .catch(err => {
      console.error(err);
      alert('Ошибка загрузки расписания');
    });
}

// Функция переключения между комнатами
function switchRoom(room) {
  if (activeRoom !== room) {
    const calendarEl = document.getElementById('calendar');
    if (calendarEl) {
      scrollPosition = calendarEl.scrollTop || 0;
    }
    activeRoom = room;
    selD = null;
    selH = null;
    selL = 3;
    loadBookedSlots();
  }
}

// Обновление стилей кнопок переключения
function updateRoomButtons() {
  const drumBtn = document.getElementById('drumRoomBtn');
  const fitnessBtn = document.getElementById('fitnessRoomBtn');
  const title = document.getElementById('roomTitle');

  if (drumBtn && fitnessBtn) {
    drumBtn.classList.toggle('active', activeRoom === 'drum');
    fitnessBtn.classList.toggle('active', activeRoom === 'fitness');

    if (title) {
      title.textContent = activeRoom === 'drum' ? 'Барабанная комната' : 'Фитнес зал';
    }
  }
}

// Преобразование даты в МСК
function mskD(d) { 
  return new Date(d.getTime() + 60e4 * (MSKOFFSET + d.getTimezoneOffset())).toISOString().slice(0, 10); 
}

// Отрисовка календаря
function render() {
  let d = new Date();
  let html = '';

  // Получаем текущую дату и час в MSK
  const nowDate = new Date();
  const currentMskDate = mskD(nowDate);
  const currentMskHour = nowDate.getUTCHours() + 3; // MSK = UTC+3

  for (let i = 0; i < daysShow; i++) {
    let k = mskD(d);
    let sd = new Date(d.getTime() + 60e4 * (MSKOFFSET + d.getTimezoneOffset()));

    html += `<div class="dateblock"><b>${sd.toLocaleDateString('ru', {weekday: 'long', day: 'numeric', month: 'short'})}</b>
    <div class="slot-container">`;

    for (let h = openHour; h < closeHour; h++) {
      // Проверяем, прошел ли час в текущий день
      let isPastHour = (k === currentMskDate && h <= currentMskHour);
      let b = BOOKED[k] && BOOKED[k].includes(h) ? 'booked' : '';

      // Если час прошел, добавляем класс 'past'
      if (isPastHour) {
          b = 'booked past'; // Используем booked для блокировки и past для стилизации
      }

      html += `<div class="slot ${b}" data-d="${k}" data-h="${h}">${h}:00</div>`;
    }

    html += `</div></div><hr>`;
    d.setDate(d.getDate() + 1);
  }

  const calendarEl = document.getElementById('calendar');
  if (calendarEl) {
    calendarEl.innerHTML = html;

    // Добавляем обработчики кликов на свободные слоты
    document.querySelectorAll('.slot:not(.booked)').forEach(e => {
      e.onclick = () => choose(e.dataset.d, +e.dataset.h);
    });

    // Восстанавливаем позицию скролла
    setTimeout(() => {
      calendarEl.scrollTop = scrollPosition;
    }, 10);
  }
}

// Проверка доступности слота
function free(d, h) { 
  return h >= openHour && h < closeHour && !BOOKED[d]?.includes(h); 
}

// Выбор слота
function choose(d, h) { 
  selD = d; 
  selH = h; 
  selL = getInitialL(d, h); 
  upd(); 
}

// Метод отправки бронирования
function bookSlots() {
  if (selD === null || selH === null || selL < 1) {
    alert('Выбери слот для бронирования');
    return;
  }

  // Telegram данные пользователя: username и имя
  const username = TelegramWebApp.initDataUnsafe.user.username;
  const customer = TelegramWebApp.initDataUnsafe.user.first_name || username || 'unknown';

  fetch('https://drumfitness.ru/api/bookings', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({
        date: selD,
        hours: Array.from({ length: selL }, (_, i) => selH + i),
        customer: customer,
        username: username,
        room: activeRoom, // Добавляем информацию о руме
        totalprice: final_price    // Итоговая цена из нашей переменной
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

// Определение начального количества часов
function getInitialL(d, h) {
  if(free(d, h) && free(d, h+1) && free(d, h+2)) return 3;
  if(free(d, h) && free(d, h+1)) return 2;
  if(free(d, h) && free(d, h+1) && h < closeHour-1 && free(d, h+1)) return 1;
  return 0;
}

// Проверка возможности бронирования одного часа
function canBookOne(d, h) { 
  return free(d, h) && free(d, h+1) && h < closeHour-1 && free(d, h+1); 
}

// Обновление интерфейса при выборе слота
function upd() {
  document.querySelectorAll('.slot').forEach(e => e.classList.remove('selected'));

  if(selL < 1 || selD === null || selH === null) { 
    selL = 0; 
    document.getElementById('summary').innerHTML = 'Неверный выбор'; 
    return; 
  }

  let total = 0, full = 0, basePrices = [];

  for(let h = selH; h < selH + selL; h++) {
    const slotEl = document.querySelector(`.slot[data-d="${selD}"][data-h="${h}"]`);
    if (slotEl) {
      slotEl.classList.add('selected');
    }

    // исправлено тут, теперь явно указано для 1,2,3 часов
    let basePrice = selL === 1 ? 400 : selL === 2 ? 300 : (h-selH >= 2 ? 300 : 250);
    basePrices.push(basePrice);
  }

  full = basePrices.reduce((a, b) => a + b, 0);

  basePrices.forEach((hourPrice, i) => {
    let curHour = selH + i, discount = 0;
    if(curHour >= 7 && curHour < 11) discount = 0.3;
    else if(curHour >= 11 && curHour < 14) discount = 0.1;
    total += hourPrice * (1 - discount);
  });

  total = Math.round(total);
  final_price = total; // Записываем итоговую цену в нашу переменную

  const hCountEl = document.getElementById('hCount');
  if (hCountEl) {
    hCountEl.innerText = selL;
  }

  let discText = '';
  if(total < full) {
    discText = `<span class="old-price">${full}₽</span><span class="final-price">${total}₽</span>`;
  } else discText = `${full}₽`;

  const summaryEl = document.getElementById('summary');
  if (summaryEl) {
    summaryEl.innerHTML = `Выбрано ${selD} с ${selH}:00 до ${selH+selL}:00 (${discText})`;
  }
}

// Отображаем данные при загрузке страницы
loadBookedSlots();

// Отладочный код
console.log('Поиск элементов DOM...');
console.log('drumRoomBtn найден:', !!document.getElementById('drumRoomBtn'));
console.log('fitnessRoomBtn найден:', !!document.getElementById('fitnessRoomBtn'));
console.log('calendar найден:', !!document.getElementById('calendar'));
console.log('roomTitle найден:', !!document.getElementById('roomTitle'));
console.log('summary найден:', !!document.getElementById('summary'));
console.log('hCount найден:', !!document.getElementById('hCount'));
console.log('minusHour найден:', !!document.getElementById('minusHour'));
console.log('plusHour найден:', !!document.getElementById('plusHour'));
