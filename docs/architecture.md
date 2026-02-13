# Architecture (v0)

## 1. Огляд

Архітектура будується навколо **файлів як джерела істини** та **детермінованого pipeline** перетворення тексту.

**Ключовий принцип:** текст → перетворення → блок-модель → HTML.

---

## 2. Компоненти

### 2.1 Editor UI
- Мінімальний редактор (textarea/CodeMirror).
- Підтримка drag&drop для asset’ів.
- Підписка на зміни (events/transactions).

### 2.2 Storage Layer (File Storage)
- API: `readDocument(slug)`, `writeDocument(slug, content, meta)`, `writeAsset(...)`.
- Політика автозбереження: debounce + recovery log.
- Директорії: `content/`, `assets/`, `index/` (опційно).

### 2.3 Parser/Transformer Pipeline
Послідовність (обов’язково документується і тестується):

1) **Raw text** — як ввів автор  
2) **Normalization** — нормалізація переносів рядків, пробілів, кодування  
3) **Typography** — правила лапок/тире/нерозривних пробілів  
4) **Structure inference** — заголовки/списки/службові блоки  
5) **Block model** — внутрішнє AST-подібне представлення  
6) **HTML renderer** — генерація HTML  
7) **Theme layer** — CSS/шаблон

### 2.4 Indexer
- Будує індекс документів для навігації (список, теги, дати).
- У MVP — без embeddings, лише метадані + прості евристики.

### 2.5 Web/Viewer
- Роутинг: `/` (index), `/:slug` (document).
- “related/next” — на основі індексу.

---

## 3. Потоки даних

### 3.1 Редагування
Editor → (debounced) Storage.writeDocument → Indexer.update → Preview.render

### 3.2 Перегляд
Storage.readDocument → Pipeline → HTML → Viewer

---

## 4. Точки розширення (після MVP)

- Semantic stitching: embeddings + ANN-індекс (HNSW/FAISS) замість простих правил.
- Infinite narrative: інтерфейс читання з “проявленням” наступного документа.
- Block plugins: `/chart`, `/gallery`, `/code` з параметрами.
