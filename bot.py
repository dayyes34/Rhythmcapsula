from aiogram import Bot, Dispatcher, executor, types

API_TOKEN = '8188912825:AAEEq8lTj3R_a0lx6OKPyt59Nc_jv04GRxs'

bot = Bot(token=API_TOKEN)
dp = Dispatcher(bot)

@dp.message_handler(commands=['start'])
async def cmd_start(message: types.Message):
    keyboard = types.InlineKeyboardMarkup()
    keyboard.add(types.InlineKeyboardButton(text="📲 Test",
                                            web_app=types.WebAppInfo(url="https://t.me/rhythmcapsule_bot/book")))
    await message.answer("Нажмите, чтобы забронировать помещение:", reply_markup=keyboard)

@dp.message_handler(content_types=['web_app_data'])
async def web_app(message: types.Message):
    await message.answer(f"Полученные данные от Web App:\n{message.web_app_data.data}")

if __name__ == '__main__':
    executor.start_polling(dp, skip_updates=True)
