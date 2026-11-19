# CleverVet backend — безопасный mock-этап

Исходный локальный коммит `f50c68d` недоступен. Код восстановлен заново в ветке `clevervet-backend-bootstrap` и не считается точной копией прежнего прототипа.

## Реализовано

- `GET /health` и защищённый `POST /api/mock/patients/:id/photo`, оба на `127.0.0.1:8787`.
- Mock JWT с отдельным ключом и разрешённым `sub`, ограничение пациента, JPEG 8 МБ, CORS только `https://fork995.github.io`, ID запроса, повторный GET и in-memory защита от повторной записи.
- Изолированные адаптеры JWT/JWKS, S3 PutObject и CleverVet GET/PUT; к HTTP-маршруту **подключены только mock-адаптеры**.
- Реальные операции с CleverVet и Yandex Object Storage недоступны. `PHOTO_WRITES_ENABLED` для реального сервиса не используется и не включает их.
- `src/service.ts` запрещает S3 PutObject до проверки поддержки условного обновления и наличия ETag. Поддержка `If-Match` оригинальным CleverVet пока **не подтверждена**.
- Отдельная локальная админка на порту 8788 с хешированным паролем, cookie-сессией и CSRF. Проверка CleverVet API и получение OIDC-токенов ещё не реализованы; UI сообщает об этом явно.

## Локальная проверка

```sh
npm ci
npm test
npm start
curl http://127.0.0.1:8787/health
```

Для запуска mock HTTP-маршрута создайте вне репозитория случайный файл ключа не менее 32 байт с правами `0600` и задайте `MOCK_MODE=true`, `MOCK_JWT_SECRET_FILE`, `MOCK_ALLOWED_SUBJECT`, `MOCK_PILOT_PATIENT_ID=synthetic-patient`. Никаких реальных credentials для mock-тестов не требуется. Интеграционный тест использует полностью синтетический JWT, JPEG и пациента.

## Админка

Системный администратор самостоятельно задаёт пароль в SSH-сеансе, передавая его через stdin в `node dist/adminSetup.js /путь/вне/репозитория/admin-password.hash`. Ввод не должен попадать в shell history или аргументы процесса. Хранится только соль и `scrypt`-хеш в файле `0600`.

Установите `ADMIN_PASSWORD_HASH_FILE` и при готовом интерактивном дисплее `BROWSER_LAUNCH_SCRIPT`, затем `npm run start:admin`. Откройте только через `ssh -L 8788:127.0.0.1:8788 -L 6080:127.0.0.1:6080 orangepi` и адрес `http://127.0.0.1:8788/admin`. VNC требует отдельный случайный пароль из `/dev/shm/clevervet-vnc-password`, который виден только владельцу Orange Pi. Без запуска браузера порт 6080 закрыт.

Xvfb and interactive Chromium launch after the administrator installed x11-xkb-utils. Headless Chromium has also been verified.

## Что осталось до реальной записи

Подтвердить штатный OIDC-процесс и разрешённое серверное использование сессии; реализовать зашифрованное хранение и удаление серверной сессии; отдельно проверить права S3 и `If-Match` CleverVet API; реализовать реальный защищённый HTTP-маршрут после отдельного разрешения на пилот. Не передавать S3 credentials или ID token обычному Test3.
