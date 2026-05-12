/**
 * src/csv-mapper.js — Converts validated store JSON to CSV in any requested format.
 * Supports built-in presets (shopify, generic), .json preset files, and .csv template files.
 * Interactive approval flow (C6–C9) is added in Step 5; this module contains the core engine.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import { slugify } from './utils.js';
import { ask } from './prompt.js';
import { SYNONYMS, HIGH_CONFIDENCE_THRESHOLD, MEDIUM_CONFIDENCE_THRESHOLD, NO_SOURCE_DATA_FIELDS } from './csv-synonyms.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRESETS_DIR = path.join(__dirname, '..', 'presets');

// ─── Transforms ───────────────────────────────────────────────────────────────

/**
 * Applies a named transform to a value.
 * @param {*} value
 * @param {string} transformName
 * @returns {*}
 */
export function applyTransforms(value, transformName) {
  switch (transformName) {
    case 'slugify':
      return typeof value === 'string' ? slugify(value) : '';
    case 'join_comma':
      return Array.isArray(value) ? value.join(', ') : String(value ?? '');
    case 'join_semicolon':
      return Array.isArray(value) ? value.join(';') : String(value ?? '');
    case 'to_html_paragraph':
      return value ? `<p>${String(value)}</p>` : '';
    default:
      return value;
  }
}

// ─── Field resolution ─────────────────────────────────────────────────────────

/**
 * Resolves a dot-path field from a product object.
 * "variants.colors" → product.variants.colors
 * "images_cdn.0"    → product.images_cdn[0]
 * "store_name"      → storeMeta.name (virtual field)
 */
function resolveField(product, fieldPath, storeMeta) {
  if (!fieldPath) return null;
  if (fieldPath === 'store_name') return storeMeta?.name ?? '';

  const parts = fieldPath.split('.');
  let value = product;
  for (const part of parts) {
    if (value === null || value === undefined) return null;
    const idx = parseInt(part, 10);
    value = isNaN(idx) ? value[part] : value[idx];
  }
  return value ?? null;
}

/** Returns true if header name implies HTML content. */
function isHtmlHeader(header) {
  return /html/i.test(header);
}

/**
 * Applies a column config to produce a single cell value.
 * virtualFields overrides field resolution (used for per-row variant/image values).
 */
function applyColumn(col, product, storeMeta, virtualFields = {}) {
  if (col.skip) return '';
  if (col.static !== undefined) return String(col.static);

  let value = Object.prototype.hasOwnProperty.call(virtualFields, col.field)
    ? virtualFields[col.field]
    : resolveField(product, col.field, storeMeta);

  if (col.transform) {
    value = applyTransforms(value, col.transform);
  } else if (isHtmlHeader(col.header) && typeof value === 'string' && value) {
    value = applyTransforms(value, 'to_html_paragraph');
  }

  if (value === null || value === undefined || value === '') {
    return col.fallback !== undefined ? col.fallback : '';
  }
  return value;
}

// ─── Row strategies ───────────────────────────────────────────────────────────

function buildOneRowPerProduct(storeData, config) {
  return storeData.products.map(product => {
    const row = {};
    for (const col of config.columns) {
      row[col.header] = applyColumn(col, product, storeData.store_meta);
    }
    return row;
  });
}

function buildOneRowPerVariant(storeData, config) {
  const rows = [];

  // Find column headers for the fields we need to identify in sparse rows
  const handleCol   = config.columns.find(c => c.field === 'name' && c.transform === 'slugify');
  const handleHdr   = handleCol?.header ?? 'Handle';
  const imgSrcHdr   = config.columns.find(c => c.field === 'image_url_current')?.header;
  const imgPosHdr   = config.columns.find(c => c.field === 'image_position')?.header;
  const colorHdr    = config.columns.find(c => c.field === 'variant_color')?.header;
  const sizeHdr     = config.columns.find(c => c.field === 'variant_size')?.header;
  const priceCol    = config.columns.find(c => c.field === 'price');

  for (const product of storeData.products) {
    const handle = slugify(product.name);
    const colors  = product.variants?.colors?.length ? product.variants.colors : [null];
    const sizes   = product.variants?.sizes?.length  ? product.variants.sizes  : [null];
    const images  = product.images_cdn?.length ? product.images_cdn : (product.images_local ?? []);

    // Cartesian product: all color × size combinations
    const variants = [];
    for (const color of colors) {
      for (const size of sizes) {
        variants.push({ color, size });
      }
    }

    // Row 1: full product data + variant[0] + image[0]
    const v0 = variants[0] ?? { color: null, size: null };
    const virtual0 = {
      variant_color:     v0.color ?? '',
      variant_size:      v0.size ?? '',
      image_url_current: images[0] ?? '',
      image_position:    images.length > 0 ? 1 : ''
    };
    const firstRow = {};
    for (const col of config.columns) {
      firstRow[col.header] = applyColumn(col, product, storeData.store_meta, virtual0);
    }
    rows.push(firstRow);

    // Rows 2..N: sparse variant rows (Handle + option values + price only)
    for (let vi = 1; vi < variants.length; vi++) {
      const v = variants[vi];
      const sparseRow = {};
      for (const col of config.columns) {
        if (col.header === handleHdr) {
          sparseRow[col.header] = handle;
        } else if (colorHdr && col.header === colorHdr) {
          sparseRow[col.header] = v.color ?? '';
        } else if (sizeHdr && col.header === sizeHdr) {
          sparseRow[col.header] = v.size ?? '';
        } else if (priceCol && col.header === priceCol.header) {
          sparseRow[col.header] = product.price;
        } else {
          sparseRow[col.header] = '';
        }
      }
      rows.push(sparseRow);
    }

    // Rows N+1..M: sparse image rows (Handle + Image Src + Image Position only)
    for (let imgIdx = 1; imgIdx < images.length; imgIdx++) {
      const imgRow = {};
      for (const col of config.columns) {
        if (col.header === handleHdr) {
          imgRow[col.header] = handle;
        } else if (imgSrcHdr && col.header === imgSrcHdr) {
          imgRow[col.header] = images[imgIdx];
        } else if (imgPosHdr && col.header === imgPosHdr) {
          imgRow[col.header] = imgIdx + 1;
        } else {
          imgRow[col.header] = '';
        }
      }
      rows.push(imgRow);
    }
  }

  return rows;
}

/**
 * Applies a mapping config to store data and returns CSV rows as objects.
 * @param {object} storeData — validated store data
 * @param {object} mappingConfig — { row_strategy, columns }
 * @returns {object[]}
 */
export function applyMapping(storeData, mappingConfig) {
  if (mappingConfig.row_strategy === 'one_row_per_variant') {
    return buildOneRowPerVariant(storeData, mappingConfig);
  }
  return buildOneRowPerProduct(storeData, mappingConfig);
}

// ─── Preset loading ───────────────────────────────────────────────────────────

/**
 * Loads a built-in preset config by name.
 * @param {string} name — "shopify" | "generic"
 * @returns {object} preset config
 */
export function loadPreset(name) {
  const presetPath = path.join(PRESETS_DIR, `${name}.json`);
  if (!fs.existsSync(presetPath)) {
    throw new Error(`Unknown preset: "${name}"\nAvailable formats:\n  - shopify (built-in)\n  - generic (built-in)\n  - path to .json preset file\n  - path to .csv template file`);
  }
  return JSON.parse(fs.readFileSync(presetPath, 'utf8'));
}

// ─── Template loading ─────────────────────────────────────────────────────────

/**
 * Reads a CSV file and extracts its header row.
 * @param {string} filePath
 * @returns {{ headers: string[], originalContent: string }}
 */
export function loadTemplate(filePath) {
  let originalContent;
  try {
    originalContent = fs.readFileSync(filePath, 'utf8');
  } catch {
    throw new Error(
      `❌ Could not read template: ${filePath}\nVerify the file exists and is a valid CSV with a header row.`
    );
  }

  const result = Papa.parse(originalContent, { header: false });
  const headers = (result.data?.[0] ?? []).map(h => String(h).trim()).filter(Boolean);

  if (headers.length < 1) {
    throw new Error(
      `❌ Template has no detectable columns: ${filePath}\nThe template must have a header row with at least one column name.`
    );
  }

  return { headers, originalContent };
}

// ─── Fuzzy matching ───────────────────────────────────────────────────────────

function normalizeStr(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenOverlap(a, b) {
  const ta = new Set(a.split(' ').filter(Boolean));
  const tb = new Set(b.split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  const common = [...ta].filter(t => tb.has(t)).length;
  const total = new Set([...ta, ...tb]).size;
  return common / total;
}

function scoreVariant(nh, nv) {
  if (nh === nv) return 1.0;
  // Require contains match only when shorter string is ≥60% of longer by char count.
  // Prevents single-word variants (e.g. "vendor") from matching multi-word headers
  // that merely contain the word (e.g. "vendor code").
  const shorter = nh.length <= nv.length ? nh : nv;
  const longer  = nh.length <= nv.length ? nv : nh;
  if (longer.includes(shorter) && shorter.length / longer.length >= 0.6) return 0.85;
  return tokenOverlap(nh, nv);
}

/**
 * Fuzzy-matches template headers against the Shoprift synonym dictionary.
 * @param {string[]} templateHeaders
 * @param {object} [synonymDict] — defaults to SYNONYMS from csv-synonyms.js
 * @returns {{ matched: Map<string, string>, unmatched: string[], confidence: Map<string, number> }}
 */
export function matchHeaders(templateHeaders, synonymDict = SYNONYMS) {
  const matched    = new Map();
  const unmatched  = [];
  const confidence = new Map();

  for (const header of templateHeaders) {
    const nh = normalizeStr(header);
    let bestField = null;
    let bestScore = 0;

    for (const [field, variants] of Object.entries(synonymDict)) {
      for (const variant of variants) {
        const score = scoreVariant(nh, normalizeStr(variant));
        if (score > bestScore) {
          bestScore = score;
          bestField = field;
        }
      }
    }

    confidence.set(header, bestScore);
    if (bestScore >= MEDIUM_CONFIDENCE_THRESHOLD) {
      matched.set(header, bestField);
    } else {
      unmatched.push(header);
    }
  }

  return { matched, unmatched, confidence };
}

// ─── Mapping cache ────────────────────────────────────────────────────────────

function getCachePath(templatePath) {
  const resolved = path.resolve(templatePath);
  const dir  = path.dirname(resolved);
  const base = path.basename(resolved, path.extname(resolved));
  return path.join(dir, `${base}.matching.json`);
}

function md5(content) {
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Saves a resolved mapping config as a .matching.json sidecar next to the template.
 * @param {string} templatePath
 * @param {object} finalMapping — { row_strategy, columns }
 * @param {string} originalContent — raw template file content (for hash)
 */
export function saveMappingCache(templatePath, finalMapping, originalContent) {
  const cache = {
    template_path: templatePath,
    template_hash: md5(originalContent),
    resolved_at:   new Date().toISOString(),
    row_strategy:  finalMapping.row_strategy,
    columns:       finalMapping.columns
  };
  fs.writeFileSync(getCachePath(templatePath), JSON.stringify(cache, null, 2), 'utf8');
}

/**
 * Loads cached mapping if it exists.
 * @param {string} templatePath
 * @param {string} originalContent — current template file content (for hash comparison)
 * @returns {{ cache: object, hashMismatch: boolean } | null} null if no cache file
 */
export function loadMappingCache(templatePath, originalContent) {
  const cp = getCachePath(templatePath);
  if (!fs.existsSync(cp)) return null;

  let cache;
  try {
    cache = JSON.parse(fs.readFileSync(cp, 'utf8'));
  } catch {
    return null;
  }

  return { cache, hashMismatch: cache.template_hash !== md5(originalContent) };
}

// ─── Interactive approval flow (C6–C9) ───────────────────────────────────────

/** Ordered list of all matchable fields, derived from SYNONYMS. */
const AVAILABLE_FIELDS = Object.keys(SYNONYMS);

/** Builds the working mapping array from matchHeaders() output. */
function buildInitialMapping(matchResult, templateHeaders) {
  return templateHeaders.map(header => ({
    header,
    field:      matchResult.matched.get(header) ?? null,
    confidence: matchResult.confidence.get(header) ?? 0
  }));
}

/** Returns the display string for a column's field assignment. */
function fieldDisplay(item) {
  if (item.static !== undefined) return `(static: "${item.static}")`;
  if (item.skip) return '(skip)';
  if (!item.field) return '???';
  return NO_SOURCE_DATA_FIELDS.has(item.field) ? `${item.field} [no source data]` : item.field;
}

/** Returns the confidence label for a column. */
function confLabel(item) {
  if (item.static !== undefined) return '✓ set';
  if (item.skip) return '— skip';
  if (!item.field) return '✗ unmapped';
  if (item.confidence === undefined) return '✓ manual';
  return item.confidence >= HIGH_CONFIDENCE_THRESHOLD ? '✓ high' : '✓ medium';
}

/** Prints the approval summary table. */
function printTable(mapping, templatePath, detectedStrategy) {
  const colW   = Math.max(32, ...mapping.map(m => m.header.length + 2));
  const fieldW = Math.max(26, ...mapping.map(m => fieldDisplay(m).length + 2));

  console.log('');
  if (templatePath) console.log(`📋 Template: ${templatePath}`);
  if (detectedStrategy === 'one_row_per_variant') {
    console.log('⚙️  Detected Shopify-style template — using one-row-per-variant strategy.');
  }
  console.log('');
  console.log('Detected columns and matches:');
  console.log('');
  console.log(`  ${'Column'.padEnd(colW)} ${'Mapped to'.padEnd(fieldW)} Confidence`);
  console.log(`  ${'─'.repeat(colW)} ${'─'.repeat(fieldW)} ──────────`);

  let matched = 0, high = 0, medium = 0, unmatched = 0;
  for (const item of mapping) {
    console.log(`  ${item.header.padEnd(colW)} ${fieldDisplay(item).padEnd(fieldW)} ${confLabel(item)}`);
    if (item.field && !item.skip && item.static === undefined) {
      matched++;
      if ((item.confidence ?? 1) >= HIGH_CONFIDENCE_THRESHOLD) high++; else medium++;
    } else if (!item.field && !item.skip && item.static === undefined) {
      unmatched++;
    }
  }
  console.log('');
  console.log(`✓ ${matched} matched (${high} high, ${medium} medium)`);
  if (unmatched > 0) console.log(`✗ ${unmatched} unmapped — need your input`);
}

/** Edit mode: iterate every column, let user re-assign, skip, or set static. */
async function runEditMode(mapping) {
  const updated = mapping.map(item => ({ ...item }));

  for (let i = 0; i < updated.length; i++) {
    const item = updated[i];
    const current = fieldDisplay(item);
    console.log('');
    console.log(`Column: ${item.header}`);
    console.log(`Current mapping: ${current}`);
    console.log('');
    console.log(`1. Keep as "${current}"`);
    console.log('2. Change mapping to a different field');
    console.log('3. Skip this column (leave blank)');
    console.log('4. Use a static value');
    console.log('');

    const choice = await ask('Choice: ');

    if (choice === '2') {
      console.log('');
      console.log('Available fields:');
      AVAILABLE_FIELDS.forEach((f, j) => console.log(`  ${j + 1}. ${f}`));
      console.log('');
      const pick = await ask('Choose field number: ');
      const idx = parseInt(pick, 10) - 1;
      if (!isNaN(idx) && idx >= 0 && idx < AVAILABLE_FIELDS.length) {
        updated[i] = { header: item.header, field: AVAILABLE_FIELDS[idx] };
      }
      // else: keep current
    } else if (choice === '3') {
      updated[i] = { header: item.header, skip: true };
    } else if (choice === '4') {
      const val = await ask('Static value: ');
      updated[i] = { header: item.header, static: val };
    }
    // 1 or anything else: keep
  }

  return updated;
}

/** Prompts the user to resolve each unmapped column (field === null). */
async function resolveUnmatched(mapping) {
  const resolved = mapping.map(item => ({ ...item }));
  const needsResolution = resolved.filter(
    item => !item.field && !item.skip && item.static === undefined
  );

  for (const item of needsResolution) {
    const i = resolved.indexOf(item);
    console.log('');
    console.log(`Unmapped column: "${item.header}"`);
    console.log('');
    console.log('1. Skip (leave blank in output)');
    console.log('2. Map to an existing field');
    console.log('3. Set a static value for all rows');
    console.log('');

    const choice = await ask('Choice: ');

    if (choice === '2') {
      console.log('');
      console.log('Available fields:');
      AVAILABLE_FIELDS.forEach((f, j) => console.log(`  ${j + 1}. ${f}`));
      console.log('');
      const pick = await ask('Choose field number: ');
      const idx = parseInt(pick, 10) - 1;
      if (!isNaN(idx) && idx >= 0 && idx < AVAILABLE_FIELDS.length) {
        resolved[i] = { header: item.header, field: AVAILABLE_FIELDS[idx] };
      } else {
        resolved[i] = { header: item.header, skip: true };
      }
    } else if (choice === '3') {
      const val = await ask('Static value: ');
      resolved[i] = { header: item.header, static: val };
    } else {
      resolved[i] = { header: item.header, skip: true };
    }
  }

  return resolved;
}

/**
 * Full interactive approval flow.
 * Prints the match table, prompts y/e/c, handles unmatched resolution.
 * @param {object} matchResult — from matchHeaders()
 * @param {string[]} templateHeaders
 * @param {{ templatePath?: string, detectedStrategy?: string }} options
 * @returns {Promise<{ columns: object[] }>}
 */
export async function promptForApproval(matchResult, templateHeaders, options = {}) {
  let mapping = buildInitialMapping(matchResult, templateHeaders);

  while (true) {
    printTable(mapping, options.templatePath, options.detectedStrategy);
    const choice = await ask('Approve mapping? [y]es / [e]dit / [c]ancel: ');

    if (choice === 'y' || choice === 'yes') {
      const finalColumns = await resolveUnmatched(mapping);
      return { columns: finalColumns };
    } else if (choice === 'e' || choice === 'edit') {
      mapping = await runEditMode(mapping);
    } else if (choice === 'c' || choice === 'cancel') {
      console.log('Mapping cancelled. No CSV written. Edit the template and re-run.');
      const err = new Error('MAPPING_CANCELLED');
      err.isCancellation = true;
      throw err;
    }
    // invalid input: loop and show table again
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Converts validated store data to CSV in the requested format.
 * @param {object} storeData — validated store data (from store_data.json)
 * @param {string} formatArg — "shopify" | "generic" | "./path.csv" | "./path.json"
 * @param {{ autoApprove?: boolean }} options
 * @returns {Promise<{ csv: string, unmappedColumns: string[], formatName: string, rowCount: number }>}
 */
export async function mapToCsv(storeData, formatArg, options = {}) {
  let config;
  let unmappedColumns = [];

  if (formatArg === 'shopify' || formatArg === 'generic') {
    config = loadPreset(formatArg);

  } else if (!formatArg.endsWith('.csv') && !formatArg.endsWith('.json')) {
    throw new Error(
      `❌ Invalid format: "${formatArg}"\nAvailable formats:\n  - shopify (built-in)\n  - generic (built-in)\n  - path to .json preset file\n  - path to .csv template file`
    );

  } else if (formatArg.endsWith('.json')) {
    try {
      config = JSON.parse(fs.readFileSync(path.resolve(formatArg), 'utf8'));
    } catch {
      throw new Error(`❌ Could not read preset file: ${formatArg}`);
    }

  } else {
    // .csv template path
    const { headers, originalContent } = loadTemplate(formatArg);

    // Auto-detect Shopify-style layout (C10)
    const hasHandle  = headers.some(h => h.toLowerCase() === 'handle');
    const hasOption1 = headers.some(h => /option1\s*value/i.test(h));
    const detectedStrategy = (hasHandle && hasOption1) ? 'one_row_per_variant' : 'one_row_per_product';
    if (detectedStrategy === 'one_row_per_variant') {
      console.log('⚙️  Detected Shopify-style template — using one-row-per-variant strategy.');
    }

    const cached = loadMappingCache(formatArg, originalContent);

    if (cached && !cached.hashMismatch) {
      config = cached.cache;

    } else if (cached?.hashMismatch && options.autoApprove) {
      console.warn('⚠️  Template changed since last mapping — using cached mapping anyway (--auto-approve).');
      config = cached.cache;

    } else {
      if (options.autoApprove) {
        throw new Error(
          '❌ --auto-approve requires an existing .matching.json file. Run without it first to create one.'
        );
      }
      if (cached?.hashMismatch) {
        console.warn('⚠️  Template changed since last mapping — re-resolving.');
      }

      const matchResult = matchHeaders(headers);
      const approval = await promptForApproval(matchResult, headers, {
        templatePath: formatArg,
        detectedStrategy
      });
      config = { row_strategy: detectedStrategy, columns: approval.columns };
      saveMappingCache(formatArg, config, originalContent);
    }

    unmappedColumns = config.columns.filter(c => c.skip).map(c => c.header);
  }

  const rows = applyMapping(storeData, config);
  const csv  = Papa.unparse(rows, { header: true, newline: '\n' });

  // Columns matched to fields that Shoprift has no source data for (sku, weight, etc.)
  const noSourceColumns = (config.columns ?? [])
    .filter(c => !c.skip && c.static === undefined && NO_SOURCE_DATA_FIELDS.has(c.field))
    .map(c => c.header);

  return { csv, unmappedColumns, noSourceColumns, formatName: config.name ?? formatArg, rowCount: rows.length };
}
