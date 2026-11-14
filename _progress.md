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
