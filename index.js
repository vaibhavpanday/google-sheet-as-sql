const { google } = require('googleapis');

class GoogleSheetDB {
  constructor(credentials, sheetId, sheetName) {
    if (!credentials) throw new Error('Missing Google credentials JSON');

    this.sheetId = sheetId;
    this.sheetName = sheetName;

    this.auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
  }
  async _getHeaders() {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.sheetId,
      range: `${this.sheetName}!1:1`,
    });
    return res.data.values[0];
  }

  async _getSheetData() {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.sheetId,
      range: this.sheetName,
    });

    const rows = res.data.values || [];
    if (rows.length === 0) return [];

    const headers = rows[0];
    return rows.slice(1).map((row, i) => {
      const obj = {};
      headers.forEach((key, j) => {
        obj[key] = row[j] || '';
      });
      obj._row = i + 2;
      return obj;
    });
  }

  _parseValue(value, isDate) {
    if (isDate) return new Date(value).getTime();
    if (!isNaN(value)) return parseFloat(value);
    return value.toString().toLowerCase();
  }

  _applyFilter(data, where) {
    return data.filter(row => {
      return Object.entries(where).every(([key, condition]) => {
        const rowVal = row[key] || '';
        const isDate = key.toLowerCase().includes('date');

        if (typeof condition === 'object' && condition !== null) {
          const { op, value } = condition;
          const a = this._parseValue(rowVal, isDate);
          const b = this._parseValue(value, isDate);

          switch (op) {
            case '>': return a > b;
            case '<': return a < b;
            case '>=': return a >= b;
            case '<=': return a <= b;
            case '!=': return a != b;
            case '=': return a == b;
            case 'contains': return rowVal.toLowerCase().includes(String(value).toLowerCase());
            default: return false;
          }
        } else {
          return rowVal == condition;
        }
      });
    });
  }

  _applySorting(data, orderBy = []) {
    return data.sort((a, b) => {
      for (let { column, direction } of orderBy) {
        const isDate = column.toLowerCase().includes('date');
        const valA = this._parseValue(a[column], isDate);
        const valB = this._parseValue(b[column], isDate);
        if (valA < valB) return direction === 'desc' ? 1 : -1;
        if (valA > valB) return direction === 'desc' ? -1 : 1;
      }
      return 0;
    });
  }

  _applySelectFields(data, fields) {
    return data.map(row => {
      const newObj = {};
      fields.forEach(f => newObj[f] = row[f]);
      return newObj;
    });
  }

  async createTable(columns = []) {
    if (!columns || !Array.isArray(columns) || columns.length === 0) {
      throw new Error('You must pass an array of column names');
    }

    try {
      // Check if sheet already exists
      const metadata = await this.sheets.spreadsheets.get({
        spreadsheetId: this.sheetId,
      });

      const existingSheet = metadata.data.sheets.find(
        sheet => sheet.properties.title === this.sheetName
      );

      // If sheet does not exist, create it
      if (!existingSheet) {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.sheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: this.sheetName,
                  },
                },
              },
            ],
          },
        });
        console.log(`Sheet "${this.sheetName}" created.`);
      } else {
        console.log(`Sheet "${this.sheetName}" already exists.`);
      }

      // Write headers to row 1
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.sheetId,
        range: `${this.sheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [columns],
        },
      });

      return {
        success: true,
        message: 'Table created with headers.',
        columns,
      };
    } catch (err) {
      console.error('Error in createTable():', err.message);
      return { success: false, error: err.message };
    }
  }

  async select(where = {}, options = {}) {
    let data = await this._getSheetData();
    data = this._applyFilter(data, where);

    if (options.orderBy) data = this._applySorting(data, options.orderBy);
    if (options.offset) data = data.slice(options.offset);
    if (options.limit) data = data.slice(0, options.limit);
    if (options.selectFields) data = this._applySelectFields(data, options.selectFields);

    return data;
  }

  async insertOne(rowObj) {
    const headers = await this._getHeaders();
    const row = headers.map(h => rowObj[h] || '');

    const res = await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.sheetId,
      range: this.sheetName,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [row] },
    });

    return {
      success: true,
      updatedRange: res.data.updates.updatedRange,
      insertedData: rowObj,
    };
  }
  async insertMany(data) {
    const headers = await this._getHeaders();
    const rows = [];

    const dataArray = Array.isArray(data) ? data : [data];

    for (const rowObj of dataArray) {
      const row = headers.map(h => rowObj[h] || '');
      rows.push(row);
    }

    const res = await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.sheetId,
      range: this.sheetName,
      valueInputOption: 'USER_ENTERED',
      resource: { values: rows },
    });

    return {
      success: true,
      insertedCount: rows.length,
      updatedRange: res.data.updates.updatedRange,
      insertedData: dataArray,
    };
  }


  async update(where, newData) {
    const data = await this._getSheetData();
    const headers = Object.keys(data[0] || {}).filter(h => h !== '_row');

    const matching = this._applyFilter(data, where);
    const updated = [];

    for (const row of matching) {
      const updatedRow = headers.map(h => newData[h] ?? row[h]);
      const range = `${this.sheetName}!A${row._row}:${String.fromCharCode(65 + headers.length - 1)}${row._row}`;

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.sheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [updatedRow] },
      });

      updated.push({ row: row._row, newData: updatedRow });
    }

    return {
      success: true,
      updatedCount: updated.length,
      updatedRows: updated,
    };
  }

  async delete(where) {
    const data = await this._getSheetData();
    const matching = this._applyFilter(data, where);

    const deleted = [];

    for (const row of matching) {
      const range = `${this.sheetName}!A${row._row}:${String.fromCharCode(65 + Object.keys(row).length - 2)}${row._row}`;
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: this.sheetId,
        range,
      });
      deleted.push(row._row);
    }

    return {
      success: true,
      deletedCount: deleted.length,
      deletedRows: deleted,
    };
  }

  // Drop the entire sheet tab
  async dropTable() {
    try {
      const metadata = await this.sheets.spreadsheets.get({
        spreadsheetId: this.sheetId,
      });

      const sheet = metadata.data.sheets.find(
        sheet => sheet.properties.title === this.sheetName
      );

      if (!sheet) {
        return { success: false, message: 'Sheet not found' };
      }

      const sheetId = sheet.properties.sheetId;

      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.sheetId,
        requestBody: {
          requests: [
            {
              deleteSheet: {
                sheetId,
              },
            },
          ],
        },
      });

      return { success: true, message: `Sheet "${this.sheetName}" dropped.` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Truncate: Clear all rows except the header
  async truncateTable() {
    try {
      // Clear everything except header row (row 1)
      const headers = await this._getHeaders();
      const range = `${this.sheetName}!A2:Z1000`; // adjust range if needed

      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: this.sheetId,
        range,
      });

      return {
        success: true,
        message: `Table "${this.sheetName}" truncated (data cleared, headers kept).`,
        headers,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  // List all sheet/tab names
  async getTables() {
    try {
      const metadata = await this.sheets.spreadsheets.get({
        spreadsheetId: this.sheetId,
      });

      const sheetNames = metadata.data.sheets.map(
        sheet => sheet.properties.title
      );

      return {
        success: true,
        tables: sheetNames,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Show details of the current table (tab)
  async showTableDetail() {
    try {

      const headers = await this._getHeaders();
      return {
        success: true,
        sheetName: this.sheetName,
        columns: headers,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

}

module.exports = GoogleSheetDB;