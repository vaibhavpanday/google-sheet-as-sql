# 🧮 google-sheet-as-sql

[![npm version](https://img.shields.io/npm/v/google-sheet-as-sql.svg)](https://www.npmjs.com/package/google-sheet-as-sql)
[![npm downloads](https://img.shields.io/npm/dm/google-sheet-as-sql.svg)](https://www.npmjs.com/package/google-sheet-as-sql)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Use **Google Sheets like a SQL database** in Node.js.  
Perform full **CRUD** operations, advanced filtering, sorting, and more — all via the official Google Sheets API.

> Ideal for lightweight data storage, noSQL-style backends, automation, low-code tools, or power users!

---

## ✨ Features

- ✅ Easy setup with Google credentials
- ✅ Full CRUD: `select`, `insert`, `update`, `delete`
- 🔍 Advanced filters: `>`, `<`, `=`, `!=`, `contains`
- 📅 Smart date comparisons
- 📊 ORDER BY, LIMIT, OFFSET
- 🪰 Table tools: `createTable`, `dropTable`, `truncateTable`, `getTables`, `showTableDetail`
- 📦 Lightweight, no database engine required

---

## 📆 Installation

```bash
npm install google-sheet-as-sql
```

---

## 🔐 Google Sheets API Setup

To use this package, you’ll need to set up Google Sheets API credentials:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Navigate to **APIs & Services > Library**
4. Search for and enable **Google Sheets API**
5. Navigate to **APIs & Services > Credentials**
6. Click **"Create Credentials" → "Service Account"**
7. After creating it, go to **"Keys"**, and click **"Add Key" → "JSON"**
8. Save the downloaded file as `credentials.json` in your project
9. Open your target Google Sheet and click **Share**
10. Paste your service account email (something like `your-service-account@your-project.iam.gserviceaccount.com`) and give **Editor** access

You’re ready to roll! 🎉

---

## 🚀 Quick Start

```js
const GoogleSheetDB = require('google-sheet-as-sql');
const credentials = require('./credentials.json');

const db = new GoogleSheetDB(credentials, 'your-spreadsheet-id', 'Sheet1');

(async () => {
  await db.createTable(['name', 'email', 'age', 'created_at']);

  await db.insert([
    { name: 'Alice', email: 'alice@example.com', age: '25', created_at: '2024-03-01' },
    { name: 'Bob', email: 'bob@example.com', age: '30', created_at: '2024-03-15' }
  ]);

  const result = await db.select(
    { age: { op: '>', value: 25 } },
    {
      orderBy: [{ column: 'created_at', direction: 'desc' }],
      limit: 5
    }
  );

  console.log(result);
})();
```

---

## 🧠 API Overview

### 📄 Initialization

```js
new GoogleSheetDB(credentials, sheetId, sheetName)
```

- `credentials`: JSON object from your service account
- `sheetId`: The ID from the Google Sheets URL
- `sheetName`: Name of the tab/sheet (e.g. "Sheet1")

---

### ✅ Core Methods

| Method                  | Description                                          |
|-------------------------        |------------------------------------------------------|
| `createTable(columns)`          | Creates the sheet/tab and sets headers               |
| `dropTable()`                   | Deletes the sheet/tab entirely                       |
| `truncateTable()`               | Clears all data, keeps header row                    |
| `insertOne(obj)`                | Inserts a single row                                 |
| `insertBeforeRow(where, data)`  | Inserts a single row before matches                  |
| `insertAfterRow(where, data)`   | Inserts a single row after matches                   |
| `replaceBeforeRow(where, data)` | Replaces the row before matches                      |
| `insertMany(arrayy)`            | Inserts array of rows                                |
| `select(where, options)`        | Reads rows with filtering, sorting, limits           |
| `update(where, newData)`        | Updates rows matching filters                        |
| `updateOrInsert(where, data)`   | Updates if exist otherwise insert rows               |
| `delete(where)`                 | Deletes rows matching filters                        |
| `getTables()`                   | Lists all sheet tabs                                 |
| `showTableDetail()`             | Returns column names, total rows, preview row        |

## Two additional update/insert features

`updateOrInsertAfterRow(where, column, data)` : Update/insert after matchs
`updateOrInsertBeforeRow(where, column, data, ignoreEmptyRows = false)` : Update/insert before matchs 


---

## 🔍 Filters (WHERE)

Use exact match or advanced filters with operators.

### Basic filter:

```js
await db.select({ name: 'Alice' });
```

### Advanced filter:

```js
await db.select({
  age: { op: '>=', value: 25 },
  name: { op: 'contains', value: 'li' }
});
```

### Supported Operators:

| Operator   | Description             |
|------------|-------------------------|
| `=`        | Equal                   |
| `!=`       | Not Equal               |
| `>`        | Greater Than            |
| `<`        | Less Than               |
| `>=`       | Greater Than or Equal   |
| `<=`       | Less Than or Equal      |
| `contains` | Case-insensitive match  |

---

## 📊 Sorting, Limit, Offset

```js
await db.select(
  {},
  {
    orderBy: [
      { column: 'created_at', direction: 'desc' },
      { column: 'name', direction: 'asc' }
    ],
    limit: 10,
    offset: 5
  }
);
```

---

## 🔄 Inserting Rows

```js
await db.insertOne(
  { name: 'Charlie', age: '28', email: 'charlie@example.com' },
);

await db.insertMany([
  { name: 'Charlie', age: '28', email: 'charlie@example.com' },
  { name: 'Diana', age: '32', email: 'diana@example.com' }
]);
```

---

## 🩹 Truncate Table

Clear all data except the header:

```js
await db.truncateTable();
```

---

## 🔥 Drop Table

Delete the entire sheet/tab:

```js
await db.dropTable();
```

---

## 📋 Get Tables

List all tabs (sheet names) in the spreadsheet:

```js
const tables = await db.getTables();
console.log(tables.tables);
```

---

## 📌 Show Table Details

```js
const detail = await db.showTableDetail();
console.log(detail);
/*
{
  sheetName: 'customers',
  columns: ['name', 'email', 'age'],
}
*/
```

---

## 💡 Pro Tips

- Headers must match exactly (case-sensitive)
- Empty cells are returned as empty strings (`''`)
- Best for light-to-medium data use (<10k rows)

---

## 🛡 License

MIT

---

## 👨‍💼 Author

Made with ❤️ by Vaibhav Panday

> Want to contribute? PRs and issues welcome!

💖 If you find this project useful, consider [buying me a coffee](https://buymeacoffee.com/vaibhavpanday).

