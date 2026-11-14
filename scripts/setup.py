#!/usr/bin/env python3
"""Local owner-only secret entry. Does not make Telegram or model requests."""
from pathlib import Path
import getpass
import hashlib
import os
import re
import secrets
import sys

def main(directory=Path('/home/agent/.config/jarvis-telegram')):
    if not sys.stdin.isatty():
        raise SystemExit('Запустите настройку в интерактивном терминале сервера.')
    target = directory / 'env'
    if target.exists() or target.is_symlink():
        raise SystemExit('Конфигурация уже существует. Автоматическая перезапись отключена.')
    token = getpass.getpass('Вставьте токен @bestsled1126_bot (ввод скрыт): ').strip()
    if not re.fullmatch(r'\d+:[A-Za-z0-9_-]+', token):
        raise SystemExit('Неверный формат токена. Ничего не сохранено.')
    owner = input('Ваш числовой Telegram ID (Enter — привязать по коду): ').strip()
    if owner and not re.fullmatch(r'[1-9]\d{0,15}', owner):
        raise SystemExit('Неверный OWNER_ID. Ничего не сохранено.')
    code = secrets.token_urlsafe(24) if not owner else ''
    digest = hashlib.sha256(code.encode()).hexdigest() if code else ''
    os.umask(0o077)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    if directory.resolve() != directory:
        raise SystemExit('Символические ссылки в пути конфигурации запрещены.')
    directory.chmod(0o700)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
    with os.fdopen(os.open(target, flags, 0o600), 'w') as file:
        file.write(f'BOT_TOKEN={token}\nOWNER_ID={owner}\nPAIRING_HASH={digest}\n')
        file.flush()
        os.fsync(file.fileno())
    print('Конфигурация сохранена с правами 0600. Токен не выводится.')
    if code:
        print('После запуска бота отправьте ему в личном Telegram:')
        print('/start ' + code)
        print('Код одноразовый. Не передавайте его другим людям.')

if __name__ == '__main__':
    main()
