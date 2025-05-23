Telegram.WebApp.expand();
const MSK_OFFSET=180, openHour=7, closeHour=23,daysShow=28;
let selD=null,selH=null,selL=3;
let final_price = 0; //Итоговая цена бронирования

let BOOKED={}; 

fetch('https://drumfitness.ru/api/booked-slots')
  .then(res => res.json())
  .then(data => {
      BOOKED = data; // твой новый API УЖЕ дает формат как раз {дата:[часы,...]}
      render();
  })
  .catch(err => { 
    console.error(err); 
    alert('Ошибка загрузки расписания :('); 
  });





function mskD(d){return new Date(d.getTime()+6e4*(MSK_OFFSET+d.getTimezoneOffset())).toISOString().slice(0,10);}
function render() {
    let d = new Date(), html = '';
    for (let i = 0; i < daysShow; i++) {
        let k = mskD(d), sd = new Date(d.getTime() + 6e4 * (MSK_OFFSET + d.getTimezoneOffset()));
        html += `<div class="date-block"><b>${sd.toLocaleDateString('ru', {weekday: 'long', day: 'numeric', month: 'short'})}</b>
        <div class="slot-container">`;

        for (let h = openHour; h < closeHour; h++) {
            let b = BOOKED[k]?.includes(h) ? 'booked' : '';
            html += `<div class='slot ${b}' data-d='${k}' data-h='${h}'>${h}:00</div>`;
        }

        html += `</div></div><hr>`;
        d.setDate(d.getDate() + 1);
    }
    document.getElementById('calendar').innerHTML = html;
    document.querySelectorAll('.slot:not(.booked)').forEach(e => e.onclick = () => choose(e.dataset.d, +e.dataset.h));
}

function free(d,h){return h>=openHour&&h<closeHour&&!BOOKED[d]?.includes(h)}
function choose(d,h){selD=d;selH=h;selL=getInitialL(d,h);upd();}

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
        total_price: final_price  // <- Итоговая цена из нашей переменной
     })
  })
  .then(res => res.json())
  .then(res => {
     if(res.status === "OK"){
         alert("✅ Забронировано успешно! Скоро администрация подтвердит заявку.");
         location.reload();
     } else {
         alert("❌ Ошибка при бронировании! Попробуй повторить запрос.");
     }
  })
  .catch(err => {
      console.error(err);
      alert("Ошибка связи с сервером. Повторите чуть позже.");
  });
}


function getInitialL(d,h){
    if(free(d,h+1)&&free(d,h+2))return 3;
    if(free(d,h+1))return 2;
    if((!free(d,h-1)&&!free(d,h+1))||(h==closeHour-1&&!free(d,h-1)))return 1;
    return 0;
}
function canBookOne(d,h){return(!free(d,h-1)&&!free(d,h+1))||(h==closeHour-1&&!free(d,h-1))}
function upd(){
    document.querySelectorAll('.slot').forEach(e=>e.classList.remove('selected'));
    if(selL<1){selD=null;selH=null;selL=0;document.getElementById('summary').innerHTML='Неверный выбор';return;}
    let total=0,full=0,basePrices=[];
    for(let h=selH;h<selH+selL;h++){
        document.querySelector(`.slot[data-d='${selD}'][data-h='${h}']`).classList.add('selected');
        // исправлено тут (теперь явно указано для 1,2,3+ часов)
        let basePrice = selL==1 ? 400 : (selL==2 ? 300 : (h-selH<2 ? 300 : 250));
        basePrices.push(basePrice);
    }
    full=basePrices.reduce((a,b)=>a+b,0);

    basePrices.forEach((hourPrice,i)=>{
        let curHour=selH+i,discount=0;
        if(curHour>=7&&curHour<11)discount=0.3;
        else if(curHour>=11&&curHour<14)discount=0.1;
        total+=hourPrice*(1-discount);
    });
    total=Math.round(total);
    final_price = total; // Записываем итоговую цену в нашу переменную

    document.getElementById('hCount').innerText=selL;
    let discText='';
    if(total<full){
        discText=`<span class="old-price">${full}₽</span><span class="final-price">${total}₽</span>`;
    }else discText=`${full}₽`;
    document.getElementById('summary').innerHTML=`Выбрано ${selD} с ${selH}:00 до ${selH+selL}:00 (${discText})`;
}
document.getElementById('minusHour').onclick=()=>{
    if(selL>3||(selL==3&&free(selD,selH+1))||(selL==2&&canBookOne(selD,selH))){selL--;upd();}
    else alert('Нельзя уменьшить меньше минимума');
};
document.getElementById('plusHour').onclick=()=>{
    if(free(selD,selH+selL)){selL++;upd();}
    else alert('Час занят или конец дня');
};
render();