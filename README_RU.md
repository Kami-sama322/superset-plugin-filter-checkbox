# Checkbox — Native Filter для Apache Superset

> **Кастомный Native Filter плагин для Apache Superset**: прокручиваемый
> **список чекбоксов** для фильтрации дашборда по значениям колонки
> (мультивыбор или одиночный выбор).

---

## Возможности

- Native Filter (панель фильтров дашборда), не график
- Прокручиваемый список чекбоксов (не выпадающий список)
- Мультивыбор по умолчанию; в настройках можно включить одиночный выбор
- Опциональная строка поиска над списком
- Инверсия выбора («Выбрать противоположные значения»): отмеченные пункты
  показывают **×** и исключаются (`NOT IN`)
- Whitelist **Displayed values** / отображаемых значений в настройках
  (пусто = все уникальные значения)
- Значения по умолчанию через стандартный UI Default value
- Список опций **не** каскадируется от других фильтров
- Фильтрует чарты того же датасета через scope native filter
- Синхронизация с **cross-filter** чартов того же датасета:
  резолвит distinct-значения колонки фильтра под clauses чарта
  (любые колонки) и выделяет их
  (инверсия → выделяет дополнение, кликнутые значения остаются без отметки)

---

## Требования

| Компонент | Версия |
|-----------|--------|
| Apache Superset | 6.1.0 |
| Python | 3.10+ |
| Node.js | 20+ (сборка образа: 22) |
| npm | 10+ |
| React (peer) | ^17.0.2 |
| npm-пакет | `@superset-ui/plugin-filter-checkbox` |
| Ключ плагина | `filter_checkbox` |

---

## Установка

### Шаг 1. Клонировать Apache Superset нужной версии

[Apache Superset 6.1.0](https://github.com/apache/superset/releases/tag/6.1.0)

```bash
git clone https://github.com/apache/superset.git -b 6.1.0;
```

### Шаг 2. Клонировать репозиторий плагина

```bash
git clone https://github.com/Kami-sama322/superset-plugin-filter-checkbox.git;
```

### Шаг 3. Запустить скрипт автоустановки

```bash
chmod +x superset-plugin-filter-checkbox/install.sh;
./superset-plugin-filter-checkbox/install.sh ./superset;
```

> `./superset` — корень дерева Superset из шага 1. Скрипт устанавливает
> плагин как **отдельный npm-пакет** в
> `superset-frontend/plugins/plugin-filter-checkbox/` и регистрирует его
> в точках расширения Superset (`key: filter_checkbox`).

#### Что делает скрипт:

| Действие | Файл |
|----------|------|
| 0. Копирует пакет плагина | `superset-frontend/plugins/plugin-filter-checkbox/` |
| 1. Регистрирует плагин | `superset-frontend/src/setup/setupPluginsExtra.ts` |
| 2. Добавляет path alias | `superset-frontend/tsconfig.json` |
| 3. Добавляет `filter_checkbox` в `FILTER_SUPPORTED_TYPES` | `FiltersConfigForm/constants.ts` |
| 4. Добавляет поле **Displayed values** под Description | `FiltersConfigForm` + `DisplayValuesField.tsx` |

> Список «Add filter» строится из реестра плагинов
> (`Behavior.NativeFilter`). `setupPluginsExtra.ts` — документированная
> точка расширения. `FILTER_SUPPORTED_TYPES` задаёт типы колонок в
> селекторе.
>
> **Если скрипт не сработал** — примените изменения вручную (шаг 4б ниже).

---

### Шаг 4б. Ручная регистрация плагина (если install.sh не сработал)

#### 1. Скопировать пакет в каталог plugins

```bash
mkdir -p superset-frontend/plugins/plugin-filter-checkbox/src
cp -r superset-plugin-filter-checkbox/src/. \
  superset-frontend/plugins/plugin-filter-checkbox/src/
cp superset-plugin-filter-checkbox/package.json \
  superset-frontend/plugins/plugin-filter-checkbox/package.json
cp superset-plugin-filter-checkbox/tsconfig.json \
  superset-frontend/plugins/plugin-filter-checkbox/tsconfig.json
```

#### 2. Зарегистрировать в `superset-frontend/src/setup/setupPluginsExtra.ts`

```typescript
import CheckboxFilterPlugin from '@superset-ui/plugin-filter-checkbox';

export default function setupPluginsExtra() {
  new CheckboxFilterPlugin()
    .configure({ key: 'filter_checkbox' })
    .register();
}
```

#### 3. Path alias — `superset-frontend/tsconfig.json`

В блоке `paths`:

```json
"@superset-ui/plugin-filter-checkbox": ["./plugins/plugin-filter-checkbox/src"],
```

#### 4. Типы колонок — `FiltersConfigForm/constants.ts`

В `FILTER_SUPPORTED_TYPES`:

```typescript
filter_checkbox: [
  GenericDataType.Boolean,
  GenericDataType.String,
  GenericDataType.Numeric,
  GenericDataType.Temporal,
],
```

#### 5. UI «Displayed values» (рекомендуется)

Скопируйте `superset-patches/DisplayValuesField.tsx` в
`FiltersConfigForm/DisplayValuesField.tsx` и подключите под Description
в `FiltersConfigForm.tsx` так же, как это делает `install.sh`.

Затем в `superset-frontend`: `npm install` и `npm run dev-server`.

---

## Запуск Superset в режиме разработки

### Шаг 5. Python-окружение

```bash
cd superset
python -m venv .venv
source .venv/bin/activate
pip install -r requirements/development.txt
```

### Шаг 6. Конфигурация (опционально)

В Superset 6.1.0 native filters и cross-filtering включены по умолчанию.
Если меняете feature flags, оставьте как минимум:

```python
FEATURE_FLAGS = {
    "DASHBOARD_NATIVE_FILTERS": True,
    "DASHBOARD_CROSS_FILTERING": True,
}
```

### Шаги 7–10. База данных и администратор

```bash
superset db upgrade
superset fab create-admin \
  --username admin --firstname Admin --lastname User \
  --email admin@example.com --password admin
superset init
```

### Шаги 11–13. Backend и frontend

```bash
# терминал 1 — backend
superset run -h 0.0.0.0 -p 8088 --with-threads --reload --debugger

# терминал 2 — frontend (после install.sh + npm install в superset-frontend)
cd superset-frontend
npm install
npm run dev-server
```

---

## Быстрый старт через Docker

В репозитории есть автономный стенд: `Dockerfile` собирает Superset **6.1.0**
с уже встроенным плагином; `docker-compose.yml` поднимает его локально.

**Нужно:** Docker, Docker Compose v2, ~8 GB RAM на сборку фронтенда.

```bash
git clone https://github.com/Kami-sama322/superset-plugin-filter-checkbox.git
cd superset-plugin-filter-checkbox

docker compose build    # первый раз: клон Superset 6.1.0 + npm run build (15–40 мин)
docker compose up -d    # init БД, admin/admin, load-examples при первом запуске
```

Открыть **http://localhost:8088** → вход **admin** / **admin**.

При первом запуске контейнер выполняет `superset db upgrade`, создаёт админа
и загружает примеры датасетов (1–3 мин). Повторные запуски пропускают init,
если том сохранён.

**Сброс окружения** (чистая БД и примеры):

```bash
docker compose down -v
docker compose up -d
```

**Проверка плагина:** Dashboard → Edit → **+ Add / Edit filters** →
**Checkbox**.

---

## Как использовать фильтр

1. Откройте дашборд → **Edit** → **+ Add / Edit filters**
2. Добавьте фильтр → выберите **Checkbox**
3. Укажите **Column**
4. Опциональные настройки:
   - **Can select multiple values** (снимите для одиночного выбора)
   - **Show search bar**
   - **Inverse selection** / Выбрать противоположные значения
   - **Filter value is required**
   - **Sort filter values**
5. В **Settings**:
   - **Displayed values** (под Description) — whitelist; пусто = все значения
   - Опционально: **Filter has default value** и отметьте дефолты
6. Настройте **scope** на нужные чарты
7. **Save**

### Синхронизация с cross-filter

Когда чарт на **том же датасете** отдаёт cross-filter (клик по ячейке
таблицы, региону карты, …), список чекбоксов обновляется до distinct-
значений **колонки этого фильтра**, оставшихся под фильтром чарта —
даже если чарт фильтровал другую колонку.

- Обычный режим: matching-значения отмечены (✓)
- Инверсия: matching остаются без отметки; на остальных — ×

### Пример

Колонки датасета: `macroregion`, `region` (в макрорегионе несколько регионов).

| Колонка фильтра | Клик в чарте | Результат чекбоксов (обычный режим) |
|-----------------|--------------|-------------------------------------|
| `region` | таблица/карта по `macroregion` | регионы этого макрорегиона |
| `region` | таблица по `region` | этот регион |

---

## Структура пакета

```
superset-plugin-filter-checkbox/
├── README.md
├── README_RU.md
├── src/
│   ├── index.ts
│   ├── CheckboxFilterPlugin.tsx
│   ├── useCrossFilterSync.ts   # Redux + resolve chart → фильтр
│   ├── crossFilterSync.ts      # collect / fetch / selection helpers
│   ├── buildQuery.ts
│   ├── controlPanel.ts
│   ├── transformProps.ts
│   ├── types.ts
│   ├── utils.ts
│   ├── common.ts
│   └── images/thumbnail.png
├── superset-patches/
│   └── DisplayValuesField.tsx  # копируется в FiltersConfigForm через install.sh
├── package.json
├── tsconfig.json
├── install.sh
├── Dockerfile                  # Superset 6.1.0 + production-сборка плагина
└── docker-compose.yml          # локальный demo-стенд
```

---

## Лицензия

Apache License 2.0 (как у Superset)
