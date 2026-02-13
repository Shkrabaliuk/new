# Architecture (v0)

## 1. Components

- Editor Core: приймає текстовий ввід.
- Processing Pipeline: нормалізація, типографіка, авто-структура.
- Storage Adapter: читання/запис `.md` файлів.
- Renderer: перетворення block model у HTML.
- Navigation Service: отримання сусідніх матеріалів.

## 2. Processing pipeline

1. Input: raw text.
2. Normalize: уніфікація переносів рядків і пробілів.
3. Typography: застосування правил лапок/тире/нерозривних пробілів.
4. Structure inference: побудова block model.
5. Persist: запис markdown + метаданих.
6. Render: генерація HTML для читача.

## 3. Data contracts

### Document
- `id: string`
- `slug: string`
- `title: string`
- `body: string`
- `createdAt: datetime`
- `updatedAt: datetime`
- `tags: string[]`

### Block
- `type: heading | paragraph | ul | ol | marginalia | image | quote | code`
- `content: string`
- `meta: object`

## 4. Storage layout

- `content/YYYY/MM/<slug>.md`
- `content/YYYY/MM/<slug>.meta.json`
- `assets/<uuid>.<ext>`

## 5. Risks

- Неправильна класифікація блоків у авто-структурі.
- Конфлікти при паралельному редагуванні одного файлу.
- Розбіжність між preview і production render.
