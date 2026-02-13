# Parser/Render Pipeline Spec (v0)

## Вхід
- UTF-8 текст документа (Markdown-подібний), опційно YAML front matter.

## Вихід
- HTML (semantic) + окремі дані для навігації (опційно).

---

## Етапи

### 1) Raw text ingestion
- Прочитати файл.
- Відокремити front matter (якщо є) і контент.

### 2) Normalization
- Уніфікація переносів рядків до `\n`.
- Очищення “невидимих” символів (за списком).
- Нормалізація множинних пробілів (крім code blocks).

### 3) Typography
- Лапки: правила за `lang`.
- Тире: правила заміни `--` на `—` у текстових контекстах.
- Нерозривні пробіли: короткі прийменники/сполучники (налаштований словник).

**Важливо:** typography не застосовується всередині code blocks/inline code.

### 4) Structure inference
- Heading: “короткий рядок + порожній рядок” → H2 (MVP-евристика).
- Lists: `1.` / `-` / `*`.
- Service constructs:
  - `((...))` → Marginalia блок (поза основним потоком).

### 5) Block model
Перетворення у масив блоків:
- Paragraph, Heading, List, Image, Code, Note(Marginalia).

### 6) HTML render
- Рендер кожного блока в HTML.
- Marginalia: виведення у `<aside>` або окремий контейнер для полів.

### 7) Post-processing
- Додавання anchor links до заголовків (опційно).
- Генерація TOC (не MVP).

---

## Детермінізм і тести
- Для кожного етапу — unit tests.
- Для pipeline — golden tests: input → expected HTML.
