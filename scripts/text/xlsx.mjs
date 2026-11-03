// A small .xlsx writer and reader for the reviewer's spreadsheet (scripts/text-export.mjs, scripts/text-import.mjs).
// No dependency: an .xlsx file is a ZIP of XML parts, and Node has deflate and CRC-32 built in. The writer makes one
// sheet per tab with a frozen, filtered header row, column widths, wrapped text, read-only columns shaded grey, the
// reviewer's columns shaded yellow, and a drop-down list where asked. The reader accepts what Excel, Google Sheets and
// Numbers save back: shared or inline strings, rich text runs, and empty cells left out.
import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

// --- ZIP ------------------------------------------------------------------------------------------------------------

/** entries: [{ name, data: Buffer }] → a ZIP archive (deflated). */
export function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const packed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, packed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc >>> 0, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** A ZIP archive → Map(name → Buffer). Reads the central directory, so data descriptors are fine. */
export function unzip(archive) {
  let end = archive.length - 22;
  while (end >= 0 && archive.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error('This is not an .xlsx file (no ZIP directory found).');
  const count = archive.readUInt16LE(end + 10);
  let at = archive.readUInt32LE(end + 16);
  const files = new Map();
  for (let i = 0; i < count; i += 1) {
    if (archive.readUInt32LE(at) !== 0x02014b50) throw new Error('The .xlsx file is damaged (bad ZIP directory).');
    const method = archive.readUInt16LE(at + 10);
    const size = archive.readUInt32LE(at + 20);
    const nameLength = archive.readUInt16LE(at + 28);
    const extraLength = archive.readUInt16LE(at + 30);
    const commentLength = archive.readUInt16LE(at + 32);
    const localAt = archive.readUInt32LE(at + 42);
    const name = archive.toString('utf8', at + 46, at + 46 + nameLength);
    const dataAt = localAt + 30 + archive.readUInt16LE(localAt + 26) + archive.readUInt16LE(localAt + 28);
    const raw = archive.subarray(dataAt, dataAt + size);
    if (method === 0) files.set(name, Buffer.from(raw));
    else if (method === 8) files.set(name, inflateRawSync(raw));
    else throw new Error(`The .xlsx file uses an unsupported compression (${method}).`);
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

// --- Writing ----------------------------------------------------------------------------------------------------------

const xml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Characters XML 1.0 does not allow (control characters) would make Excel refuse the file.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const column = (index) => {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};

// Cell styles (index into cellXfs): 0 plain, 1 header, 2 read-only (grey, wrapped), 3 editable (yellow, wrapped).
const STYLES = { plain: 0, header: 1, readOnly: 2, editable: 3 };
const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="12"/><name val="Arial"/></font><font><b/><sz val="12"/><name val="Arial"/></font></fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE8E1D6"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF4F2EE"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF6D5"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFD9D2C7"/></left><right style="thin"><color rgb="FFD9D2C7"/></right><top style="thin"><color rgb="FFD9D2C7"/></top><bottom style="thin"><color rgb="FFD9D2C7"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/**
 * sheets: [{ name, columns: [{ title, width, editable?, choices? }], rows: string[][], plain?: boolean }]
 * `plain` sheets (a read-me) get no shading, filter or frozen header.
 */
export function writeWorkbook(sheets) {
  const parts = [];
  sheets.forEach((sheet, index) => {
    const lastColumn = column(sheet.columns.length - 1);
    const lastRow = sheet.rows.length + 1;
    const cell = (value, ref, style) =>
      value === '' || value === null || value === undefined
        ? `<c r="${ref}" s="${style}"/>`
        : `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    const header = sheet.columns.map((c, i) => cell(c.title, `${column(i)}1`, STYLES.header)).join('');
    const body = sheet.rows
      .map((row, r) =>
        `<row r="${r + 2}">${row
          .map((value, i) => {
            const style = sheet.plain ? STYLES.plain : sheet.columns[i].editable ? STYLES.editable : STYLES.readOnly;
            return cell(value, `${column(i)}${r + 2}`, style);
          })
          .join('')}</row>`,
      )
      .join('');
    const validations = sheet.columns
      .map((c, i) => (c.choices ? { c, i } : null))
      .filter(Boolean)
      .map(
        ({ c, i }) =>
          `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${column(i)}2:${column(i)}${Math.max(lastRow, 2)}"><formula1>"${xml(c.choices.join(','))}"</formula1></dataValidation>`,
      );
    parts.push({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"${index === 0 ? ' tabSelected="1"' : ''}>${sheet.plain ? '' : '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="16"/>
<cols>${sheet.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`).join('')}</cols>
<sheetData><row r="1">${header}</row>${body}</sheetData>
${sheet.plain ? '' : `<autoFilter ref="A1:${lastColumn}${lastRow}"/>`}
${validations.length ? `<dataValidations count="${validations.length}">${validations.join('')}</dataValidations>` : ''}
<pageMargins left="0.5" right="0.5" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
</worksheet>`),
    });
  });
  const sheetList = sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  const filters = sheets
    .map((s, i) =>
      s.plain
        ? ''
        : `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xml(s.name).replace(/'/g, "''")}'!$A$1:$${column(s.columns.length - 1)}$${s.rows.length + 1}</definedName>`,
    )
    .join('');
  const files = [
    {
      name: '[Content_Types].xml',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`),
    },
    {
      name: '_rels/.rels',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`),
    },
    {
      name: 'docProps/core.xml',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Favorite Hearts text</dc:title><dc:creator>Favorite Hearts</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`),
    },
    {
      name: 'docProps/app.xml',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Favorite Hearts</Application></Properties>`),
    },
    {
      name: 'xl/workbook.xml',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheetList}</sheets>${filters ? `<definedNames>${filters}</definedNames>` : ''}</workbook>`),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    },
    { name: 'xl/styles.xml', data: Buffer.from(stylesXml) },
    ...parts,
  ];
  return zip(files);
}

// --- Reading ----------------------------------------------------------------------------------------------------------

const unxml = (value) =>
  value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, entity) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[entity.toLowerCase()];
    if (named) return named;
    const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return String.fromCodePoint(code);
  });

/** The text of a string item: plain <t>, or rich text runs <r><t>…</t></r>; phonetic hints (<rPh>) are left out. */
const textOf = (fragment) =>
  unxml(
    [...fragment.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>|<(?:\w+:)?t\s*\/>/g)]
      .map((m) => m[1] ?? '')
      .join(''),
  );

const columnIndex = (ref) => [...ref.replace(/\d+$/, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** An .xlsx file → [{ name, rows: string[][] }], every cell as text, in sheet order. */
export function readWorkbook(buffer) {
  const files = unzip(buffer);
  const read = (name) => files.get(name)?.toString('utf8') ?? null;
  const workbook = read('xl/workbook.xml');
  if (!workbook) throw new Error('This .xlsx file has no workbook.');
  const relations = new Map(
    [...(read('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)].map((m) => [
      /\bId="([^"]+)"/.exec(m[0])?.[1],
      /\bTarget="([^"]+)"/.exec(m[0])?.[1],
    ]),
  );
  const shared = [...(read('xl/sharedStrings.xml') ?? '').matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => textOf(m[1]));
  return [...workbook.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)].map((m) => {
    const name = unxml(/\bname="([^"]*)"/.exec(m[0])?.[1] ?? '');
    const target = relations.get(/\br:id="([^"]+)"/.exec(m[0])?.[1]) ?? '';
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const sheet = read(path) ?? '';
    const rows = [];
    for (const row of sheet.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
      const number = Number(/\br="(\d+)"/.exec(row[1])?.[1] ?? rows.length + 1);
      const cells = [];
      let next = 0;
      for (const c of (row[2] ?? '').matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
        const ref = /\br="([A-Z]+\d+)"/.exec(c[1])?.[1];
        const index = ref ? columnIndex(ref) : next;
        next = index + 1;
        const type = /\bt="([^"]+)"/.exec(c[1])?.[1];
        const inner = c[2] ?? '';
        let value = '';
        if (type === 'inlineStr') value = textOf(/<(?:\w+:)?is>([\s\S]*?)<\/(?:\w+:)?is>/.exec(inner)?.[1] ?? '');
        else {
          const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner)?.[1];
          if (v !== undefined) value = type === 's' ? (shared[Number(v)] ?? '') : unxml(v);
        }
        cells[index] = value;
      }
      rows[number - 1] = Array.from(cells, (value) => value ?? '');
    }
    return { name, rows: Array.from(rows, (row) => row ?? []) };
  });
}
