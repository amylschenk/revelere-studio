import { list, put } from '@vercel/blob';
import { google } from 'googleapis';

const FOLDER_ID   = '1lAWwZEDZ_z4MGejUU9_8TgWKW-0heumC';
const SHEET_TITLE = 'Design Budget Tracker';
const SHARE_EMAIL = 'karl@ecobryt.com';
const META_PATH   = 'revelere/budget-tracker-meta.json';
const TAB_NAME    = 'Budget Tracker';
const NUM_COLS    = 6;

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

// ── Auth ──────────────────────────────────────────────────────────
function getAuth() {
  const creds = JSON.parse(
    Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON, 'base64').toString('utf-8')
  );
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
}

// ── Find or create the spreadsheet ───────────────────────────────
async function getOrCreateSheet(auth) {
  const drive  = google.drive({ version: 'v3', auth });
  const sheets = google.sheets({ version: 'v4', auth });

  // Try cached sheet ID first
  try {
    const { blobs } = await list({ prefix: 'revelere/budget-tracker-meta' });
    const found = blobs.find(b => b.pathname === META_PATH);
    if (found) {
      const r = await fetch(found.url + '?t=' + Date.now());
      if (r.ok) {
        const { sheetId } = await r.json();
        if (sheetId) {
          try {
            await sheets.spreadsheets.get({ spreadsheetId: sheetId });
            return sheetId;
          } catch {
            // Sheet was deleted — fall through to create
          }
        }
      }
    }
  } catch { /* first run */ }

  // Create new spreadsheet
  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: SHEET_TITLE },
      sheets: [{ properties: { title: TAB_NAME } }],
    },
  });
  const sheetId = created.data.spreadsheetId;

  // Move into the Revelere shared folder
  const file = await drive.files.get({ fileId: sheetId, fields: 'parents' });
  await drive.files.update({
    fileId: sheetId,
    addParents: FOLDER_ID,
    removeParents: (file.data.parents || []).join(','),
    fields: 'id,parents',
  });

  // Share with Karl
  await drive.permissions.create({
    fileId: sheetId,
    sendNotificationEmail: false,
    requestBody: { role: 'writer', type: 'user', emailAddress: SHARE_EMAIL },
  });

  // Cache the ID
  await put(META_PATH, JSON.stringify({ sheetId }), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  return sheetId;
}

// ── Write data + formatting ───────────────────────────────────────
async function updateSheet(items) {
  const auth    = await getAuth();
  const sheets  = google.sheets({ version: 'v4', auth });
  const sheetId = await getOrCreateSheet(auth);

  const now = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });

  const dataRows = items.map(item => [
    item.room      || '',
    item.name      || '',
    item.price     != null ? `$${Number(item.price).toLocaleString()}` : '',
    item.ordered   ? 'Yes' : 'No',
    item.orderDate || '',
    item.actualCost != null && item.actualCost !== ''
      ? `$${Number(item.actualCost).toLocaleString()}`
      : '',
  ]);

  // Values: 4 header rows + 1 column header row + data
  const values = [
    ['REVELERE', '', '', '', '', ''],
    ['Design Budget Tracker', '', '', '', '', ''],
    [`Last updated: ${now}`, '', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['Room', 'Item Name', 'Est. Price', 'Ordered', 'Date Ordered', 'Actual Cost'],
    ...dataRows,
  ];

  // Clear then write values
  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetId,
    range: TAB_NAME,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${TAB_NAME}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });

  // Get tab's internal sheetId for formatting
  const meta  = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const tabId = meta.data.sheets[0].properties.sheetId;

  // ── Color palette ──────────────────────────────────────────────
  const C = {
    charcoal:   { red: 0.106, green: 0.106, blue: 0.106 }, // #1B1B1B
    white:      { red: 1,     green: 1,     blue: 1     },
    taupe:      { red: 0.839, green: 0.784, blue: 0.702 }, // #D6C8B3
    linen:      { red: 0.980, green: 0.969, blue: 0.957 }, // #FAF7F4
    linenlite:  { red: 1,     green: 0.996, blue: 0.992 }, // ~white
    muted:      { red: 0.541, green: 0.494, blue: 0.439 }, // #8A7E70
    greenTint:  { red: 0.941, green: 0.961, blue: 0.941 }, // soft green for ordered
  };

  const requests = [
    // ── Merge branding rows ────────────────────────────────────
    ...([0, 1, 2, 3].map(r => ({
      mergeCells: {
        range: { sheetId: tabId, startRowIndex: r, endRowIndex: r + 1,
                 startColumnIndex: 0, endColumnIndex: NUM_COLS },
        mergeType: 'MERGE_ALL',
      },
    }))),

    // ── Row: REVELERE title ────────────────────────────────────
    {
      repeatCell: {
        range: { sheetId: tabId, startRowIndex: 0, endRowIndex: 1,
                 startColumnIndex: 0, endColumnIndex: NUM_COLS },
        cell: { userEnteredFormat: {
          backgroundColor: C.charcoal,
          textFormat: {
            foregroundColor: C.white,
            fontFamily: 'Cormorant Garamond',
            fontSize: 26, bold: true,
          },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
        }},
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
      },
    },

    // ── Row: subtitle ─────────────────────────────────────────
    {
      repeatCell: {
        range: { sheetId: tabId, startRowIndex: 1, endRowIndex: 2,
                 startColumnIndex: 0, endColumnIndex: NUM_COLS },
        cell: { userEnteredFormat: {
          backgroundColor: C.charcoal,
          textFormat: {
            foregroundColor: C.taupe,
            fontFamily: 'DM Sans',
            fontSize: 11, italic: true,
          },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
        }},
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
      },
    },

    // ── Row: last updated ──────────────────────────────────────
    {
      repeatCell: {
        range: { sheetId: tabId, startRowIndex: 2, endRowIndex: 3,
                 startColumnIndex: 0, endColumnIndex: NUM_COLS },
        cell: { userEnteredFormat: {
          backgroundColor: C.linen,
          textFormat: {
            foregroundColor: C.muted,
            fontFamily: 'DM Sans',
            fontSize: 9, italic: true,
          },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
        }},
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
      },
    },

    // ── Row: column headers ────────────────────────────────────
    {
      repeatCell: {
        range: { sheetId: tabId, startRowIndex: 4, endRowIndex: 5,
                 startColumnIndex: 0, endColumnIndex: NUM_COLS },
        cell: { userEnteredFormat: {
          backgroundColor: C.charcoal,
          textFormat: {
            foregroundColor: C.white,
            fontFamily: 'DM Sans',
            fontSize: 9, bold: true,
          },
          horizontalAlignment: 'LEFT',
          verticalAlignment: 'MIDDLE',
        }},
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
      },
    },

    // ── Bottom border under column headers ─────────────────────
    {
      updateBorders: {
        range: { sheetId: tabId, startRowIndex: 4, endRowIndex: 5,
                 startColumnIndex: 0, endColumnIndex: NUM_COLS },
        bottom: { style: 'SOLID_MEDIUM', color: C.charcoal },
      },
    },

    // ── Freeze first 5 rows ────────────────────────────────────
    {
      updateSheetProperties: {
        properties: { sheetId: tabId, gridProperties: { frozenRowCount: 5 } },
        fields: 'gridProperties.frozenRowCount',
      },
    },

    // ── Row heights ────────────────────────────────────────────
    { updateDimensionProperties: {
        range: { sheetId: tabId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 64 }, fields: 'pixelSize',
    }},
    { updateDimensionProperties: {
        range: { sheetId: tabId, dimension: 'ROWS', startIndex: 1, endIndex: 2 },
        properties: { pixelSize: 32 }, fields: 'pixelSize',
    }},
    { updateDimensionProperties: {
        range: { sheetId: tabId, dimension: 'ROWS', startIndex: 2, endIndex: 3 },
        properties: { pixelSize: 24 }, fields: 'pixelSize',
    }},
    { updateDimensionProperties: {
        range: { sheetId: tabId, dimension: 'ROWS', startIndex: 4, endIndex: 5 },
        properties: { pixelSize: 28 }, fields: 'pixelSize',
    }},

    // ── Column widths ──────────────────────────────────────────
    ...[160, 260, 90, 80, 120, 110].map((px, i) => ({
      updateDimensionProperties: {
        range: { sheetId: tabId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: px }, fields: 'pixelSize',
      },
    })),
  ];

  // ── Data row formatting (alternating linen/white + green if ordered) ──
  for (let i = 0; i < dataRows.length; i++) {
    const rowIndex  = 5 + i;
    const isOrdered = dataRows[i][3] === 'Yes';
    const bg = isOrdered ? C.greenTint : (i % 2 === 0 ? C.linenlite : C.linen);

    requests.push({
      repeatCell: {
        range: { sheetId: tabId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1,
                 startColumnIndex: 0, endColumnIndex: NUM_COLS },
        cell: { userEnteredFormat: {
          backgroundColor: bg,
          textFormat: { foregroundColor: C.charcoal, fontFamily: 'DM Sans', fontSize: 10 },
          verticalAlignment: 'MIDDLE',
        }},
        fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)',
      },
    });

    // Right-align Est. Price and Actual Cost columns
    for (const col of [2, 5]) {
      requests.push({
        repeatCell: {
          range: { sheetId: tabId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1,
                   startColumnIndex: col, endColumnIndex: col + 1 },
          cell: { userEnteredFormat: { horizontalAlignment: 'RIGHT' } },
          fields: 'userEnteredFormat(horizontalAlignment)',
        },
      });
    }
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: { requests },
  });

  return sheetId;
}

// ── Extract sourcing from manifest ────────────────────────────────
async function itemsFromManifest() {
  const { blobs } = await list({ prefix: 'revelere/manifest' });
  const found = blobs.find(b => b.pathname === 'revelere/manifest.json');
  if (!found) return [];

  const r = await fetch(found.url + '?t=' + Date.now());
  if (!r.ok) return [];
  const manifest = await r.json();

  const items = [];
  const rooms   = manifest.rooms   || [];
  const sourcing = manifest.sourcing || {};

  for (const room of rooms) {
    for (const item of (sourcing[room.id] || [])) {
      if (item.status === 'rejected') continue;
      items.push({
        room:       room.name,
        name:       item.name      || '',
        price:      item.price     ?? null,
        ordered:    item.ordered   || false,
        orderDate:  item.orderDate || '',
        actualCost: item.actualCost ?? '',
      });
    }
  }
  return items;
}

// ── Handler ───────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return res.status(500).json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON env var not set' });
  }

  try {
    let items;

    if (req.method === 'POST') {
      items = req.body?.items;
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: 'Expected { items: [...] }' });
      }

    } else if (req.method === 'GET') {
      // Cron path — verify Vercel cron secret if set
      const cronSecret = process.env.CRON_SECRET;
      if (cronSecret) {
        const auth = req.headers['authorization'];
        if (auth !== `Bearer ${cronSecret}`) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
      }
      items = await itemsFromManifest();

    } else {
      return res.status(405).end();
    }

    const sheetId = await updateSheet(items);
    return res.status(200).json({ ok: true, sheetId });

  } catch (e) {
    console.error('[budget-tracker]', e);
    return res.status(500).json({ error: e.message });
  }
}
