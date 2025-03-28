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
- 📝 **SQL Query Feature**: Use SQL‑like queries via `query()` (replacing the old `exec()`)

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

// Initialize with: credentials, sheetId, and sheetName (tab name)
const db = new GoogleSheetDB(credentials, 'your-spreadsheet-id', 'Sheet1');

(async () => {
  await db.createTable(['name', 'email', 'age', 'created_at']);

  await db.insertMany([
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

- **credentials**: JSON object from your service account  
- **sheetId**: The ID from the Google Sheets URL  
- **sheetName**: Name of the tab/sheet (e.g. "Sheet1")

---

### ✅ Core Methods

| Method                                  | Description                                           |
|-----------------------------------------|-------------------------------------------------------|
| `createTable(columns)`                  | Creates the sheet/tab and sets headers                |
| `dropTable()`                           | Deletes the sheet/tab entirely                        |
| `truncateTable()`                       | Clears all data, keeps header row                     |
| `insertOne(obj)`                        | Inserts a single row                                  |
| `insertBeforeRow(where, data)`          | Inserts a single row before matches                   |
| `insertAfterRow(where, data)`           | Inserts a single row after matches                    |
| `replaceBeforeRow(where, data)`         | Replaces the row before matches                       |
| `insertMany(arrayy)`                    | Inserts array of rows                                 |
| `select(where, options)`                | Reads rows with filtering, sorting, limits            |
| `update(where, newData)`                | Updates rows matching filters                         |
| `updateOrInsert(where, data)`           | Updates if exists otherwise insert rows               |
| `delete(where)`                         | Deletes rows matching filters                         |
| `getTables()`                           | Lists all sheet tabs                                  |
| `showTableDetail()`                     | Returns column names, total rows, preview row         |

#### Two additional update/insert features

- `updateOrInsertAfterRow(where, column, data)` : Update/insert after matches  
- `updateOrInsertBeforeRow(where, column, data, ignoreEmptyRows = false)` : Update/insert before matches

---

## 📝 SQL Query Feature

The `query` method allows you to run SQL‑like queries on your Google Sheet. This feature parses your query and translates it into the appropriate method call. (Note: The previous `exec` method has been replaced with `query`.)

### Supported SQL‑like Commands

- **CREATE TABLE**  
  Create a new sheet/tab and set headers.

- **DROP TABLE**  
  Delete the sheet/tab entirely.

- **TRUNCATE TABLE**  
  Clear all data (except headers).

- **INSERT INTO**  
  Insert a single row.  
  **Example SQL:**  
  ```sql
  INSERT INTO sheetId (id, name, age) VALUES ('1', 'Alice', '25')
  ```

- **SELECT**  
  Read rows with optional filtering, sorting, LIMIT, and OFFSET.  
  **Example SQL:**  
  ```sql
  SELECT * FROM sheetId WHERE name = 'Alice' ORDER BY age DESC LIMIT 5 OFFSET 0
  ```

- **UPDATE**  
  Update rows matching a condition.  
  **Example SQL:**  
  ```sql
  UPDATE sheetId SET name = 'Bob' WHERE id = '1'
  ```

- **DELETE**  
  Delete rows based on a condition.  
  **Example SQL:**  
  ```sql
  DELETE FROM sheetId WHERE id = '1'
  ```

- **GET TABLES**  
  List all sheet tabs.  
  **Example SQL:**  
  ```sql
  GET TABLES
  ```

- **SHOW TABLE DETAIL**  
  Display sheet details including header information.  
  **Example SQL:**  
  ```sql
  SHOW TABLE DETAIL
  ```

### Example Usage with `query`

Below are detailed examples using the `query` method. In these SQL queries, the keyword `sheetId` is used to reference the target sheet.

#### 1. Creating a Table

```js
const sql = "CREATE TABLE sheetId (id, name, age)";
const createResult = await db.query(sql);
console.log(createResult);
```

*Expected Output:*
```js
{
  success: true,
  message: 'Table created with headers.',
  columns: [ 'id', 'name', 'age' ]
}
```

#### 2. Inserting a Row

```js
const sql = "INSERT INTO sheetId (id, name, age) VALUES ('1', 'Alice', '25')";
const insertResult = await db.query(sql);
console.log(insertResult);
```

*Expected Output:*
```js
{
  success: true,
  updatedRange: 'Sheet1!A2:C2', // or the adjusted range based on headerStartColumn
  insertedData: { id: '1', name: 'Alice', age: '25' }
}
```

#### 3. Selecting Rows

```js
const sql = "SELECT * FROM sheetId WHERE name = 'Alice' ORDER BY age DESC LIMIT 5 OFFSET 0";
const selectResult = await db.query(sql);
console.log(selectResult);
```

*Expected Output:*
```js
[
  { id: '1', name: 'Alice', age: '25', _row: 2 },
  // ... other matching rows
]
```

#### 4. Updating Rows

```js
const sql = "UPDATE sheetId SET name = 'Bob' WHERE id = '1'";
const updateResult = await db.query(sql);
console.log(updateResult);
```

*Expected Output:*
```js
{
  success: true,
  updatedCount: 1,
  updatedRows: [ { row: 2, newData: [ '1', 'Bob', '25' ] } ]
}
```

#### 5. Deleting Rows

```js
const sql = "DELETE FROM sheetId WHERE id = '1'";
const deleteResult = await db.query(sql);
console.log(deleteResult);
```

*Expected Output:*
```js
{ success: true, deletedCount: 1, deletedRows: [2] }
```

#### 6. Listing Tables

```js
const sql = "GET TABLES";
const tablesResult = await db.query(sql);
console.log(tablesResult);
```

*Expected Output:*
```js
{ success: true, tables: [ 'Sheet1', 'OtherSheet' ] }
```

#### 7. Showing Table Details

```js
const sql = "SHOW TABLE DETAIL";
const detailResult = await db.query(sql);
console.log(detailResult);
```

*Expected Output:*
```js
{ success: true, sheetName: 'Sheet1', columns: ['id', 'name', 'age'] }
```

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
  { name: 'Charlie', age: '28', email: 'charlie@example.com' }
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
  sheetName: 'Sheet1',
  columns: ['id', 'name', 'age']
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