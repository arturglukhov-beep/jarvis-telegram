# Подготовка Telegram Jarvis

План: /home/agent/projects/tgbotdorabotka/PLAN.md

- [x] Конфигурация, секреты и память
- [x] Транспорт Codex, диалоги, остановка
- [x] Telegram, владелец, доставка ответов
- [x] Установка зависимостей, шаблон службы, документация
- [x] Офлайн-тесты и независимое ревью текстовой версии

Ruling: Исходный бот сохранён в legacy; новый безопасный entrypoint использует grammY, прежний исполняемый код не запускается. Причина: старый бот имеет обход разрешений и обращается к запрещённой .agent. Цена: голосовые, вложения, меню моделей и расписания не входят в текстовый выпуск.
Ruling: При неисправной изоляции первая версия использует Codex read-only, отклоняет все approval-запросы, отключает инструменты и подключаемые сервисы; выполнение действий недоступно. Полный исходный план не объявлять выполненным.
Ruling: Живые запросы к модели и Telegram не выполнять до ввода владельцем секрета и следующего шага подключения.

Task 1: complete — конфигурация, whitelist памяти, даты Камчатки, атомарное состояние; node --test tests/config.test.js: 6/6.
Task 2: complete — JSONL RPC, split UTF8, concurrent responses, process exit, timeout, invalid JSON: 9/9 tests. Исправлен тестовый сервер: две JSON-строки нельзя перемешивать внутри одного фрейма; тест разделён на фрагментацию и параллельные запросы.
Task 3: complete — Codex thread start/resume, final messages, failed turns, process crash, cancellation and persisted sessions: 6/6 targeted tests. Первоначальный общий запуск: 13/15, два RPC-теста имели слишком короткий таймаут старта фиктивного Node-процесса (200 мс). Ruling: /stop закрывает только принадлежащий запросу процесс App Server; это надёжнее гонки turn/interrupt в момент старта. История остаётся на диске Codex, повторная отправка действий отключена.
Task 4: complete — Telegram middleware, pairing, no third-party deliveries, plain text responses, at-most-once updates, unsupported attachments; suite 20/20. Изоляция сервера повторно проверена: bwrap RTM_NEWADDR Operation not permitted. Выполнение инструментов не включать.

Ruling: Требование сохранения всех legacy-функций из полного плана не выполнено в текстовой версии. Они явно отключены, исходники сохранены; цена — голосовые и вложения пока не работают. Расписания, выбор модели и выполнение действий требуют отдельного этапа.
Ruling: untrusted присутствует в schema, но реальный CLI запрещает его; выбран on-request с approvalsReviewer=user и отказом всех server requests. Изоляция не обходится; цена — действия недоступны.
Task 5: реальная проверка initialize, account/read и ephemeral thread/start прошла; sandbox readOnly, модель по умолчанию gpt-6.1-sol. Ни один turn не запрашивался.
Final review: независимый reviewer проверил рабочую копию, 33/33 офлайн-теста; два Important замечания: утечка lock при startup-error и отсутствие отмены сетевых ожиданий.
Final: fixed startup lock leak — corrupt state/owner conflict test RED→GREEN.
Final: fixed shutdown network waits — preflight and delivery abort tests RED→GREEN; bounded drain, SDK timeout, SIGTERM propagated.
Final: fixed valid private auth cache after Codex refresh — runtime test RED→GREEN.
Deferred minors: нет замечаний, отложенных по итогам ревью.

Ожидается от владельца: npm run setup (скрытый ввод токена), затем проверка в Telegram и включение службы. Служба не установлена, Telegram не опрашивается, живой ответ модели не проверен.

Итог подготовки: npm test — 37/37 JavaScript и 1/1 Python; npm audit --omit=dev — 0 vulnerabilities; node --check — 21 файл; Python syntax и systemd-analyze verify — успешно. Реальный metadata-check подтверждает авторизованный аккаунт, но ожидаемо возвращает exit 1 до ввода BOT_TOKEN и OWNER_ID/PAIRING_HASH. Live turn и Telegram не запускались.
Статус: подготовка текстовой программы завершена; подключение и запуск ожидают локального ввода токена владельцем. _progress.md сохранён как журнал, поскольку удаление без подтверждения запрещено.

14.11.2026 — Артур локально сохранил токен и получил код привязки. npm run check: ok=true. Telegram getMe подтвердил bestsled1126_bot, webhook отсутствует. Запущена пользовательская systemd-служба jarvis-telegram.service (Linger=yes), startup preflight успешен, active/running, NRestarts=0. Системный sudo недоступен без пароля, поэтому использована пользовательская служба без привилегированных namespace-параметров. Осталось: Артуру отправить боту одноразовую /start-команду из терминала и проверить первый ответ Codex. Значения секрета и кода в файлы памяти не копировались.

## Расширение по запросу Артура
План: EXTENSIONS_PLAN.md.
- [x] Найдена причина userns/AppArmor; восстановлен недостающий bwrap.
- [ ] Подготовить точечное административное исправление и самопроверку изоляции.
- [ ] Файлы и одноразовые подтверждения.
- [ ] Напоминания.
- [ ] Вложения и локальный голос.
- [ ] Telegram/Codex интеграция, тесты, ревью, запуск.

Расширение, шаги 1–3: восстановлен bundled bwrap, подготовлены проверенный AppArmor profile и sudo-установщик (не применены). Добавлены ScopedFiles через O_NOFOLLOW/descriptors и backup, одноразовые Approvals, сохраняемые Reminders с unknown/missed/cancelled. Общая проверка: 46/46 JS; исходная служба пока работает без перезапуска.

Расширение, итог до включения v0.2.0:
- ScopedFiles/Approvals/Reminders, документы/изображения и локальный faster-whisper интегрированы в Telegram. Голос — запрос владельца с подтверждением действий; документы/картинки — недоверенные данные.
- Реальный структурированный turn проверен через ChatGPT auth, без Telegram-доставки и отдельного платного API. Локальный распознаватель проверен на публичном JFK sample; PDF и фактическая длина аудио проверены Python-тестами.
- Независимое ревью: 3 Important (FIFO блокирует open, cancel возобновляется после send, одинаковые кнопки разных previews), 1 Minor (полное чтение молча обрезается). Последнее переклассифицировано Important: владелец не должен принимать частичный файл за полный результат.
- Final: fixed FIFO and bounded read — test RED→GREEN; O_NONBLOCK, fstat regular-file, max 128001 bytes.
- Final: fixed cancel/send race — success/failure regression test RED→GREEN; cancelled не перезаписывается.
- Final: fixed preview/button ambiguity — test RED→GREEN; unique ID, exact reply_parameters, description and serialized reply delivery.
- Final: fixed full read delivery — test RED→GREEN; полный файл прикрепляется, inline preview обозначен сокращённым.
- Проверки: npm test 62 JS + 3 Python успешно; npm audit 0; JS/Python syntax и AppArmor profile parser успешно. Повторный sandbox selftest с NoNewPrivileges: blocked bwrap RTM_NEWADDR, ready=false.
- Ruling: произвольные команды Linux остаются выключены. Root-исправление готово как точечный профиль bubblewrap, требует sudo владельца. После него обязательны selftest и отдельная проверка подключения shell, автоматического включения нет.
- Ruling: чтение и изменение файлов доступны через ограниченный контроллер и явное подтверждение, без нативного shell; цена — работа только в разрешённых проектах и лимиты размера. Сам бот и секреты исключены.
- Ruling: голос распознаётся локально base/int8 на CPU; платный API не добавлен; цена — лимит 2 минуты и время обработки на CPU.
- Ruling: напоминания только владельцу, неизвестная доставка не повторяется, пропущенные после простоя помечаются missed; цена — иногда нужен ручной повтор вместо риска дубля.
Deferred minors: нет; замечание о больших файлах переклассифицировано и исправлено.
