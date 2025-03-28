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


  async updateOrInsert(where, newData) {
    // Check if any row matches the where condition
    const existingRows = await this.select(where);
    if (existingRows.length > 0) {
      // If matching rows exist, update them with newData
      return await this.update(where, newData);
    } else {
      // If no matching row, merge where and newData to form a new row and insert it
      const newRow = { ...where, ...newData };
      return await this.insertOne(newRow);
    }
  }

  async insertBeforeRow(where, newData) {
    // Find the first row that matches the where condition
    const matchingRows = await this.select(where);
    if (matchingRows.length === 0) {
      // If no matching row is found, simply insert newData at the end.
      return await this.insertOne(newData);
    }

    // Get the target row number where the matching row is found.
    const targetRow = matchingRows[0];
    const targetRowNumber = targetRow._row; // e.g. if 'Alice' is in row 5, targetRowNumber = 5

    // Retrieve sheet information to perform row insertion
    const metadata = await this.sheets.spreadsheets.get({
      spreadsheetId: this.sheetId,
    });
    const sheetInfo = metadata.data.sheets.find(
      sheet => sheet.properties.title === this.sheetName
    );
    if (!sheetInfo) throw new Error(`Sheet ${this.sheetName} not found`);
    const sheetTabId = sheetInfo.properties.sheetId;

    // Calculate the zero-indexed insertion index (targetRowNumber - 1)
    const insertionIndex = targetRowNumber - 1;

    // Insert a new row at the target index (this pushes the target row down)
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.sheetId,
      requestBody: {
        requests: [
          {
            insertDimension: {
              range: {
                sheetId: sheetTabId,
                dimension: 'ROWS',
                startIndex: insertionIndex,
                endIndex: insertionIndex + 1,
              },
              inheritFromBefore: true,
            },
          },
        ],
      },
    });

    // Get headers and build the new row array
    const headers = await this._getHeaders();
    const newRow = headers.map(h => newData[h] || '');

    // Update the newly inserted row (which now takes the targetRowNumber)
    const range = `${this.sheetName}!A${targetRowNumber}:${String.fromCharCode(65 + headers.length - 1)}${targetRowNumber}`;
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.sheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [newRow] },
    });

    return { success: true, action: 'inserted', row: targetRowNumber, newData };
  }
  async replaceBeforeRow(where, newData) {
    // Find the first row that matches the where condition (e.g., { name: 'Alice' })
    const matchingRows = await this.select(where);
    if (matchingRows.length === 0) {
      // If no matching row is found, just insert the newData at the end.
      return await this.insertOne(newData);
    }
    const targetRow = matchingRows[0];
    let insertRowNumber = targetRow._row; // This is the row where "Alice" is found

    // Get the headers for constructing row arrays
    const headers = await this._getHeaders();

    // If the target row is the first data row (row 2), we cannot update row 1 (the header)
    if (insertRowNumber === 2) {
      // Insert a new row at position 2 (which pushes the target row down)
      const metadata = await this.sheets.spreadsheets.get({ spreadsheetId: this.sheetId });
      const sheetInfo = metadata.data.sheets.find(
        sheet => sheet.properties.title === this.sheetName
      );
      if (!sheetInfo) throw new Error(`Sheet ${this.sheetName} not found`);
      const sheetTabId = sheetInfo.properties.sheetId;

      // Insert one row at index 1 (0-indexed for row 2)
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.sheetId,
        requestBody: {
          requests: [
            {
              insertDimension: {
                range: {
                  sheetId: sheetTabId,
                  dimension: 'ROWS',
                  startIndex: 1,
                  endIndex: 2,
                },
                inheritFromBefore: true,
              },
            },
          ],
        },
      });
      // Update the newly inserted row (row 2) with newData
      const newRow = headers.map(h => newData[h] || '');
      const range = `${this.sheetName}!A2:${String.fromCharCode(65 + headers.length - 1)}2`;
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.sheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [newRow] },
      });
      return { success: true, action: 'inserted', row: 2, newData };
    } else {
      // Determine the row immediately before the target row
      const rowBeforeNumber = insertRowNumber - 1;
      const sheetData = await this._getSheetData();
      const rowBefore = sheetData.find(row => row._row === rowBeforeNumber);

      if (rowBefore) {
        // If a row exists before the target row, update that row with newData.
        const updatedRow = headers.map(h => (newData[h] !== undefined ? newData[h] : rowBefore[h]));
        const range = `${this.sheetName}!A${rowBeforeNumber}:${String.fromCharCode(65 + headers.length - 1)}${rowBeforeNumber}`;
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.sheetId,
          range,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [updatedRow] },
        });
        return { success: true, action: 'updated', row: rowBeforeNumber, newData };
      } else {
        // No row exists immediately before the target row – insert a new row there.
        const metadata = await this.sheets.spreadsheets.get({ spreadsheetId: this.sheetId });
        const sheetInfo = metadata.data.sheets.find(
          sheet => sheet.properties.title === this.sheetName
        );
        if (!sheetInfo) throw new Error(`Sheet ${this.sheetName} not found`);
        const sheetTabId = sheetInfo.properties.sheetId;

        // Insert a new row at the correct position.
        // Note: The API uses zero-indexed indices. To insert before row `rowBeforeNumber`,
        // set startIndex to rowBeforeNumber - 1.
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.sheetId,
          requestBody: {
            requests: [
              {
                insertDimension: {
                  range: {
                    sheetId: sheetTabId,
                    dimension: 'ROWS',
                    startIndex: rowBeforeNumber - 1,
                    endIndex: rowBeforeNumber,
                  },
                  inheritFromBefore: true,
                },
              },
            ],
          },
        });
        // Now update the inserted row with newData.
        const newRow = headers.map(h => newData[h] || '');
        const range = `${this.sheetName}!A${rowBeforeNumber}:${String.fromCharCode(65 + headers.length - 1)}${rowBeforeNumber}`;
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.sheetId,
          range,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [newRow] },
        });
        return { success: true, action: 'inserted', row: rowBeforeNumber, newData };
      }
    }
  }

  async insertAfterRow(where, newData) {
    // Find the first row that matches the where condition
    const matchingRows = await this.select(where);
    if (matchingRows.length === 0) {
      // If no matching row is found, simply insert newData at the end.
      return await this.insertOne(newData);
    }

    // Get the target row number where the matching row is found.
    const targetRow = matchingRows[0];
    const targetRowNumber = targetRow._row; // e.g. if 'Alice' is in row 5, targetRowNumber = 5

    // Retrieve sheet information to perform row insertion
    const metadata = await this.sheets.spreadsheets.get({
      spreadsheetId: this.sheetId,
    });
    const sheetInfo = metadata.data.sheets.find(
      sheet => sheet.properties.title === this.sheetName
    );
    if (!sheetInfo) throw new Error(`Sheet ${this.sheetName} not found`);
    const sheetTabId = sheetInfo.properties.sheetId;

    // Calculate the zero-indexed insertion index.
    // For after insertion, if target row is at one-indexed row X, then we insert at index X
    // so the new row becomes one-indexed row X+1.
    const insertionIndex = targetRowNumber;

    // Insert a new row at the insertion index (this pushes the target row's subsequent rows down)
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.sheetId,
      requestBody: {
        requests: [
          {
            insertDimension: {
              range: {
                sheetId: sheetTabId,
                dimension: 'ROWS',
                startIndex: insertionIndex,
                endIndex: insertionIndex + 1,
              },
              inheritFromBefore: true,
            },
          },
        ],
      },
    });

    // New inserted row number is targetRowNumber + 1
    const newRowNumber = targetRowNumber + 1;

    // Get headers and build the new row array
    const headers = await this._getHeaders();
    const newRow = headers.map(h => newData[h] || '');

    // Update the newly inserted row with newData
    const range = `${this.sheetName}!A${newRowNumber}:${String.fromCharCode(65 + headers.length - 1)}${newRowNumber}`;
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.sheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [newRow] },
    });

    return { success: true, action: 'inserted', row: newRowNumber, newData };
  }

  async updateOrInsertBeforeRow(where, uniqueKey, newData, ignoreEmptyRows = false) {
    // Find the first row that matches the "where" condition.
    const matchingRows = await this.select(where);
    if (matchingRows.length === 0) {
      // If no matching row is found, simply insert newData at the end.
      return await this.insertOne(newData);
    }
    const targetRow = matchingRows[0];
    const targetRowNumber = targetRow._row; // e.g., if the target row is 10

    // Get headers for constructing the row.
    const headers = await this._getHeaders();

    // Ensure newData has the uniqueKey property.
    if (!newData.hasOwnProperty(uniqueKey)) {
      throw new Error(`newData must contain the unique key '${uniqueKey}'`);
    }

    // Retrieve all sheet data.
    const sheetData = await this._getSheetData();
    // Filter for rows above the target row.
    const rowsBefore = sheetData.filter(row => row._row < targetRowNumber);

    // First, check if any row above has the same unique key value.
    const existingRow = rowsBefore.find(row => row[uniqueKey] === newData[uniqueKey]);
    if (existingRow) {
      const rowNumber = existingRow._row;
      const updatedRow = headers.map(h => newData[h] !== undefined ? newData[h] : existingRow[h]);
      const range = `${this.sheetName}!A${rowNumber}:${String.fromCharCode(65 + headers.length - 1)}${rowNumber}`;
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.sheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [updatedRow] },
      });
      return { success: true, action: 'updated', row: rowNumber, newData };
    }

    // If ignoreEmptyRows is true, check for contiguous empty rows immediately above the target row.
    if (ignoreEmptyRows) {
      // Build a map for quick access by row number.
      const rowMap = {};
      sheetData.forEach(row => { rowMap[row._row] = row; });
      let emptyRowCandidate = null;
      // Iterate downward from targetRowNumber - 1 to row 2 (first data row).
      // We want the topmost row in the contiguous empty block.
      for (let r = targetRowNumber - 1; r >= 2; r--) {
        // If the row isn't returned, assume it's empty.
        const rowObj = rowMap[r];
        const isEmpty = rowObj
          ? headers.every(h => !rowObj[h] || rowObj[h] === '')
          : true;
        if (isEmpty) {
          emptyRowCandidate = r; // update candidate with the current (lower) row number
        } else {
          // As soon as we hit a non-empty row, break out.
          break;
        }
      }
      if (emptyRowCandidate !== null) {
        // Update the empty row found (i.e. the row immediately after the last non-empty row).
        const rowNumber = emptyRowCandidate;
        const updatedRow = headers.map(h => newData[h] !== undefined ? newData[h] : '');
        const range = `${this.sheetName}!A${rowNumber}:${String.fromCharCode(65 + headers.length - 1)}${rowNumber}`;
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.sheetId,
          range,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [updatedRow] },
        });
        return { success: true, action: 'updated (empty row)', row: rowNumber, newData };
      }
    }

    // If no existing row or empty row is found, insert a new row before the target row.
    const metadata = await this.sheets.spreadsheets.get({ spreadsheetId: this.sheetId });
    const sheetInfo = metadata.data.sheets.find(sheet => sheet.properties.title === this.sheetName);
    if (!sheetInfo) throw new Error(`Sheet ${this.sheetName} not found`);
    const sheetTabId = sheetInfo.properties.sheetId;

    // Calculate the zero-indexed insertion index (targetRowNumber - 1).
    const insertionIndex = targetRowNumber - 1;
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.sheetId,
      requestBody: {
        requests: [{
          insertDimension: {
            range: {
              sheetId: sheetTabId,
              dimension: 'ROWS',
              startIndex: insertionIndex,
              endIndex: insertionIndex + 1,
            },
            inheritFromBefore: true,
          },
        }],
      },
    });

    // After insertion, the new row occupies the targetRowNumber.
    const newRowNumber = targetRowNumber;
    const newRow = headers.map(h => newData[h] || '');
    const range = `${this.sheetName}!A${newRowNumber}:${String.fromCharCode(65 + headers.length - 1)}${newRowNumber}`;
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.sheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [newRow] },
    });
    return { success: true, action: 'inserted', row: newRowNumber, newData };
  }



  async updateOrInsertAfterRow(where, uniqueKey, newData) {
    // Find the first row that matches the "where" condition.
    const matchingRows = await this.select(where);
    if (matchingRows.length === 0) {
      // If no matching row is found, insert newData at the end.
      return await this.insertOne(newData);
    }
    const targetRow = matchingRows[0];
    const targetRowNumber = targetRow._row; // e.g. if the target row is 5

    // Get headers for constructing the row.
    const headers = await this._getHeaders();

    // Ensure newData has the uniqueKey property.
    if (!newData.hasOwnProperty(uniqueKey)) {
      throw new Error(`newData must contain the unique key '${uniqueKey}'`);
    }

    // Retrieve all sheet data and filter for rows after the target row.
    const sheetData = await this._getSheetData();
    const rowsAfter = sheetData.filter(row => row._row > targetRowNumber);

    // Look for a row among those after that has the same unique key value.
    const existingRow = rowsAfter.find(row => row[uniqueKey] === newData[uniqueKey]);

    if (existingRow) {
      // Update the existing row with newData.
      const rowNumber = existingRow._row;
      const updatedRow = headers.map(h => newData[h] !== undefined ? newData[h] : existingRow[h]);
      const range = `${this.sheetName}!A${rowNumber}:${String.fromCharCode(65 + headers.length - 1)}${rowNumber}`;
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.sheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [updatedRow] },
      });
      return { success: true, action: 'updated', row: rowNumber, newData };
    } else {
      // Otherwise, insert a new row after the target row.
      const metadata = await this.sheets.spreadsheets.get({ spreadsheetId: this.sheetId });
      const sheetInfo = metadata.data.sheets.find(sheet => sheet.properties.title === this.sheetName);
      if (!sheetInfo) throw new Error(`Sheet ${this.sheetName} not found`);
      const sheetTabId = sheetInfo.properties.sheetId;

      // For after insertion, the zero-indexed insertion index is the targetRowNumber.
      const insertionIndex = targetRowNumber;
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.sheetId,
        requestBody: {
          requests: [{
            insertDimension: {
              range: {
                sheetId: sheetTabId,
                dimension: 'ROWS',
                startIndex: insertionIndex,
                endIndex: insertionIndex + 1,
              },
              inheritFromBefore: true,
            },
          }],
        },
      });

      // After insertion, the new row occupies targetRowNumber + 1.
      const newRowNumber = targetRowNumber + 1;
      const newRow = headers.map(h => newData[h] || '');
      const range = `${this.sheetName}!A${newRowNumber}:${String.fromCharCode(65 + headers.length - 1)}${newRowNumber}`;
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.sheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [newRow] },
      });
      return { success: true, action: 'inserted', row: newRowNumber, newData };
    }
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