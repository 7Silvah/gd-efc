/**
 * server/protocol.js — decrypt-server protocol (version 4), Express port.
 *
 * Faithful port of templates/worker.js.template + templates/decrypt.php.template.
 * Differences from the originals:
 * - The worker template called `this.apiRequest(...)` inside the standalone
 *   info() function (a latent TypeError); the PHP template called it correctly.
 *   This port uses the correct call in all paths.
 * - The encryption key comes from the EFC_KEY env var instead of being baked
 *   into generated files.
 */
import { encrypt, decrypt } from '../shared/crypto.js';

export const VERSION = 4;
const DRIVE_API = 'https://www.googleapis.com/drive/v3/';

function getKey() {
  const key = process.env.EFC_KEY;
  if (!key) {
    const err = Error('Server encryption key not configured (set EFC_KEY)');
    err.status = 501;
    throw err;
  }
  return key;
}

export const encode = (text) => encrypt(text, getKey());
export const decode = (encoded) => decrypt(encoded, getKey());

export function success(res, data, status = 200) {
  return res.status(status).json({ status: 'ok', data, version: VERSION });
}

export function fail(res, reason, status = 400) {
  return res.status(status).json({ status: 'error', reason: String(reason), version: VERSION });
}

function escapeRegEx(literal) {
  return literal.replace(/[-.*+?^${}()|[\]\\/]/g, '\\$&');
}

function censorSensitiveData(text, sensitive) {
  const escaped = sensitive.map(escapeRegEx).join('|');
  return String(text).replace(new RegExp('(?:' + escaped + ')', 'g'), '[censored]');
}

export async function driveRequest(auth, path, sensitive, options = {}) {
  const opt = { ...options };
  opt.headers = { ...(opt.headers || {}) };
  opt.headers.Authorization = opt.headers.Authorization || `Bearer ${auth}`;
  opt.headers.Accept = opt.headers.Accept || 'application/json';

  const result = await fetch(`${DRIVE_API}${path}`, opt);
  const text = await result.text();
  let responseData;
  try {
    responseData = JSON.parse(text);
  } catch {
    throw Error(censorSensitiveData(text, sensitive));
  }
  if (typeof responseData.error !== 'undefined') {
    throw Error(censorSensitiveData(responseData.error.message, sensitive));
  }
  return responseData;
}

export async function handleInfo(data) {
  if (!data || typeof data.folder !== 'string' || !data.folder) {
    throw Error('Missing folder');
  }
  const folderId = await decode(data.folder);

  const folderInfo = await driveRequest(
    data.auth,
    `files/${folderId}?supportsAllDrives=true&fields=name,mimeType,shortcutDetails/*`,
    [folderId]
  );

  let folderContents;
  if (folderInfo.mimeType === 'application/vnd.google-apps.folder') {
    folderContents = await driveRequest(
      data.auth,
      `files?q="${folderId}"+in+parents`
      + '&fields=nextPageToken,files(id,size,name,mimeType,md5Checksum,shortcutDetails/*)'
      + '&orderBy=name_natural&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=100'
      + (typeof data.pageToken !== 'undefined' ? `&pageToken=${data.pageToken}` : ''),
      [folderId]
    );
  } else if (folderInfo.mimeType === 'application/vnd.google-apps.shortcut') {
    folderContents = {
      files: [{
        notLoaded: true,
        id: folderInfo.shortcutDetails.targetId,
        mimeType: folderInfo.shortcutDetails.targetMimeType,
        name: folderInfo.name,
      }],
    };
    delete folderInfo.shortcutDetails;
  } else {
    folderContents = {
      files: [{
        notLoaded: true,
        id: folderId,
        mimeType: folderInfo.mimeType,
        name: folderInfo.name,
      }],
    };
  }
  delete folderInfo.mimeType;

  const files = [];
  for (const file of folderContents.files) {
    if (file.mimeType === 'application/vnd.google-apps.shortcut') {
      file.notLoaded = true;
      file.id = file.shortcutDetails.targetId;
      file.mimeType = file.shortcutDetails.targetMimeType;
    }

    let fileInfo;
    if (file.notLoaded === true) {
      // ignore shortcuts to folders
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        continue;
      }
      fileInfo = await driveRequest(
        data.auth,
        `files/${file.id}?supportsAllDrives=true&fields=size,md5Checksum`,
        [file.id]
      );
      fileInfo.id = file.id;
      fileInfo.mimeType = file.mimeType;
      fileInfo.name = file.name;
    } else {
      fileInfo = file;
    }

    fileInfo.id = await encode(fileInfo.id);
    files.push(fileInfo);
  }

  folderContents.files = files;
  return Object.assign(folderContents, folderInfo);
}

async function cloneOne(auth, fileId, folder) {
  return driveRequest(
    auth,
    `files/${fileId}/copy?supportsAllDrives=true`,
    [fileId],
    {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({
        parents: [folder],
        appProperties: { createdWithDdEfc: 1 },
      }),
    }
  );
}

export async function handleClone(data) {
  if (!data || !Array.isArray(data.files)) {
    throw Error('Missing files');
  }
  const result = [];
  for (const id of data.files) {
    const realId = await decode(id);
    const cloneResult = await cloneOne(data.auth, realId, data.destination);
    result.push({ id, data: cloneResult });
  }
  return result;
}
